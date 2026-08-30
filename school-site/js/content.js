// Reads dynamic content (added by the admin dashboard) from Firestore
// and renders it into public pages. If Firebase hasn't been configured
// yet (placeholder keys still in firebase-config.js), each section
// falls back to sample content so the site still looks complete.

import { db } from "./firebase-config.js";
import {
  collection, getDocs, query, orderBy, limit as qlimit
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function fmtDate(v) {
  if (!v) return "";
  const d = v.toDate ? v.toDate() : new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

async function fetchCollection(name, max = 12) {
  const q = query(collection(db, name), orderBy("date", "desc"), qlimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------------- Sample fallback content (shown until Firebase is wired up) ----------------
const SAMPLE = {
  news: [
    { title: "Autumn Term begins Monday", date: new Date(), body: "Classes for Playgroup through Grade 7 resume next Monday. Please ensure fee vouchers are cleared before the first day.", category: "notice" },
    { title: "Parent-Teacher Meeting scheduled", date: new Date(), body: "This term's Parent-Teacher Meeting will be held on campus. SMS alerts with the exact date will follow shortly.", category: "news" },
    { title: "Mid-term exam datesheet issued", date: new Date(), body: "The datesheet for mid-term examinations has been finalised and will be shared with students in class.", category: "notice" }
  ],
  events: [
    { title: "Annual Sports Day", date: new Date(), description: "Cricket, athletics and team games for all grades, hosted at the school ground.", location: "School Ground" },
    { title: "Science Exhibition", date: new Date(), description: "Students showcase hands-on science projects and experiments for parents and peers.", location: "Main Hall" },
    { title: "Independence Day Celebration", date: new Date(), description: "Cultural programme, tableau and flag-hoisting ceremony with the whole school community.", location: "School Campus" }
  ],
  achievements: [
    { title: "Academic Excellence", personName: "Ayesha Karim", personRole: "Student", description: "Secured first position in the Grade 6 annual examinations with outstanding results across all subjects.", date: new Date(), media: [] },
    { title: "District-level Quiz Champion", personName: "Hassan Ali", personRole: "Student", description: "Placed first in the Ghanche district inter-school quiz competition, representing QMPS Ameerabad.", date: new Date(), media: [] },
    { title: "Best Teacher Award", personName: "Ms. Fatima Batool", personRole: "Teacher", description: "Recognised for outstanding dedication and innovative teaching methods in the primary section.", date: new Date(), media: [] },
    { title: "Leadership Recognition", personName: "Malik Gulzar Hussain", personRole: "Principal", description: "Honoured by the district education office for two decades of service to quality education in Ghanche.", date: new Date(), media: [] },
    { title: "Cricket Tournament Runners-up", personName: "QMPS School Team", personRole: "Student", description: "The school cricket team reached the final of the regional schools tournament.", date: new Date(), media: [] }
  ],
  gallery: [
    { type: "photo", caption: "Classroom activity", date: new Date() },
    { type: "photo", caption: "Sports day", date: new Date() },
    { type: "video", caption: "Annual function highlights", date: new Date() }
  ]
};

function cardShell({ tag, title, meta, body, url, isVideo, linkUrl }) {
  const inner = `
    <div class="thumb">
      ${url ? `<img src="${esc(url)}" alt="${esc(title)}" loading="lazy">` : ""}
      ${isVideo ? `<div class="play"><span>&#9658;</span></div>` : ""}
    </div>
    <div class="body">
      ${tag ? `<span class="tag">${esc(tag)}</span>` : ""}
      <div class="date">${esc(meta)}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(body)}</p>
    </div>`;
  return linkUrl
    ? `<a class="info-card" href="${esc(linkUrl)}" target="_blank" rel="noopener" style="display:flex; flex-direction:column;">${inner}</a>`
    : `<article class="info-card">${inner}</article>`;
}

export async function renderNews(targetSelector, max = 6) {
  const el = document.querySelector(targetSelector);
  if (!el) return;
  el.innerHTML = `<div class="loader"><span class="spinner"></span> Loading news &amp; notices&hellip;</div>`;
  let items = [];
  try {
    items = await fetchCollection("news", max);
    if (!items.length) throw new Error("empty");
  } catch {
    items = SAMPLE.news;
  }
  el.innerHTML = items.map((n) => cardShell({
    tag: n.category === "notice" ? "Notice" : "News",
    title: n.title, meta: fmtDate(n.date), body: n.body, url: n.imageUrl
  })).join("");
}

export async function renderEvents(targetSelector, max = 6) {
  const el = document.querySelector(targetSelector);
  if (!el) return;
  el.innerHTML = `<div class="loader"><span class="spinner"></span> Loading events&hellip;</div>`;
  let items = [];
  try {
    items = await fetchCollection("events", max);
    if (!items.length) throw new Error("empty");
  } catch {
    items = SAMPLE.events;
  }
  el.innerHTML = items.map((e) => cardShell({
    tag: e.location, title: e.title, meta: fmtDate(e.date), body: e.description,
    url: e.imageUrl, isVideo: !e.imageUrl && !!e.videoUrl, linkUrl: e.videoUrl || ""
  })).join("");
}

export async function renderAchievements(targetSelector, max = 6) {
  const el = document.querySelector(targetSelector);
  if (!el) return;
  el.innerHTML = `<div class="loader"><span class="spinner"></span> Loading achievements&hellip;</div>`;
  let items = [];
  try {
    items = await fetchCollection("achievements", max);
    if (!items.length) throw new Error("empty");
  } catch {
    items = SAMPLE.achievements;
  }
  el.innerHTML = items.map((a) => {
    const media = a.media || [];
    const firstImage = media.find((m) => m.type !== "video");
    const firstVideo = !firstImage && media.find((m) => m.type === "video");
    const extra = media.length > 1
      ? `<div style="display:flex; gap:6px; margin-top:8px;">${media.slice(1, 4).map((m) =>
          m.type === "video"
            ? `<a href="${esc(m.url)}" target="_blank" style="width:44px; height:44px; border-radius:6px; background:var(--navy-900); color:#fff; display:flex; align-items:center; justify-content:center; font-size:.9rem;">&#9658;</a>`
            : `<img src="${esc(m.url)}" alt="" style="width:44px; height:44px; object-fit:cover; border-radius:6px;">`
        ).join("")}${media.length > 4 ? `<span style="width:44px; height:44px; border-radius:6px; background:var(--paper-100); display:flex; align-items:center; justify-content:center; font-size:.75rem; color:var(--ink-400);">+${media.length - 4}</span>` : ""}</div>`
      : "";
    return `
    <article class="info-card">
      <div class="thumb">
        ${firstImage ? `<img src="${esc(firstImage.url)}" alt="${esc(a.title)}" loading="lazy">` : ""}
        ${firstVideo ? `<div class="play"><span>&#9658;</span></div>` : ""}
      </div>
      <div class="body">
        <span class="tag">${esc(a.personRole || "")}</span>
        <div class="date">${esc(fmtDate(a.date))}</div>
        <h3>${esc(a.title)}</h3>
        <p style="margin-bottom:4px;"><strong>${esc(a.personName)}</strong></p>
        <p>${esc(a.description ?? a.details)}</p>
        ${extra}
      </div>
    </article>`;
  }).join("");
}

export async function renderGallery(photoSelector, videoSelector) {
  const photoEl = document.querySelector(photoSelector);
  const videoEl = document.querySelector(videoSelector);
  if (photoEl) photoEl.innerHTML = `<div class="loader"><span class="spinner"></span> Loading photos&hellip;</div>`;
  if (videoEl) videoEl.innerHTML = `<div class="loader"><span class="spinner"></span> Loading videos&hellip;</div>`;

  let items = [];
  try {
    items = await fetchCollection("gallery", 60);
    if (!items.length) throw new Error("empty");
  } catch {
    items = SAMPLE.gallery;
  }
  const photos = items.filter((i) => i.type !== "video");
  const videos = items.filter((i) => i.type === "video");

  if (photoEl) {
    photoEl.innerHTML = photos.length ? photos.map((p) => cardShell({
      title: p.caption || "School moment", meta: fmtDate(p.date), body: "", url: p.url, linkUrl: p.url
    })).join("") : `<div class="empty-state">No photos uploaded yet. Check back soon.</div>`;
  }
  if (videoEl) {
    videoEl.innerHTML = videos.length ? videos.map((v) => cardShell({
      title: v.caption || "School video", meta: fmtDate(v.date), body: "", url: v.thumbnailUrl, isVideo: true, linkUrl: v.url
    })).join("") : `<div class="empty-state">No videos uploaded yet. Check back soon.</div>`;
  }
}
