// =====================================================================
// FIREBASE SETUP — Quaid-e-Millat Public School Ameerabad
// -----------------------------------------------------------------
// 1. Go to https://console.firebase.google.com -> Add project
//    (keep it on the free "Spark" plan)
// 2. Project settings -> General -> "Your apps" -> Add app -> Web (</>)
// 3. Copy the firebaseConfig object it gives you and paste it below,
//    replacing the placeholder values.
// 4. In the left menu enable:
//      - Build > Authentication > Sign-in method > Email/Password (Enable)
//      - Build > Firestore Database > Create database (Start in
//        "production mode", pick a region close to Pakistan e.g.
//        asia-south1 or asia-south2)
// 5. Paste the rules from firestore.rules (included in this project)
//    into Firestore -> Rules, then Publish.
// =====================================================================

const firebaseConfig = {
  apiKey: "AIzaSyAjdAJwgrejm2n5G8tKfBAjGQUnPLk6g0k",
  authDomain: "new-school-106f5.firebaseapp.com",
  projectId: "new-school-106f5",
  storageBucket: "new-school-106f5.firebasestorage.app",
  messagingSenderId: "540476398266",
  appId: "1:540476398266:web:3ee903c251c033c3914083"
};

// Cloudinary is used for images/video/PDF files instead of Firebase
// Storage, because Firebase Storage now requires the paid Blaze plan.
// Create a free account at https://cloudinary.com, then in
// Settings -> Upload -> Upload presets, add an UNSIGNED preset and
// put its name + your cloud name below. Free tier: 25GB storage/25GB
// bandwidth per month, no card required.
const cloudinaryConfig = {
  cloudName: "l0uwh9xa",
  uploadPreset: "yqbipdn3"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const CLOUDINARY = cloudinaryConfig;

// Uploads a file to Cloudinary and returns its public URL.
// Usage: const url = await uploadToCloudinary(fileInput.files[0]);
export async function uploadToCloudinary(file) {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY.uploadPreset);
  const resourceType = file.type.startsWith("video") ? "video"
    : file.type === "application/pdf" ? "raw" : "image";
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/${resourceType}/upload`,
    { method: "POST", body: form }
  );
  if (!res.ok) throw new Error("Upload failed. Check your Cloudinary settings.");
  const data = await res.json();
  return data.secure_url;
}
