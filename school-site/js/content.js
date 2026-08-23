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
    { title: "District-level Quiz Champion", studentName: "Sample Student", description: "Placed first in the Ghanche district inter-school quiz competition.", date: new Date() },
    { title: "Cricket Tournament Runners-up", studentName: "QMPS Team", description: "The school cricket team reached the final of the regional schools tournament.", date: new Date() }
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
    tag: e.location, title: e.title, meta: fmtDate(e.date), body: e.description, url: e.imageUrl
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
  el.innerHTML = items.map((a) => cardShell({
    tag: a.studentName, title: a.title, meta: fmtDate(a.date), body: a.description, url: a.imageUrl
  })).join("");
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
