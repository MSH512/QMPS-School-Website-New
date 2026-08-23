import { auth, db, uploadToCloudinary } from "./firebase-config.js";
import {
  signInWithEmailAndPassword, onAuthStateChanged, signOut,
  sendPasswordResetEmail, getAuth, createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { sha256Hex } from "./auth-utils.js";

// A second, independent Firebase app instance is used only for creating
// teacher logins, so that doing so never signs the admin out of their
// own session (a quirk of the client-side Firebase Auth SDK).
import { initializeApp as initSecondaryApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function fmtDate(v) {
  if (!v) return "—";
  const d = v.toDate ? v.toDate() : new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ---------------------------- Auth gate ---------------------------- */
const loginScreen = document.getElementById("loginScreen");
const adminShell = document.getElementById("adminShell");
const loginForm = document.getElementById("adminLoginForm");
const loginMsg = document.getElementById("loginMsg");
const loginBtn = document.getElementById("loginBtn");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginBtn.disabled = true; loginBtn.textContent = "Logging in...";
  loginMsg.className = "form-msg";
  try {
    await signInWithEmailAndPassword(auth, document.getElementById("aemail").value.trim(), document.getElementById("apass").value);
  } catch (err) {
    loginMsg.textContent = "Login failed. Check the email and password.";
    loginMsg.classList.add("show", "error");
  } finally {
    loginBtn.disabled = false; loginBtn.textContent = "Log In";
  }
});
document.getElementById("logoutBtn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.style.display = "none";
    adminShell.style.display = "grid";
    loadDashboardStats();
  } else {
    loginScreen.style.display = "flex";
    adminShell.style.display = "none";
  }
});

/* ---------------------------- Panel switching ---------------------------- */
const panelTitles = {
  dashboard: "Dashboard", news: "News & Notices", events: "Events", achievements: "Achievements",
  gallery: "Gallery", students: "Students", teachers: "Teachers", results: "Results",
  admissions: "Admissions", jobs: "Job Applications", messages: "Contact Messages", settings: "Site Settings"
};
const loaders = {}; // filled in below, one per panel

document.getElementById("adminNav").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-panel]");
  if (!btn) return;
  document.querySelectorAll("#adminNav button").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("panel-" + btn.dataset.panel).classList.add("active");
  document.getElementById("panelTitle").textContent = panelTitles[btn.dataset.panel];
  loaders[btn.dataset.panel]?.();
});

/* ---------------------------- Modal helpers ---------------------------- */
const modalBackdrop = document.getElementById("modalBackdrop");
const modalContent = document.getElementById("modalContent");
function openModal(html) { modalContent.innerHTML = html; modalBackdrop.classList.add("open"); }
function closeModal() { modalBackdrop.classList.remove("open"); modalContent.innerHTML = ""; }
modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeModal(); });

/* ---------------------------- Dashboard stats ---------------------------- */
async function loadDashboardStats() {
  const row = document.getElementById("statRow");
  row.innerHTML = `<div class="loader"><span class="spinner"></span> Loading stats&hellip;</div>`;
  try {
    const [students, teachers, admissions, messages] = await Promise.all([
      getDocs(collection(db, "students")),
      getDocs(collection(db, "teachers")),
      getDocs(query(collection(db, "admissions"), where("status", "==", "pending"))),
      getDocs(query(collection(db, "messages"), where("read", "==", false)))
    ]);
    row.innerHTML = `
      <div class="stat-box"><b>${students.size}</b><span>Students enrolled</span></div>
      <div class="stat-box"><b>${teachers.size}</b><span>Teachers</span></div>
      <div class="stat-box"><b>${admissions.size}</b><span>Pending admissions</span></div>
      <div class="stat-box"><b>${messages.size}</b><span>Unread messages</span></div>`;
  } catch {
    row.innerHTML = `<div class="empty-state">Connect Firebase (see README) to see live stats.</div>`;
  }
}

/* =========================================================
   NEWS & NOTICES
   ========================================================= */
async function loadNews() {
  const tbody = document.getElementById("newsTable");
  tbody.innerHTML = `<tr><td colspan="4">Loading&hellip;</td></tr>`;
  const snap = await getDocs(query(collection(db, "news"), orderBy("date", "desc")));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="4">No news or notices yet.</td></tr>`; return; }
  tbody.innerHTML = snap.docs.map((d) => {
    const n = d.data();
    return `<tr>
      <td>${esc(n.title)}</td>
      <td><span class="pill">${esc(n.category)}</span></td>
      <td>${fmtDate(n.date)}</td>
      <td class="table-actions">
        <button class="link-btn" data-edit="${d.id}">Edit</button>
        <button class="link-btn danger" data-del="${d.id}">Delete</button>
      </td></tr>`;
  }).join("");
  tbody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => newsForm(b.dataset.edit)));
  tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => confirmDelete("news", b.dataset.del, loadNews)));
}
document.getElementById("addNewsBtn").addEventListener("click", () => newsForm());

async function newsForm(id) {
  let data = { title: "", category: "news", body: "", date: new Date().toISOString().slice(0, 10), imageUrl: "" };
  if (id) { const s = await getDoc(doc(db, "news", id)); data = { ...data, ...s.data(), date: (s.data().date?.toDate?.() || new Date(s.data().date)).toISOString().slice(0, 10) }; }
  openModal(`
    <h3>${id ? "Edit" : "Add"} News / Notice</h3>
    <form id="entityForm">
      <div class="field"><label>Title *</label><input id="f-title" value="${esc(data.title)}" required></div>
      <div class="form-grid">
        <div class="field"><label>Category *</label><select id="f-category"><option value="news" ${data.category === "news" ? "selected" : ""}>News</option><option value="notice" ${data.category === "notice" ? "selected" : ""}>Notice</option></select></div>
        <div class="field"><label>Date *</label><input type="date" id="f-date" value="${data.date}" required></div>
      </div>
      <div class="field"><label>Details *</label><textarea id="f-body" required>${esc(data.body)}</textarea></div>
      <div class="field"><label>Image (optional)</label><input type="file" id="f-image" accept="image/*"></div>
      <div class="form-msg" id="fMsg"></div>
      <div style="display:flex; gap:10px;"><button type="submit" class="btn btn-primary">Save</button><button type="button" class="btn btn-outline" style="border-color:var(--line); color:var(--navy-900);" id="cancelBtn">Cancel</button></div>
    </form>`);
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("entityForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveWithOptionalImage("news", id, {
      title: document.getElementById("f-title").value,
      category: document.getElementById("f-category").value,
      body: document.getElementById("f-body").value,
      date: Timestamp.fromDate(new Date(document.getElementById("f-date").value)),
      imageUrl: data.imageUrl || ""
    }, document.getElementById("f-image").files[0], loadNews);
  });
}
loaders.news = loadNews;

/* =========================================================
   EVENTS
   ========================================================= */
async function loadEvents() {
  const tbody = document.getElementById("eventsTable");
  tbody.innerHTML = `<tr><td colspan="4">Loading&hellip;</td></tr>`;
  const snap = await getDocs(query(collection(db, "events"), orderBy("date", "desc")));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="4">No events yet.</td></tr>`; return; }
  tbody.innerHTML = snap.docs.map((d) => {
    const ev = d.data();
    return `<tr><td>${esc(ev.title)}</td><td>${esc(ev.location)}</td><td>${fmtDate(ev.date)}</td>
      <td class="table-actions"><button class="link-btn" data-edit="${d.id}">Edit</button><button class="link-btn danger" data-del="${d.id}">Delete</button></td></tr>`;
  }).join("");
  tbody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => eventForm(b.dataset.edit)));
  tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => confirmDelete("events", b.dataset.del, loadEvents)));
}
document.getElementById("addEventBtn").addEventListener("click", () => eventForm());

async function eventForm(id) {
  let data = { title: "", location: "", description: "", date: new Date().toISOString().slice(0, 10), imageUrl: "" };
  if (id) { const s = await getDoc(doc(db, "events", id)); data = { ...data, ...s.data(), date: (s.data().date?.toDate?.() || new Date(s.data().date)).toISOString().slice(0, 10) }; }
  openModal(`
    <h3>${id ? "Edit" : "Add"} Event</h3>
    <form id="entityForm">
      <div class="field"><label>Title *</label><input id="f-title" value="${esc(data.title)}" required></div>
      <div class="form-grid">
        <div class="field"><label>Location *</label><input id="f-location" value="${esc(data.location)}" required></div>
        <div class="field"><label>Date *</label><input type="date" id="f-date" value="${data.date}" required></div>
      </div>
      <div class="field"><label>Description *</label><textarea id="f-desc" required>${esc(data.description)}</textarea></div>
      <div class="field"><label>Image (optional)</label><input type="file" id="f-image" accept="image/*"></div>
      <div style="display:flex; gap:10px;"><button type="submit" class="btn btn-primary">Save</button><button type="button" class="btn btn-outline" style="border-color:var(--line); color:var(--navy-900);" id="cancelBtn">Cancel</button></div>
    </form>`);
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("entityForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveWithOptionalImage("events", id, {
      title: document.getElementById("f-title").value,
      location: document.getElementById("f-location").value,
      description: document.getElementById("f-desc").value,
      date: Timestamp.fromDate(new Date(document.getElementById("f-date").value)),
      imageUrl: data.imageUrl || ""
    }, document.getElementById("f-image").files[0], loadEvents);
  });
}
loaders.events = loadEvents;

/* =========================================================
   ACHIEVEMENTS
   ========================================================= */
async function loadAch() {
  const tbody = document.getElementById("achTable");
  tbody.innerHTML = `<tr><td colspan="4">Loading&hellip;</td></tr>`;
  const snap = await getDocs(query(collection(db, "achievements"), orderBy("date", "desc")));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="4">No achievements yet.</td></tr>`; return; }
  tbody.innerHTML = snap.docs.map((d) => {
    const a = d.data();
    return `<tr><td>${esc(a.title)}</td><td>${esc(a.studentName)}</td><td>${fmtDate(a.date)}</td>
      <td class="table-actions"><button class="link-btn" data-edit="${d.id}">Edit</button><button class="link-btn danger" data-del="${d.id}">Delete</button></td></tr>`;
  }).join("");
  tbody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => achForm(b.dataset.edit)));
  tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => confirmDelete("achievements", b.dataset.del, loadAch)));
}
document.getElementById("addAchBtn").addEventListener("click", () => achForm());

async function achForm(id) {
  let data = { title: "", studentName: "", description: "", date: new Date().toISOString().slice(0, 10), imageUrl: "" };
  if (id) { const s = await getDoc(doc(db, "achievements", id)); data = { ...data, ...s.data(), date: (s.data().date?.toDate?.() || new Date(s.data().date)).toISOString().slice(0, 10) }; }
  openModal(`
    <h3>${id ? "Edit" : "Add"} Achievement</h3>
    <form id="entityForm">
      <div class="field"><label>Title *</label><input id="f-title" value="${esc(data.title)}" required></div>
      <div class="form-grid">
        <div class="field"><label>Student / Team name *</label><input id="f-student" value="${esc(data.studentName)}" required></div>
        <div class="field"><label>Date *</label><input type="date" id="f-date" value="${data.date}" required></div>
      </div>
      <div class="field"><label>What did they achieve? *</label><textarea id="f-desc" required>${esc(data.description)}</textarea></div>
      <div class="field"><label>Image (optional)</label><input type="file" id="f-image" accept="image/*"></div>
      <div style="display:flex; gap:10px;"><button type="submit" class="btn btn-primary">Save</button><button type="button" class="btn btn-outline" style="border-color:var(--line); color:var(--navy-900);" id="cancelBtn">Cancel</button></div>
    </form>`);
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("entityForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveWithOptionalImage("achievements", id, {
      title: document.getElementById("f-title").value,
      studentName: document.getElementById("f-student").value,
      description: document.getElementById("f-desc").value,
      date: Timestamp.fromDate(new Date(document.getElementById("f-date").value)),
      imageUrl: data.imageUrl || ""
    }, document.getElementById("f-image").files[0], loadAch);
  });
}
loaders.achievements = loadAch;

/* =========================================================
   GALLERY
   ========================================================= */
async function loadGallery() {
  const tbody = document.getElementById("galleryTable");
  tbody.innerHTML = `<tr><td colspan="4">Loading&hellip;</td></tr>`;
  const snap = await getDocs(query(collection(db, "gallery"), orderBy("date", "desc")));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="4">No gallery items yet.</td></tr>`; return; }
  tbody.innerHTML = snap.docs.map((d) => {
    const g = d.data();
    return `<tr><td><span class="pill">${esc(g.type)}</span></td><td>${esc(g.caption)}</td><td>${fmtDate(g.date)}</td>
      <td class="table-actions"><button class="link-btn danger" data-del="${d.id}">Delete</button></td></tr>`;
  }).join("");
  tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => confirmDelete("gallery", b.dataset.del, loadGallery)));
}
// Pulls the video ID out of any common YouTube URL shape
// (watch?v=, youtu.be/, /shorts/, /embed/) so we can build a thumbnail
// and a clean watch link without needing any file upload.
function extractYouTubeId(url) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function galleryTypeFields(type) {
  return type === "video"
    ? `<div class="field" id="fileField"><label>YouTube link *</label><input id="f-yturl" placeholder="https://youtube.com/watch?v=..." required>
       <p class="hint">Upload the video to YouTube first (as Public or Unlisted), then paste its link here — no file upload needed.</p></div>`
    : `<div class="field" id="fileField"><label>Photo file *</label><input type="file" id="f-file" accept="image/*" required></div>`;
}

document.getElementById("addGalleryBtn").addEventListener("click", () => {
  openModal(`
    <h3>Add Photo / Video</h3>
    <form id="entityForm">
      <div class="field"><label>Type *</label><select id="f-type"><option value="photo">Photo</option><option value="video">Video (YouTube link)</option></select></div>
      <div class="field"><label>Caption *</label><input id="f-caption" required></div>
      <div id="fieldWrap">${galleryTypeFields("photo")}</div>
      <div class="form-msg" id="fMsg"></div>
      <div style="display:flex; gap:10px;"><button type="submit" class="btn btn-primary" id="saveBtn">Save</button><button type="button" class="btn btn-outline" style="border-color:var(--line); color:var(--navy-900);" id="cancelBtn">Cancel</button></div>
    </form>`);
  const typeSel = document.getElementById("f-type");
  const fieldWrap = document.getElementById("fieldWrap");
  typeSel.addEventListener("change", () => { fieldWrap.innerHTML = galleryTypeFields(typeSel.value); });
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("entityForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("saveBtn");
    const msgEl = document.getElementById("fMsg");
    btn.disabled = true; btn.textContent = "Saving...";
    try {
      const type = typeSel.value;
      const caption = document.getElementById("f-caption").value;
      if (type === "video") {
        const ytUrl = document.getElementById("f-yturl").value.trim();
        const vid = extractYouTubeId(ytUrl);
        if (!vid) throw new Error("bad-youtube-url");
        await addDoc(collection(db, "gallery"), {
          type, caption,
          url: `https://www.youtube.com/watch?v=${vid}`,
          thumbnailUrl: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
          date: serverTimestamp()
        });
      } else {
        const url = await uploadToCloudinary(document.getElementById("f-file").files[0]);
        await addDoc(collection(db, "gallery"), { type, caption, url, date: serverTimestamp() });
      }
      closeModal(); loadGallery();
    } catch (err) {
      msgEl.textContent = err.message === "bad-youtube-url"
        ? "That doesn't look like a valid YouTube link. Copy it directly from YouTube's address bar or Share button."
        : "Could not save — check your Cloudinary settings in firebase-config.js.";
      msgEl.className = "form-msg show error";
      btn.disabled = false; btn.textContent = "Save";
    }
  });
});
loaders.gallery = loadGallery;

/* =========================================================
   Shared save helper (with optional image upload)
   ========================================================= */
async function saveWithOptionalImage(coll, id, fields, file, reload) {
  const msgEl = document.getElementById("fMsg");
  try {
    if (file) fields.imageUrl = await uploadToCloudinary(file);
    if (id) await updateDoc(doc(db, coll, id), fields);
    else await addDoc(collection(db, coll), fields);
    closeModal();
    reload();
    loadDashboardStats();
  } catch (err) {
    if (msgEl) { msgEl.textContent = "Could not save. Please try again."; msgEl.className = "form-msg show error"; }
  }
}
async function confirmDelete(coll, id, reload) {
  if (!confirm("Delete this item? This cannot be undone.")) return;
  await deleteDoc(doc(db, coll, id));
  reload();
  loadDashboardStats();
}

/* =========================================================
   STUDENTS
   ========================================================= */
const CLASS_CODES = { "Playgroup": "PG", "Nursery": "NUR", "Prep": "PREP", "Grade 1": "1", "Grade 2": "2", "Grade 3": "3", "Grade 4": "4", "Grade 5": "5", "Grade 6": "6", "Grade 7": "7" };

async function loadStudents() {
  const tbody = document.getElementById("studentsTable");
  tbody.innerHTML = `<tr><td colspan="5">Loading&hellip;</td></tr>`;
  const snap = await getDocs(collection(db, "students"));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="5">No students added yet.</td></tr>`; return; }
  tbody.innerHTML = snap.docs.map((d) => {
    const s = d.data();
    return `<tr><td style="font-family:var(--font-mono);">${esc(d.id)}</td><td>${esc(s.name)}</td><td>${esc(s.class)}</td><td>${esc(s.rollNo)}</td>
      <td class="table-actions">
        <button class="link-btn" data-edit="${d.id}">Edit</button>
        <button class="link-btn" data-reset="${d.id}">Reset Password</button>
        <button class="link-btn danger" data-del="${d.id}">Delete</button>
      </td></tr>`;
  }).join("");
  tbody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => studentForm(b.dataset.edit)));
  tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => confirmDelete("students", b.dataset.del, loadStudents)));
  tbody.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", () => resetStudentPassword(b.dataset.reset)));
}
document.getElementById("addStudentBtn").addEventListener("click", () => studentForm());

async function resetStudentPassword(sid) {
  const newPass = prompt(`Set a new password for ${sid}:`);
  if (!newPass) return;
  await setDoc(doc(db, "studentCredentials", sid), { passwordHash: await sha256Hex(newPass) });
  alert("Password updated. Share it with the student/parent directly.");
}

async function studentForm(sid) {
  let data = { name: "", fatherName: "", class: "Grade 1", dob: "", parentContact: "", rollNo: "" };
  let isEdit = !!sid;
  if (sid) {
    const s = await getDoc(doc(db, "students", sid));
    const priv = await getDoc(doc(db, "studentPrivate", sid));
    data = { ...data, ...s.data(), parentContact: priv.data()?.parentContact || "" };
  }

  const classOptions = Object.keys(CLASS_CODES).map((c) => `<option ${data.class === c ? "selected" : ""}>${c}</option>`).join("");
  openModal(`
    <h3>${isEdit ? "Edit" : "Add"} Student</h3>
    <form id="entityForm">
      <div class="form-grid">
        <div class="field"><label>Full name *</label><input id="f-name" value="${esc(data.name)}" required></div>
        <div class="field"><label>Father's name *</label><input id="f-father" value="${esc(data.fatherName)}" required></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Class *</label><select id="f-class" ${isEdit ? "disabled" : ""}>${classOptions}</select></div>
        <div class="field"><label>Date of birth</label><input type="date" id="f-dob" value="${data.dob}"></div>
      </div>
      <div class="field"><label>Parent contact number *</label><input id="f-contact" value="${esc(data.parentContact)}" required></div>
      ${!isEdit ? `<div class="field"><label>Set initial password *</label><input id="f-password" required></div>` : ""}
      <p class="hint mb-0" style="margin-bottom:14px;">${isEdit ? `Student ID: <strong style="font-family:var(--font-mono);">${sid}</strong>` : "Student ID and roll number are generated automatically once you save."}</p>
      <div class="form-msg" id="fMsg"></div>
      <div style="display:flex; gap:10px;"><button type="submit" class="btn btn-primary">Save</button><button type="button" class="btn btn-outline" style="border-color:var(--line); color:var(--navy-900);" id="cancelBtn">Cancel</button></div>
    </form>`);
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("entityForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById("fMsg");
    const payload = {
      name: document.getElementById("f-name").value,
      fatherName: document.getElementById("f-father").value,
      class: isEdit ? data.class : document.getElementById("f-class").value,
      dob: document.getElementById("f-dob").value
    };
    const parentContact = document.getElementById("f-contact").value;
    try {
      if (isEdit) {
        await updateDoc(doc(db, "students", sid), payload);
        await setDoc(doc(db, "studentPrivate", sid), { parentContact }, { merge: true });
      } else {
        const cls = payload.class;
        const code = CLASS_CODES[cls];
        const year = new Date().getFullYear().toString().slice(-2);
        // Count existing students in this class to generate the next roll/ID number
        const existing = await getDocs(query(collection(db, "students"), where("class", "==", cls)));
        const seq = String(existing.size + 1).padStart(3, "0");
        const newId = `QMPS-${year}-${code}-${code}${seq}`;
        payload.rollNo = `${code}${seq}`;
        await setDoc(doc(db, "students", newId), payload);
        await setDoc(doc(db, "studentPrivate", newId), { parentContact });
        await setDoc(doc(db, "studentCredentials", newId), { passwordHash: await sha256Hex(document.getElementById("f-password").value) });
      }
      closeModal(); loadStudents(); loadDashboardStats();
    } catch (err) {
      msgEl.textContent = "Could not save student. Please try again.";
      msgEl.className = "form-msg show error";
    }
  });
}
loaders.students = loadStudents;

/* =========================================================
   TEACHERS
   ========================================================= */
async function loadTeachers() {
  const tbody = document.getElementById("teachersTable");
  tbody.innerHTML = `<tr><td colspan="5">Loading&hellip;</td></tr>`;
  const snap = await getDocs(collection(db, "teachers"));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="5">No teachers added yet.</td></tr>`; return; }
  tbody.innerHTML = snap.docs.map((d) => {
    const t = d.data();
    return `<tr><td>${esc(t.name)}</td><td>${esc(t.email)}</td><td>${esc(t.subject)}</td><td>${esc((t.assignedClasses || []).join(", "))}</td>
      <td class="table-actions">
        <button class="link-btn" data-edit="${d.id}">Edit</button>
        <button class="link-btn" data-reset="${esc(t.email)}">Send Password Reset</button>
        <button class="link-btn danger" data-del="${d.id}">Remove</button>
      </td></tr>`;
  }).join("");
  tbody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => teacherForm(b.dataset.edit)));
  tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => confirmDelete("teachers", b.dataset.del, loadTeachers)));
  tbody.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", async () => {
    await sendPasswordResetEmail(auth, b.dataset.reset);
    alert("Password reset email sent to " + b.dataset.reset);
  }));
}
document.getElementById("addTeacherBtn").addEventListener("click", () => teacherForm());

async function teacherForm(id) {
  let data = { name: "", email: "", subject: "", assignedClasses: [] };
  let isEdit = !!id;
  if (id) { const s = await getDoc(doc(db, "teachers", id)); data = { ...data, ...s.data() }; }
  openModal(`
    <h3>${isEdit ? "Edit" : "Add"} Teacher</h3>
    <form id="entityForm">
      <div class="field"><label>Full name *</label><input id="f-name" value="${esc(data.name)}" required></div>
      <div class="field"><label>Email *</label><input type="email" id="f-email" value="${esc(data.email)}" ${isEdit ? "disabled" : ""} required></div>
      ${!isEdit ? `<div class="field"><label>Set initial password *</label><input id="f-password" required minlength="6"></div>` : ""}
      <div class="field"><label>Subject</label><input id="f-subject" value="${esc(data.subject)}"></div>
      <div class="field"><label>Assigned classes (comma-separated)</label><input id="f-classes" value="${esc((data.assignedClasses || []).join(", "))}" placeholder="e.g. Grade 5, Grade 6"></div>
      <div class="form-msg" id="fMsg"></div>
      <div style="display:flex; gap:10px;"><button type="submit" class="btn btn-primary" id="saveBtn">Save</button><button type="button" class="btn btn-outline" style="border-color:var(--line); color:var(--navy-900);" id="cancelBtn">Cancel</button></div>
    </form>`);
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("entityForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById("fMsg");
    const saveBtn = document.getElementById("saveBtn");
    saveBtn.disabled = true; saveBtn.textContent = "Saving...";
    const payload = {
      name: document.getElementById("f-name").value,
      email: document.getElementById("f-email").value,
      subject: document.getElementById("f-subject").value,
      assignedClasses: document.getElementById("f-classes").value.split(",").map((s) => s.trim()).filter(Boolean)
    };
    try {
      if (isEdit) {
        await updateDoc(doc(db, "teachers", id), payload);
      } else {
        // Create the login via a secondary Firebase app so the admin stays signed in
        const secondary = initSecondaryApp(auth.app.options, "secondary-" + Date.now());
        const secondaryAuth = getAuth(secondary);
        const cred = await createUserWithEmailAndPassword(secondaryAuth, payload.email, document.getElementById("f-password").value);
        payload.uid = cred.user.uid;
        await setDoc(doc(db, "teachers", cred.user.uid), payload);
        await signOut(secondaryAuth);
      }
      closeModal(); loadTeachers(); loadDashboardStats();
    } catch (err) {
      msgEl.textContent = err.code === "auth/email-already-in-use" ? "This email is already registered." : "Could not save teacher. Please try again.";
      msgEl.className = "form-msg show error";
      saveBtn.disabled = false; saveBtn.textContent = "Save";
    }
  });
}
loaders.teachers = loadTeachers;

/* =========================================================
   RESULTS
   ========================================================= */
async function loadResults() {
  const tbody = document.getElementById("resultsTable");
  tbody.innerHTML = `<tr><td colspan="5">Loading&hellip;</td></tr>`;
  const snap = await getDocs(query(collection(db, "results"), orderBy("date", "desc")));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="5">No results uploaded yet.</td></tr>`; return; }
  tbody.innerHTML = snap.docs.map((d) => {
    const r = d.data();
    return `<tr><td style="font-family:var(--font-mono);">${esc(r.studentId)}</td><td>${esc(r.examTitle)}</td><td>${esc(r.percentage)}%</td><td>${esc(r.grade)}</td>
      <td class="table-actions"><button class="link-btn danger" data-del="${d.id}">Delete</button></td></tr>`;
  }).join("");
  tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => confirmDelete("results", b.dataset.del, loadResults)));
}
document.getElementById("addResultBtn").addEventListener("click", () => resultForm());

function gradeFor(pct) {
  if (pct >= 90) return "A+"; if (pct >= 80) return "A"; if (pct >= 70) return "B";
  if (pct >= 60) return "C"; if (pct >= 50) return "D"; return "F";
}

async function resultForm() {
  openModal(`
    <h3>Add Result</h3>
    <form id="entityForm">
      <div class="form-grid">
        <div class="field"><label>Student ID *</label><input id="f-sid" placeholder="QMPS-26-7-7001" required style="font-family:var(--font-mono);"></div>
        <div class="field"><label>Exam title *</label><input id="f-exam" placeholder="Mid-Term 2026" required></div>
      </div>
      <p class="hint" id="lookupMsg">Enter a Student ID and click "Look up" to fetch their name and class.</p>
      <button type="button" class="btn btn-outline btn-sm" style="border-color:var(--line); color:var(--navy-900); margin-bottom:16px;" id="lookupBtn">Look up student</button>
      <div id="subjectRows"></div>
      <button type="button" class="btn btn-outline btn-sm" style="border-color:var(--line); color:var(--navy-900); margin:10px 0 16px;" id="addRowBtn">+ Add subject</button>
      <div class="field"><label>Remarks</label><textarea id="f-remarks"></textarea></div>
      <div class="form-msg" id="fMsg"></div>
      <div style="display:flex; gap:10px;"><button type="submit" class="btn btn-primary" id="saveBtn">Save Result</button><button type="button" class="btn btn-outline" style="border-color:var(--line); color:var(--navy-900);" id="cancelBtn">Cancel</button></div>
    </form>`);

  let studentInfo = null;
  const rowsEl = document.getElementById("subjectRows");
  function addSubjectRow() {
    const row = document.createElement("div");
    row.className = "form-grid";
    row.style.marginBottom = "8px";
    row.innerHTML = `
      <div class="field mb-0"><input placeholder="Subject name" class="subj-name"></div>
      <div class="field mb-0" style="display:flex; gap:8px;">
        <input placeholder="Total marks" type="number" class="subj-total" style="width:50%;">
        <input placeholder="Obtained" type="number" class="subj-obtained" style="width:50%;">
      </div>`;
    rowsEl.appendChild(row);
  }
  addSubjectRow(); addSubjectRow(); addSubjectRow();
  document.getElementById("addRowBtn").addEventListener("click", addSubjectRow);

  document.getElementById("lookupBtn").addEventListener("click", async () => {
    const sid = document.getElementById("f-sid").value.trim().toUpperCase();
    const lookupMsg = document.getElementById("lookupMsg");
    const s = await getDoc(doc(db, "students", sid));
    if (s.exists()) {
      studentInfo = s.data();
      lookupMsg.textContent = `Found: ${studentInfo.name}, Father: ${studentInfo.fatherName}, Class: ${studentInfo.class}`;
    } else {
      studentInfo = null;
      lookupMsg.textContent = "No student found with that ID.";
    }
  });

  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("entityForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById("fMsg");
    if (!studentInfo) { msgEl.textContent = "Please look up a valid Student ID first."; msgEl.className = "form-msg show error"; return; }

    const subjects = Array.from(rowsEl.children).map((row) => ({
      name: row.querySelector(".subj-name").value,
      marks: Number(row.querySelector(".subj-total").value) || 0,
      obtained: Number(row.querySelector(".subj-obtained").value) || 0
    })).filter((s) => s.name);

    const totalMarks = subjects.reduce((sum, s) => sum + s.marks, 0);
    const obtainedMarks = subjects.reduce((sum, s) => sum + s.obtained, 0);
    const percentage = totalMarks ? Math.round((obtainedMarks / totalMarks) * 1000) / 10 : 0;

    try {
      await addDoc(collection(db, "results"), {
        studentId: document.getElementById("f-sid").value.trim().toUpperCase(),
        studentName: studentInfo.name, fatherName: studentInfo.fatherName, class: studentInfo.class,
        examTitle: document.getElementById("f-exam").value,
        subjects, total: `${obtainedMarks} / ${totalMarks}`, percentage,
        grade: gradeFor(percentage),
        remarks: document.getElementById("f-remarks").value,
        date: serverTimestamp()
      });
      closeModal(); loadResults();
    } catch {
      msgEl.textContent = "Could not save the result. Please try again.";
      msgEl.className = "form-msg show error";
    }
  });
}
loaders.results = loadResults;

/* =========================================================
   ADMISSIONS
   ========================================================= */
async function loadAdmissions() {
  const tbody = document.getElementById("admissionsTable");
  tbody.innerHTML = `<tr><td colspan="6">Loading&hellip;</td></tr>`;
  const snap = await getDocs(query(collection(db, "admissions"), orderBy("submittedAt", "desc")));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="6">No admission applications yet.</td></tr>`; return; }
  tbody.innerHTML = snap.docs.map((d) => {
    const a = d.data();
    return `<tr>
      <td>${esc(a.name)}</td><td>${esc(a.appliedClass)}</td><td>${esc(a.phone)}</td>
      <td>${a.imageUrl ? `<a href="${esc(a.imageUrl)}" target="_blank">View</a>` : "—"}</td>
      <td><select data-status="${d.id}" data-coll="admissions">
        ${["pending", "contacted", "accepted", "rejected"].map((s) => `<option ${a.status === s ? "selected" : ""}>${s}</option>`).join("")}
      </select></td>
      <td class="table-actions"><button class="link-btn danger" data-del="${d.id}">Delete</button></td></tr>`;
  }).join("");
  tbody.querySelectorAll("[data-status]").forEach((sel) => sel.addEventListener("change", () => updateDoc(doc(db, sel.dataset.coll, sel.dataset.status), { status: sel.value })));
  tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => confirmDelete("admissions", b.dataset.del, loadAdmissions)));
}
loaders.admissions = loadAdmissions;

/* =========================================================
   JOB APPLICATIONS
   ========================================================= */
async function loadJobs() {
  const tbody = document.getElementById("jobsTable");
  tbody.innerHTML = `<tr><td colspan="6">Loading&hellip;</td></tr>`;
  const snap = await getDocs(query(collection(db, "jobApplications"), orderBy("submittedAt", "desc")));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="6">No job applications yet.</td></tr>`; return; }
  tbody.innerHTML = snap.docs.map((d) => {
    const j = d.data();
    return `<tr>
      <td>${esc(j.name)}</td><td>${esc(j.position)}</td><td>${esc(j.phone)}</td>
      <td>${j.cvUrl ? `<a href="${esc(j.cvUrl)}" target="_blank">View CV</a>` : "—"}</td>
      <td><select data-status="${d.id}" data-coll="jobApplications">
        ${["pending", "shortlisted", "hired", "rejected"].map((s) => `<option ${j.status === s ? "selected" : ""}>${s}</option>`).join("")}
      </select></td>
      <td class="table-actions"><button class="link-btn danger" data-del="${d.id}">Delete</button></td></tr>`;
  }).join("");
  tbody.querySelectorAll("[data-status]").forEach((sel) => sel.addEventListener("change", () => updateDoc(doc(db, sel.dataset.coll, sel.dataset.status), { status: sel.value })));
  tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => confirmDelete("jobApplications", b.dataset.del, loadJobs)));
}
loaders.jobs = loadJobs;

/* =========================================================
   MESSAGES
   ========================================================= */
async function loadMessages() {
  const tbody = document.getElementById("messagesTable");
  tbody.innerHTML = `<tr><td colspan="5">Loading&hellip;</td></tr>`;
  const snap = await getDocs(query(collection(db, "messages"), orderBy("submittedAt", "desc")));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="5">No messages yet.</td></tr>`; return; }
  tbody.innerHTML = snap.docs.map((d) => {
    const m = d.data();
    return `<tr style="${m.read ? "" : "font-weight:700;"}">
      <td>${esc(m.name)}</td><td>${esc(m.phone)}<br><span class="small muted">${esc(m.email)}</span></td>
      <td style="max-width:260px;">${esc(m.message)}</td><td>${fmtDate(m.submittedAt)}</td>
      <td class="table-actions">
        <button class="link-btn" data-read="${d.id}">${m.read ? "Mark unread" : "Mark read"}</button>
        <button class="link-btn danger" data-del="${d.id}">Delete</button>
      </td></tr>`;
  }).join("");
  tbody.querySelectorAll("[data-read]").forEach((b) => b.addEventListener("click", async () => {
    const ref = doc(db, "messages", b.dataset.read);
    const cur = (await getDoc(ref)).data();
    await updateDoc(ref, { read: !cur.read });
    loadMessages(); loadDashboardStats();
  }));
  tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => confirmDelete("messages", b.dataset.del, loadMessages)));
}
loaders.messages = loadMessages;

/* =========================================================
   SITE SETTINGS
   ========================================================= */
async function loadSettings() {
  const s = await getDoc(doc(db, "siteSettings", "main"));
  const data = s.exists() ? s.data() : {};
  document.getElementById("set-facebook").value = data.socialLinks?.facebook || "";
  document.getElementById("set-instagram").value = data.socialLinks?.instagram || "";
  document.getElementById("set-youtube").value = data.socialLinks?.youtube || "";
  document.getElementById("set-whatsapp").value = data.socialLinks?.whatsapp || "";
  document.getElementById("set-phone2").value = data.phone2 || "";
  document.getElementById("set-map").value = data.mapEmbedUrl || "";
}
loaders.settings = loadSettings;

document.getElementById("saveLogoBtn").addEventListener("click", async () => {
  const file = document.getElementById("set-logo").files[0];
  if (!file) { alert("Choose a logo image first."); return; }
  const logoUrl = await uploadToCloudinary(file);
  await setDoc(doc(db, "siteSettings", "main"), { logoUrl }, { merge: true });
  alert("Logo saved. It now appears across the site.");
});

document.getElementById("savePrincipalBtn").addEventListener("click", async () => {
  const file = document.getElementById("set-principal").files[0];
  if (!file) { alert("Choose a photo first."); return; }
  const principalImageUrl = await uploadToCloudinary(file);
  await setDoc(doc(db, "siteSettings", "main"), { principalImageUrl }, { merge: true });
  alert("Principal's photo saved. It now appears on the Home and About Us pages.");
});

document.getElementById("saveSchoolPhotoBtn").addEventListener("click", async () => {
  const file = document.getElementById("set-schoolphoto").files[0];
  if (!file) { alert("Choose a photo first."); return; }
  const schoolPhotoUrl = await uploadToCloudinary(file);
  await setDoc(doc(db, "siteSettings", "main"), { schoolPhotoUrl }, { merge: true });
  alert("School photo saved. It now appears on the Home page.");
});

document.getElementById("saveSettingsBtn").addEventListener("click", async () => {
  await setDoc(doc(db, "siteSettings", "main"), {
    socialLinks: {
      facebook: document.getElementById("set-facebook").value,
      instagram: document.getElementById("set-instagram").value,
      youtube: document.getElementById("set-youtube").value,
      whatsapp: document.getElementById("set-whatsapp").value
    },
    phone2: document.getElementById("set-phone2").value,
    mapEmbedUrl: document.getElementById("set-map").value
  }, { merge: true });
  alert("Settings saved.");
});
