// Shared header + footer, injected into every page so nav/branding
// only has to be edited in one place. Each page includes:
//   <div id="site-header"></div>  ...  <div id="site-footer"></div>
// and loads this file as: <script type="module" src="js/layout.js"></script>

const SCHOOL = {
  name: "Quaid-e-Millat Public School Ameerabad",
  short: "QMPS Ameerabad",
  address: "Near Ameerabad Cricket Stadium, Ameerabad Chorbat, District Ghanche, Gilgit-Baltistan",
  phone: "+92 355 5351324",
  email: "qmpsameerabad@gmail.com"
};

const NAV = [
  { href: "index.html", label: "Home" },
  { href: "about.html", label: "About Us" },
  { href: "gallery.html", label: "Gallery" },
  { href: "achievements.html", label: "Achievements" },
  { href: "news.html", label: "News & Notices" },
  { href: "events.html", label: "Events" },
  { href: "contact.html", label: "Contact" }
];

function currentPage() {
  const p = location.pathname.split("/").pop();
  return p === "" ? "index.html" : p;
}

function renderHeader() {
  const here = currentPage();
  const links = NAV.map(
    (n) => `<a href="${n.href}" class="${n.href === here ? "active" : ""}">${n.label}</a>`
  ).join("");

  return `
  <header class="site-header">
    <div class="topbar">
      <div class="container">
        <span>&#9742;&nbsp; ${SCHOOL.phone} &nbsp;&middot;&nbsp; ${SCHOOL.email}</span>
        <span>Playgroup &ndash; Grade 7 &nbsp;&middot;&nbsp; Est. 1999</span>
      </div>
    </div>
    <div class="navwrap">
      <div class="container">
        <a class="brand" href="index.html" aria-label="${SCHOOL.name} home">
          <span class="brand-logo">QM</span>
          <span class="brand-name">${SCHOOL.name}<small>Ameerabad &middot; Ghanche</small></span>
        </a>
        <nav class="main-nav" id="mainNav">
          ${links}
          <a href="login.html" class="nav-cta">Portal Login</a>
        </nav>
        <button class="menu-toggle" id="menuToggle" aria-label="Toggle menu" aria-expanded="false">&#9776;</button>
      </div>
    </div>
  </header>`;
}

function renderFooter() {
  return `
  <footer class="site-footer">
    <div class="container">
      <svg class="skyline-divider" viewBox="0 0 1180 46" preserveAspectRatio="none" aria-hidden="true" style="margin-bottom:32px;">
        <path d="M0,46 L0,30 L90,8 L160,30 L230,4 L300,26 L360,14 L430,30 L510,2 L590,24 L660,10 L740,30 L820,6 L900,28 L980,12 L1060,30 L1180,10 L1180,46 Z"></path>
      </svg>
      <div class="footer-grid">
        <div>
          <h4>${SCHOOL.name}</h4>
          <p class="small" style="max-width:32ch;">Nurturing young minds, building futures since 1999. Quality education from Playgroup to Grade 7.</p>
          <div class="social-row" id="footerSocial" style="margin-top:14px;">
            <!-- Social links are managed by the admin dashboard and loaded dynamically -->
          </div>
        </div>
        <div>
          <h4>Explore</h4>
          <ul>
            <li><a href="about.html">About Us</a></li>
            <li><a href="gallery.html">Gallery</a></li>
            <li><a href="achievements.html">Achievements</a></li>
            <li><a href="news.html">News & Notices</a></li>
          </ul>
        </div>
        <div>
          <h4>Get Involved</h4>
          <ul>
            <li><a href="admission.html">Apply for Admission</a></li>
            <li><a href="careers.html">Careers / Jobs</a></li>
            <li><a href="login.html">Portal Login</a></li>
            <li><a href="contact.html">Contact Us</a></li>
          </ul>
        </div>
        <div>
          <h4>Reach Us</h4>
          <ul>
            <li>${SCHOOL.address}</li>
            <li><a href="tel:${SCHOOL.phone.replace(/\s/g, "")}">${SCHOOL.phone}</a></li>
            <li><a href="mailto:${SCHOOL.email}">${SCHOOL.email}</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>&copy; <span id="yr"></span> ${SCHOOL.name}. All rights reserved.</span>
        <span>Principal: Malik Gulzar Hussain</span>
      </div>
    </div>
  </footer>`;
}

function mount() {
  const h = document.getElementById("site-header");
  const f = document.getElementById("site-footer");
  if (h) h.outerHTML = renderHeader();
  if (f) f.outerHTML = renderFooter();

  const yr = document.getElementById("yr");
  if (yr) yr.textContent = new Date().getFullYear();

  const toggle = document.getElementById("menuToggle");
  const nav = document.getElementById("mainNav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  applySiteSettings();
}

// Loads the logo + social links the admin has set (siteSettings/main in
// Firestore) and applies them across every page. Silently does nothing
// until the admin has configured Firebase and saved settings once.
const SOCIAL_ICONS = { facebook: "f", instagram: "IG", youtube: "YT", whatsapp: "WA", twitter: "X" };
async function applySiteSettings() {
  try {
    const { db } = await import("./firebase-config.js");
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
    const snap = await getDoc(doc(db, "siteSettings", "main"));
    if (!snap.exists()) return;
    const s = snap.data();

    if (s.logoUrl) {
      document.querySelectorAll(".brand-logo").forEach((el) => {
        el.innerHTML = `<img src="${s.logoUrl}" alt="School logo" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      });
    }
    const principalEl = document.getElementById("principalPhoto");
    if (principalEl && s.principalImageUrl) {
      principalEl.innerHTML = `<img src="${s.principalImageUrl}" alt="Malik Gulzar Hussain, Principal" style="width:100%;height:100%;object-fit:cover;">`;
    }
    const heroArt = document.getElementById("heroArt");
    if (heroArt && s.schoolPhotoUrl) {
      heroArt.style.backgroundImage = `linear-gradient(0deg, rgba(19,35,56,.75), rgba(19,35,56,.15)), url('${s.schoolPhotoUrl}')`;
      heroArt.style.backgroundSize = "cover";
      heroArt.style.backgroundPosition = "center";
      heroArt.querySelectorAll(".ridge").forEach((el) => el.style.display = "none");
    }
    const socialEl = document.getElementById("footerSocial");
    if (socialEl && s.socialLinks) {
      socialEl.innerHTML = Object.entries(s.socialLinks)
        .filter(([, url]) => url)
        .map(([key, url]) => `<a href="${url}" target="_blank" rel="noopener" aria-label="${key}">${SOCIAL_ICONS[key] || key[0].toUpperCase()}</a>`)
        .join("");
    }
    if (s.phone2) {
      document.querySelectorAll(".topbar span:first-child").forEach((el) => {
        el.innerHTML += ` &nbsp;/&nbsp; ${s.phone2}`;
      });
    }
  } catch {
    /* Firebase not configured yet, or settings not saved — fine, keep defaults */
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
