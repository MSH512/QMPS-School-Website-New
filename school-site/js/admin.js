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
import { esc, fmtDate, mediaFieldHTML, wireMediaField, resolveMedia, extractYouTubeId } from "./media-utils.js";

// A second, independent Firebase app instance is used only for creating
// teacher logins, so that doing so never signs the admin out of their
// own session (a quirk of the client-side Firebase Auth SDK).
import { initializeApp as initSecondaryApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";

const ADMIN_EMAIL = "qmpsameerabad@gmail.com";

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
  // Only the real admin account may see the dashboard — a teacher who's
  // signed in on this same browser must not land here too.
  if (user && user.email === ADMIN_EMAIL) {
    loginScreen.style.display = "none";
    adminShell.style.display = "grid";
    loadDashboardStats();
  } else {
    if (user) signOut(auth); // signed in as someone other than admin — bounce them out
    loginScreen.style.display = "flex";
    adminShell.style.display = "none";
  }
});

/* ---------------------------- Panel switching ---------------------------- */
const panelTitles = {
  dashboard: "Dashboard", news: "News & Notices", events: "Events", achievements: "Achievements",
  gallery: "Gallery", students: "Students", teachers: "Teachers", results: "Results",
  complaints: "Shikayat Letters", progress: "Progress Reports",
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
      ${mediaFieldHTML("f-image", "Image (optional)", "image/*", data.imageUrl)}
      <div class="form-msg" id="fMsg"></div>
      <div style="display:flex; gap:10px;"><button type="submit" class="btn btn-primary">Save</button><button type="button" class="btn btn-outline" style="border-color:var(--line); color:var(--navy-900);" id="cancelBtn">Cancel</button></div>
    </form>`);
  wireMediaField("f-image");
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("entityForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const imageUrl = await resolveMedia("f-image", data.imageUrl);
    await saveEntity("news", id, {
      title: document.getElementById("f-title").value,
      category: document.getElementById("f-category").value,
      body: document.getElementById("f-body").value,
      date: Timestamp.fromDate(new Date(document.getElementById("f-date").value)),
      imageUrl
    }, loadNews);
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
  let data = { title: "", location: "", description: "", date: new Date().toISOString().slice(0, 10), imageUrl: "", videoUrl: "" };
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
      ${mediaFieldHTML("f-image", "Image (optional)", "image/*", data.imageUrl)}
      <div class="field"><label>YouTube video link (optional)</label><input id="f-video" placeholder="https://youtube.com/watch?v=..." value="${esc(data.videoUrl)}"></div>
      <div class="form-msg" id="fMsg"></div>
      <div style="display:flex; gap:10px;"><button type="submit" class="btn btn-primary">Save</button><button type="button" class="btn btn-outline" style="border-color:var(--line); color:var(--navy-900);" id="cancelBtn">Cancel</button></div>
    </form>`);
  wireMediaField("f-image");
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("entityForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const imageUrl = await resolveMedia("f-image", data.imageUrl);
    await saveEntity("events", id, {
      title: document.getElementById("f-title").value,
      location: document.getElementById("f-location").value,
      description: document.getElementById("f-desc").value,
      date: Timestamp.fromDate(new Date(document.getElementById("f-date").value)),
      imageUrl,
      videoUrl: document.getElementById("f-video").value.trim()
    }, loadEvents);
  });
}
loaders.events = loadEvents;

/* =========================================================
   ACHIEVEMENTS
   ========================================================= */
/* =========================================================
   ACHIEVEMENTS
   Each achievement: a title (type of achievement), the person it
   belongs to (student / teacher / principal), details, and zero or
   more photos/videos (each can be uploaded or linked).
   ========================================================= */
async function loadAch() {
  const tbody = document.getElementById("achTable");
  tbody.innerHTML = `<tr><td colspan="4">Loading&hellip;</td></tr>`;
  const snap = await getDocs(query(collection(db, "achievements"), orderBy("date", "desc")));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="4">No achievements yet.</td></tr>`; return; }
  tbody.innerHTML = snap.docs.map((d) => {
    const a = d.data();
    return `<tr>
      <td>${esc(a.title)}</td>
      <td>${esc(a.personName)} <span class="pill">${esc(a.personRole || "")}</span></td>
      <td>${fmtDate(a.date)}</td>
      <td class="table-actions">
        <button class="link-btn" data-view="${d.id}">View</button>
        <button class="link-btn danger" data-del="${d.id}">Delete</button>
      </td></tr>`;
  }).join("");
  tbody.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => viewAchievement(b.dataset.view)));
  tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => confirmDelete("achievements", b.dataset.del, loadAch)));
}

async function viewAchievement(id) {
  const s = await getDoc(doc(db, "achievements", id));
  const a = s.data();
  const media = (a.media || []).map((m) => m.type === "video"
    ? `<p><a href="${esc(m.url)}" target="_blank">&#9658; Watch video</a></p>`
    : `<img src="${esc(m.url)}" alt="" style="width:100%; border-radius:8px; margin-bottom:10px;">`).join("");
  openModal(`
    <h3>${esc(a.title)}</h3>
    <p class="small muted">${esc(a.personName)} &middot; ${esc(a.personRole)} &middot; ${fmtDate(a.date)}</p>
    <p>${esc(a.details)}</p>
    ${media || `<p class="muted small">No photos or videos attached.</p>`}
    <button type="button" class="btn btn-outline" style="border-color:var(--line); color:var(--navy-900); margin-top:10px;" id="cancelBtn">Close</button>`);
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
}

let achMediaCount = 0;
function achMediaRowHTML(idx) {
  const id = `ach-media-${idx}`;
  return `
  <div class="admin-card" data-media-row="${id}" style="padding:16px; margin-bottom:12px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <strong class="small">Photo / Video ${idx + 1}</strong>
      <button type="button" class="link-btn danger" data-remove-row="${id}">Remove</button>
    </div>
    <div class="field"><label>Type</label><select id="${id}-type"><option value="image">Image</option><option value="video">Video link</option></select></div>
    <div id="${id}-fields">${mediaFieldHTML(id + "-img", "Image", "image/*")}</div>
  </div>`;
}
function wireAchMediaRow(idx) {
  const id = `ach-media-${idx}`;
  wireMediaField(id + "-img");
  const typeSel = document.getElementById(`${id}-type`);
  const fieldsWrap = document.getElementById(`${id}-fields`);
  typeSel.addEventListener("change", () => {
    if (typeSel.value === "video") {
      fieldsWrap.innerHTML = `<div class="field"><label>Video link (YouTube or any video URL)</label><input id="${id}-vid" placeholder="https://youtube.com/watch?v=..."></div>`;
    } else {
      fieldsWrap.innerHTML = mediaFieldHTML(id + "-img", "Image", "image/*");
      wireMediaField(id + "-img");
    }
  });
}

document.getElementById("addAchBtn").addEventListener("click", () => {
  achMediaCount = 0;
  openModal(`
    <h3>Add Achievement</h3>
    <form id="entityForm">
      <div class="field"><label>Achievement type / title *</label>
        <input id="f-title" list="achTypes" placeholder="e.g. Academic Excellence, Sports Champion, Best Teacher Award" required>
        <datalist id="achTypes">
          <option value="Academic Excellence"><option value="Sports Achievement"><option value="Quiz Competition Winner">
          <option value="Best Teacher Award"><option value="Leadership Recognition"><option value="Arts & Creativity">
        </datalist>
      </div>
      <div class="form-grid">
        <div class="field"><label>Name *</label><input id="f-person" placeholder="Full name" required></div>
        <div class="field"><label>Role *</label><select id="f-role"><option>Student</option><option>Teacher</option><option>Principal</option></select></div>
      </div>
      <div class="field"><label>Date *</label><input type="date" id="f-date" value="${new Date().toISOString().slice(0, 10)}" required></div>
      <div class="field"><label>Details *</label><textarea id="f-details" placeholder="What did they achieve?" required></textarea></div>
      <label style="display:block; margin-bottom:8px; font-size:.85rem; font-weight:700;">Photos / Videos (optional — add as many as you like)</label>
      <div id="achMediaRows"></div>
      <button type="button" class="btn btn-outline btn-sm" style="border-color:var(--line); color:var(--navy-900); margin-bottom:16px;" id="addMediaRowBtn">+ Add photo/video</button>
      <div class="form-msg" id="fMsg"></div>
      <div style="display:flex; gap:10px;"><button type="submit" class="btn btn-primary" id="saveBtn">Save Achievement</button><button type="button" class="btn btn-outline" style="border-color:var(--line); color:var(--navy-900);" id="cancelBtn">Cancel</button></div>
    </form>`);

  const rowsEl = document.getElementById("achMediaRows");
  document.getElementById("addMediaRowBtn").addEventListener("click", () => {
    const idx = achMediaCount++;
    rowsEl.insertAdjacentHTML("beforeend", achMediaRowHTML(idx));
    wireAchMediaRow(idx);
    rowsEl.querySelector(`[data-media-row="ach-media-${idx}"] [data-remove-row]`).addEventListener("click", (e) => {
      e.target.closest("[data-media-row]").remove();
    });
  });

  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("entityForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("saveBtn");
    const msgEl = document.getElementById("fMsg");
    btn.disabled = true; btn.textContent = "Saving...";
    try {
      const media = [];
      for (const row of rowsEl.querySelectorAll("[data-media-row]")) {
        const id = row.dataset.mediaRow;
        const type = document.getElementById(`${id}-type`).value;
        if (type === "video") {
          const url = document.getElementById(`${id}-vid`)?.value.trim();
          if (url) media.push({ type: "video", url });
        } else {
          const url = await resolveMedia(`${id}-img`, "");
          if (url) media.push({ type: "image", url });
        }
      }
      await addDoc(collection(db, "achievements"), {
        title: document.getElementById("f-title").value,
        personName: document.getElementById("f-person").value,
        personRole: document.getElementById("f-role").value,
        details: document.getElementById("f-details").value,
        date: Timestamp.fromDate(new Date(document.getElementById("f-date").value)),
        media
      });
      closeModal(); loadAch(); loadDashboardStats();
    } catch (err) {
      msgEl.textContent = "Could not save the achievement. Please try again.";
      msgEl.className = "form-msg show error";
      btn.disabled = false; btn.textContent = "Save Achievement";
    }
  });
});
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

function galleryTypeFields(type) {
  return type === "video"
    ? `<div class="field" id="fileField"><label>YouTube link *</label><input id="f-yturl" placeholder="https://youtube.com/watch?v=..." required>
       <p class="hint">Upload the video to YouTube first (as Public or Unlisted), then paste its link here — no file upload needed.</p></div>`
    : `<div id="fileField">${mediaFieldHTML("f-photo", "Photo", "image/*", "", true)}</div>`;
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
  wireMediaField("f-photo");
  typeSel.addEventListener("change", () => {
    fieldWrap.innerHTML = galleryTypeFields(typeSel.value);
    if (typeSel.value === "photo") wireMediaField("f-photo");
  });
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
        const url = await resolveMedia("f-photo", "");
        if (!url) throw new Error("no-photo");
        await addDoc(collection(db, "gallery"), { type, caption, url, date: serverTimestamp() });
      }
      closeModal(); loadGallery();
    } catch (err) {
      msgEl.textContent = err.message === "bad-youtube-url"
        ? "That doesn't look like a valid YouTube link. Copy it directly from YouTube's address bar or Share button."
        : err.message === "no-photo"
        ? "Please choose a photo file or paste a link to one."
        : "Could not save — check your Cloudinary settings in firebase-config.js.";
      msgEl.className = "form-msg show error";
      btn.disabled = false; btn.textContent = "Save";
    }
  });
});
loaders.gallery = loadGallery;

/* =========================================================
   Shared save helper — fields must already have final URLs resolved
   (via resolveMedia) before calling this.
   ========================================================= */
async function saveEntity(coll, id, fields, reload) {
  const msgEl = document.getElementById("fMsg");
  try {
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
   Each teacher has a weekly timetable (period → class → subject, at
   least 7 periods) and may optionally be the Class Teacher of one
   class (which gives them access to that class's attendance register).
   ========================================================= */
const PERIOD_COUNT = 7;
const CLASS_LIST = Object.keys(CLASS_CODES);

async function loadTeachers() {
  const tbody = document.getElementById("teachersTable");
  tbody.innerHTML = `<tr><td colspan="5">Loading&hellip;</td></tr>`;
  const snap = await getDocs(collection(db, "teachers"));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="5">No teachers added yet.</td></tr>`; return; }
  tbody.innerHTML = snap.docs.map((d) => {
    const t = d.data();
    const subjects = [...new Set((t.timetable || []).map((p) => p.subject).filter(Boolean))];
    const classes = [...new Set((t.timetable || []).map((p) => p.class).filter(Boolean))];
    return `<tr>
      <td>${esc(t.name)}${t.classTeacherOf ? `<br><span class="pill" style="margin-top:4px;">Class Teacher: ${esc(t.classTeacherOf)}</span>` : ""}</td>
      <td>${esc(t.email)}</td>
      <td>${esc(subjects.join(", ") || "—")}</td>
      <td>${esc(classes.join(", ") || "—")}</td>
      <td class="table-actions">
        <button class="link-btn" data-edit="${d.id}">Edit</button>
        <button class="link-btn" data-reset="${esc(t.email)}">Reset Password</button>
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

function timetableRowsHTML(timetable) {
  const rows = [];
  for (let i = 0; i < PERIOD_COUNT; i++) {
    const p = timetable[i] || { class: "", subject: "" };
    rows.push(`
      <tr>
        <td style="font-family:var(--font-mono); font-weight:700;">P${i + 1}</td>
        <td><select id="tt-class-${i}"><option value="">— Free period —</option>${CLASS_LIST.map((c) => `<option ${p.class === c ? "selected" : ""}>${c}</option>`).join("")}</select></td>
        <td><input id="tt-subject-${i}" placeholder="Subject" value="${esc(p.subject || "")}"></td>
      </tr>`);
  }
  return rows.join("");
}

async function teacherForm(id) {
  let data = { name: "", email: "", timetable: [], classTeacherOf: "" };
  let isEdit = !!id;
  if (id) { const s = await getDoc(doc(db, "teachers", id)); data = { ...data, ...s.data() }; }

  openModal(`
    <h3>${isEdit ? "Edit" : "Add"} Teacher</h3>
    <form id="entityForm">
      <div class="field"><label>Full name *</label><input id="f-name" value="${esc(data.name)}" required></div>
      <div class="field"><label>Email *</label><input type="email" id="f-email" value="${esc(data.email)}" ${isEdit ? "disabled" : ""} required></div>
      ${!isEdit ? `<div class="field"><label>Set initial password *</label><input id="f-password" required minlength="6"></div>` : ""}
      <div class="field"><label>Class Teacher of (optional)</label>
        <select id="f-classteacher"><option value="">— Not a class teacher —</option>${CLASS_LIST.map((c) => `<option ${data.classTeacherOf === c ? "selected" : ""}>${c}</option>`).join("")}</select>
        <p class="hint">The class teacher manages daily attendance for this class.</p>
      </div>
      <label style="display:block; margin:16px 0 8px; font-size:.85rem; font-weight:700;">Weekly Timetable (at least ${PERIOD_COUNT} periods)</label>
      <table class="data-table" style="margin-bottom:16px;">
        <thead><tr><th>Period</th><th>Class</th><th>Subject</th></tr></thead>
        <tbody>${timetableRowsHTML(data.timetable || [])}</tbody>
      </table>
      <div class="form-msg" id="fMsg"></div>
      <div style="display:flex; gap:10px;"><button type="submit" class="btn btn-primary" id="saveBtn">Save</button><button type="button" class="btn btn-outline" style="border-color:var(--line); color:var(--navy-900);" id="cancelBtn">Cancel</button></div>
    </form>`);
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("entityForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById("fMsg");
    const saveBtn = document.getElementById("saveBtn");
    saveBtn.disabled = true; saveBtn.textContent = "Saving...";

    const timetable = [];
    for (let i = 0; i < PERIOD_COUNT; i++) {
      const cls = document.getElementById(`tt-class-${i}`).value;
      const subject = document.getElementById(`tt-subject-${i}`).value.trim();
      timetable.push({ period: i + 1, class: cls, subject });
    }
    const payload = {
      name: document.getElementById("f-name").value,
      email: document.getElementById("f-email").value,
      classTeacherOf: document.getElementById("f-classteacher").value,
      timetable
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
   RESULTS — view & delete only. Results are now uploaded by teachers
   from the Teacher Portal (weekly / monthly / term), matching the
   requirement that only teachers upload results.
   ========================================================= */
async function loadResults() {
  const tbody = document.getElementById("resultsTable");
  tbody.innerHTML = `<tr><td colspan="5">Loading&hellip;</td></tr>`;
  const snap = await getDocs(query(collection(db, "results"), orderBy("date", "desc")));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="5">No results uploaded yet.</td></tr>`; return; }
  tbody.innerHTML = snap.docs.map((d) => {
    const r = d.data();
    const label = r.type === "term" ? r.examTitle : `${r.type === "weekly" ? "Weekly" : "Monthly"}: ${r.subject} (${r.label || ""})`;
    return `<tr><td style="font-family:var(--font-mono);">${esc(r.studentId)}</td><td><span class="pill">${esc(r.type)}</span> ${esc(label)}</td><td>${esc(r.percentage)}%</td><td>${esc(r.grade || "")}</td>
      <td class="table-actions"><button class="link-btn danger" data-del="${d.id}">Delete</button></td></tr>`;
  }).join("");
  tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => confirmDelete("results", b.dataset.del, loadResults)));
}
loaders.results = loadResults;

/* =========================================================
   COMPLAINTS (Shikayat Letters) — created from the Teacher Portal,
   viewable here for admin oversight.
   ========================================================= */
async function loadComplaints() {
  const tbody = document.getElementById("complaintsTable");
  tbody.innerHTML = `<tr><td colspan="7">Loading&hellip;</td></tr>`;
  const snap = await getDocs(query(collection(db, "complaints"), orderBy("date", "desc")));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="7">No shikayat letters yet.</td></tr>`; return; }
  tbody.innerHTML = snap.docs.map((d) => {
    const c = d.data();
    return `<tr><td>${esc(c.studentName)} <span class="small muted">(${esc(c.studentId)})</span></td><td>${esc(c.class)}</td><td>${esc(c.subject)}</td>
      <td><span class="pill">${esc(c.complaintType)}</span></td><td>${esc(c.teacherName)}</td><td>${fmtDate(c.date)}</td>
      <td class="table-actions"><button class="link-btn" data-view="${d.id}">View</button><button class="link-btn danger" data-del="${d.id}">Delete</button></td></tr>`;
  }).join("");
  tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => confirmDelete("complaints", b.dataset.del, loadComplaints)));
  tbody.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", async () => {
    const s = await getDoc(doc(db, "complaints", b.dataset.view));
    const c = s.data();
    alert(`${c.complaintType}\n\nStudent: ${c.studentName} (${c.studentId})\nClass: ${c.class} · Subject: ${c.subject}\nFrom: ${c.teacherName}\n\nMessage:\n${c.message}`);
  }));
}
loaders.complaints = loadComplaints;

/* =========================================================
   PROGRESS REPORTS — created from the Teacher Portal, viewable here
   for admin oversight.
   ========================================================= */
async function loadProgress() {
  const tbody = document.getElementById("progressTable");
  tbody.innerHTML = `<tr><td colspan="5">Loading&hellip;</td></tr>`;
  const snap = await getDocs(query(collection(db, "progressReports"), orderBy("date", "desc")));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="5">No progress reports yet.</td></tr>`; return; }
  tbody.innerHTML = snap.docs.map((d) => {
    const p = d.data();
    return `<tr><td>${esc(p.studentName)} <span class="small muted">(${esc(p.studentId)})</span></td><td>${esc(p.title)}</td><td>${esc(p.teacherName)}</td><td>${fmtDate(p.date)}</td>
      <td>${p.reportFileUrl ? `<a href="${esc(p.reportFileUrl)}" target="_blank">View file</a>` : "—"} <button class="link-btn danger" data-del="${d.id}">Delete</button></td></tr>`;
  }).join("");
  tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => confirmDelete("progressReports", b.dataset.del, loadProgress)));
}
loaders.progress = loadProgress;

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

  document.getElementById("logoFieldContainer").innerHTML = mediaFieldHTML("set-logo", "Logo image", "image/*", data.logoUrl);
  document.getElementById("principalFieldContainer").innerHTML = mediaFieldHTML("set-principal", "Principal's photo", "image/*", data.principalImageUrl);
  document.getElementById("schoolPhotoFieldContainer").innerHTML = mediaFieldHTML("set-schoolphoto", "School photo", "image/*", data.schoolPhotoUrl);
  wireMediaField("set-logo"); wireMediaField("set-principal"); wireMediaField("set-schoolphoto");

  const periodTimes = data.periodTimes || [];
  const body = document.getElementById("periodTimesBody");
  body.innerHTML = "";
  for (let i = 0; i < PERIOD_COUNT; i++) {
    const p = periodTimes[i] || { start: "", end: "" };
    body.insertAdjacentHTML("beforeend", `
      <tr><td style="font-family:var(--font-mono); font-weight:700;">P${i + 1}</td>
      <td><input type="time" id="pt-start-${i}" value="${esc(p.start || "")}"></td>
      <td><input type="time" id="pt-end-${i}" value="${esc(p.end || "")}"></td></tr>`);
  }
}
loaders.settings = loadSettings;

document.getElementById("savePeriodTimesBtn").addEventListener("click", async () => {
  const periodTimes = [];
  for (let i = 0; i < PERIOD_COUNT; i++) {
    periodTimes.push({
      period: i + 1,
      start: document.getElementById(`pt-start-${i}`).value,
      end: document.getElementById(`pt-end-${i}`).value
    });
  }
  await setDoc(doc(db, "siteSettings", "main"), { periodTimes }, { merge: true });
  alert("Period timings saved. They now appear on every teacher's timetable.");
});

document.getElementById("saveLogoBtn").addEventListener("click", async () => {
  const logoUrl = await resolveMedia("set-logo", "");
  if (!logoUrl) { alert("Choose a logo file or paste a link first."); return; }
  await setDoc(doc(db, "siteSettings", "main"), { logoUrl }, { merge: true });
  alert("Logo saved. It now appears across the site.");
});

document.getElementById("savePrincipalBtn").addEventListener("click", async () => {
  const principalImageUrl = await resolveMedia("set-principal", "");
  if (!principalImageUrl) { alert("Choose a photo file or paste a link first."); return; }
  await setDoc(doc(db, "siteSettings", "main"), { principalImageUrl }, { merge: true });
  alert("Principal's photo saved. It now appears on the Home and About Us pages.");
});

document.getElementById("saveSchoolPhotoBtn").addEventListener("click", async () => {
  const schoolPhotoUrl = await resolveMedia("set-schoolphoto", "");
  if (!schoolPhotoUrl) { alert("Choose a photo file or paste a link first."); return; }
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
