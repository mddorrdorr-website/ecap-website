/* Sends mail through Resend. Used by the registration alert and the ID-card
   sender.

   Environment variables (Vercel):
     RESEND_API_KEY   required to send anything
     ECAP_FROM_EMAIL  sender on the verified domain, e.g. "ECAP <cards@mddorrdorrgh.org>"
     ECAP_TO_EMAIL    where ECAP's own alerts/cards go (default below) */

const DEFAULT_TO = "mddorrdorr.gh@gmail.com";
const DEFAULT_FROM = "ECAP <onboarding@resend.dev>";

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Returns { ok: true } or { ok: false, skipped?: true, detail }.
async function sendToEcap({ subject, html, attachments }) {
  if (!isConfigured()) return { ok: false, skipped: true, detail: "RESEND_API_KEY is not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.ECAP_FROM_EMAIL || DEFAULT_FROM,
        to: [process.env.ECAP_TO_EMAIL || DEFAULT_TO],
        subject,
        html,
        attachments,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, detail: await res.text() };
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: String(err) };
  }
}

module.exports = { isConfigured, escapeHtml, sendToEcap };
