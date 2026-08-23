# Quaid-e-Millat Public School Ameerabad — Website

A full multi-page school website with a public site, three login portals
(Student / Teacher / Admin), and a complete admin dashboard — built to run
entirely on Firebase's **free Spark plan**.

## What's inside

```
index.html            Home page
about.html             About Us (history, vision, mission, principal's message)
gallery.html            Gallery — Photos / Videos tabs
achievements.html      Achievements
news.html               News & Notices
events.html              Events
contact.html            Contact Us + message form
admission.html          Admission application form
careers.html            Job application form
login.html               Portal picker (Student / Teacher / Admin)
student-portal.html    Student login → view own result only
teacher-portal.html    Teacher login (email/password) → assigned classes
admin-dashboard.html   Full CMS: news, events, achievements, gallery,
                        students, teachers, results, admissions, jobs,
                        messages, site settings (logo/social links)
css/style.css           Design system (shared by every page)
js/layout.js             Shared header/footer + mobile nav (edit once, applies everywhere)
js/content.js            Loads news/events/achievements/gallery from Firestore
js/firebase-config.js  Your Firebase + Cloudinary keys go here
js/admin.js              All admin dashboard logic
js/auth-utils.js         Small password-hashing helper
firestore.rules          Security rules — paste into Firebase Console
```

Every page opens as its own separate page (not a single-page app), as requested.

---

## 1. Important: Firebase Storage now requires the paid Blaze plan

Since **February 2026**, Firebase Cloud Storage (for photos/videos/PDFs) is no
longer available on the free Spark plan — it now requires linking a billing
account (Blaze), even for tiny amounts of data.

So this site is built to keep the **database on Firebase Spark (free)** and
send media elsewhere for free instead:
- **Photos & PDFs (admission/job attachments)** → Cloudinary (25GB free, no card required).
- **Videos** → YouTube. In the Gallery admin panel, uploading a video means
  uploading it to YouTube (Public or Unlisted) first, then pasting the link —
  no file upload through the site at all. YouTube also generates the
  thumbnail automatically, and its player handles bandwidth/streaming far
  better than we could on a free plan anyway.

This means you stay 100% on Firebase's free plan as you wanted.

---

## 2. Set up Firebase (free Spark plan)

1. Go to https://console.firebase.google.com → **Add project** → keep it on Spark.
2. **Project settings → General → Your apps → Add app → Web (`</>`)**. Copy the
   `firebaseConfig` object it gives you.
3. Open `js/firebase-config.js` and paste your values into `firebaseConfig`.
4. In the left menu:
   - **Build → Authentication → Sign-in method → Email/Password → Enable.**
   - **Build → Firestore Database → Create database** → Production mode →
     pick a region close to Pakistan (e.g. `asia-south1` or `asia-south2`).
5. **Firestore Database → Rules** → paste the contents of `firestore.rules` → **Publish**.

### Create the admin login
Firebase Authentication needs a real account before you can log into
`admin-dashboard.html`. In **Authentication → Users → Add user**, create:
- Email: `qmpsameerabad@gmail.com`
- Password: `QMPS-512&786`

(The "username" you mentioned, *Principal QMPS*, is just how you'll think of
this account day-to-day — Firebase logs in by email.)

---

## 3. Set up Cloudinary (free, for photos/videos/PDFs)

1. Create a free account at https://cloudinary.com.
2. **Settings → Upload → Upload presets → Add upload preset** → set
   **Signing Mode to "Unsigned"** → Save. Note the preset name.
3. Your **Cloud name** is shown at the top of the Cloudinary dashboard.
4. Open `js/firebase-config.js` and fill in `cloudinaryConfig` with both values.

---

## 4. Try it locally

Because the pages use JavaScript modules, open them through a local server
rather than double-clicking the file (browsers block module imports over
`file://`). Easiest options:
- VS Code → install the "Live Server" extension → right-click `index.html` → "Open with Live Server".
- Or, with Python installed: `python -m http.server 8000` from the project folder, then visit `http://localhost:8000`.

---

## 5. Deploy for free

**Option A — Firebase Hosting (free on Spark):**
```
npm install -g firebase-tools
firebase login
firebase init hosting     # choose your project, set public dir to "." 
firebase deploy
```

**Option B — GitHub Pages:** push this folder to a GitHub repo and enable
Pages in the repo settings. Either works fine on the free tier.

---

## 6. How content flows

Everything the admin adds through `admin-dashboard.html` is saved to
Firestore and instantly appears on the public pages — no code changes
needed for day-to-day updates:

| Admin adds…            | Appears on…                          |
|---|---|
| News / Notice           | Home page preview + `news.html`      |
| Event                    | Home page preview + `events.html`    |
| Achievement              | `achievements.html`                    |
| Gallery photo/video     | `gallery.html`                          |
| Logo, social links      | Header/footer on every page             |
| Student record           | Student ID system + result lookup       |
| Teacher record           | Teacher portal login                     |
| Result                    | That student's portal only               |

## 7. Student ID / roll number scheme

Generated automatically when the admin adds a student, following your format:
`QMPS-{year}-{gradeCode}-{gradeCode}{seq}` — e.g. **QMPS-26-7-7001** for the
first Grade 7 student added in 2026. Roll number is the `{gradeCode}{seq}`
part (e.g. `7001`). The sequence number increments automatically per class.

## 8. Password resets

- **Teacher:** admin clicks "Send Password Reset" → Firebase emails the
  teacher a reset link directly (free, no server needed). Teachers can also
  use "Forgot password?" on their own login page.
- **Student:** children don't have their own email, so the admin sets/resets
  a student's password directly from the Students panel ("Reset Password")
  and shares it with the student/parent.

## 9. Security model — please read

This is built for a small community school, not a bank, so the security
trade-offs below are intentional:

- **Admin** is the only account that can create/edit/delete content —
  enforced both in the UI and in `firestore.rules`.
- **Students** log in with a Student ID + password checked against a
  hash stored in Firestore. This is simple and free, but — unlike full
  Firebase Authentication — Firestore rules can't verify the password
  server-side, so the password *hash* (not the plain password) is
  technically fetchable by anyone who knows a valid Student ID. Parent
  contact numbers are kept in a separate, admin-only document specifically
  so they're never exposed this way.
- **Results** are readable by exact Student ID (matching your requirement
  that a search only returns that student's own result), but are not
  listable/browsable as a full list from outside the admin dashboard.

If you later want bank-grade security for the student portal (e.g. proper
per-student login sessions), that requires moving students onto Firebase
Authentication too, which is possible but adds real complexity — happy to
build that next if you want it.

---

## 10. What's left for you to add

Through the admin dashboard, once Firebase + Cloudinary are connected:
- Teacher records & assigned classes
- Student records & parent contacts
- Gallery photos/videos, achievements, news, notices, events
- School logo and social media links
- Results (per student, per exam)

The site works and looks complete right now with sample placeholder content
on every page — real content will replace it automatically once you start
adding records.
