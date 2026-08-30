import { uploadToCloudinary } from "./firebase-config.js";

export function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export function fmtDate(v) {
  if (!v) return "—";
  const d = v.toDate ? v.toDate() : new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* Reusable "Upload file / Paste link" field — used anywhere in the
   admin dashboard or teacher portal that needs an image, PDF, or
   document, so the school can either upload from the device or paste
   a link to a file already hosted somewhere else. */
export function mediaFieldHTML(id, label, accept, existingUrl = "", required = false) {
  return `
  <div class="field" data-media-field="${id}">
    <label>${label}${required ? " *" : ""}</label>
    <div style="display:flex; gap:6px; margin-bottom:8px;">
      <button type="button" class="btn btn-sm media-mode-btn active" data-mode="upload" data-target="${id}" style="background:var(--navy-900); color:#fff;">Upload file</button>
      <button type="button" class="btn btn-sm btn-outline media-mode-btn" data-mode="link" data-target="${id}" style="border-color:var(--line); color:var(--navy-900);">Paste link</button>
    </div>
    <input type="file" id="${id}-file" accept="${accept}">
    <input type="url" id="${id}-link" placeholder="https://..." style="display:none;">
    ${existingUrl ? `<p class="hint">Currently set. Choose a new file or link to replace it, or leave blank to keep it.</p>` : ""}
  </div>`;
}
export function wireMediaField(id) {
  const wrap = document.querySelector(`[data-media-field="${id}"]`);
  if (!wrap) return;
  const fileInput = wrap.querySelector(`#${CSS.escape(id)}-file`);
  const linkInput = wrap.querySelector(`#${CSS.escape(id)}-link`);
  wrap.querySelectorAll(".media-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      wrap.querySelectorAll(".media-mode-btn").forEach((b) => {
        b.classList.remove("active"); b.style.background = "transparent"; b.style.color = "var(--navy-900)"; b.classList.add("btn-outline"); b.style.borderColor = "var(--line)";
      });
      btn.classList.add("active"); btn.classList.remove("btn-outline"); btn.style.background = "var(--navy-900)"; btn.style.color = "#fff";
      const mode = btn.dataset.mode;
      fileInput.style.display = mode === "upload" ? "block" : "none";
      linkInput.style.display = mode === "link" ? "block" : "none";
    });
  });
}
// Resolves a media field to a final URL: uploads the chosen file, uses
// the pasted link if that mode is active, or falls back to the
// existing URL (so leaving a field blank on edit keeps it as-is).
export async function resolveMedia(id, existingUrl = "") {
  const wrap = document.querySelector(`[data-media-field="${id}"]`);
  const activeBtn = wrap.querySelector(".media-mode-btn.active");
  const mode = activeBtn ? activeBtn.dataset.mode : "upload";
  if (mode === "link") {
    const val = document.getElementById(`${id}-link`).value.trim();
    return val || existingUrl;
  }
  const file = document.getElementById(`${id}-file`).files[0];
  if (file) return await uploadToCloudinary(file);
  return existingUrl;
}

// Pulls the video ID out of any common YouTube URL shape.
export function extractYouTubeId(url) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function gradeFor(pct) {
  if (pct >= 90) return "A+"; if (pct >= 80) return "A"; if (pct >= 70) return "B";
  if (pct >= 60) return "C"; if (pct >= 50) return "D"; return "F";
}
