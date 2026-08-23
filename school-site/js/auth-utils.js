// Hashes text with SHA-256 (used for the simple Student ID + password
// portal, which is intentionally lightweight — see README "Security
// model" section for why this fits a small school site on the free
// Firebase plan).
export async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
