/**
 * POST /api/send-card
 * Emails a finished ECAP ID card (front + back PNGs) to ECAP for printing,
 * entirely server-side — the participant's own mailbox is never involved.
 *
 * Body (JSON): { code, frontImage, backImage } — the two images as PNG data URLs.
 * The code must belong to a real, active registration, and the name /
 * nationality / organisation in the email come from the DATABASE, not from the
 * browser, so this endpoint can't be used to send arbitrary content to ECAP.
 *
 *   200 { ok: true } | 400 | 404 unknown code | 409 code was replaced |
 *   429 sent too many times | 501 not configured | 502 email provider error
 *
 * Environment variables: see api/_lib/db.js and api/_lib/email.js.
 */
const db = require("./_lib/db");
const mail = require("./_lib/email");
const { ECAP_COURSES } = require("../js/courses.js");

const MAX_SENDS_PER_REGISTRATION = 5;
const MAX_IMAGE_CHARS = 3000000;
const CODE_PATTERN = /^ECAP-[A-Z]{1,50}-[A-Z0-9]{3,10}-[A-Z0-9]{3}$/;
const PNG_PREFIX = "data:image/png;base64,";

function pngBase64(dataUrl) {
  if (typeof dataUrl !== "string" || dataUrl.length > MAX_IMAGE_CHARS || !dataUrl.startsWith(PNG_PREFIX)) return null;
  const b64 = dataUrl.slice(PNG_PREFIX.length);
  return /^[A-Za-z0-9+/]+={0,2}$/.test(b64) ? b64 : null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!db.isConfigured() || !mail.isConfigured()) {
    return res.status(501).json({ error: "Email sending is not configured yet." });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const code = String(body.code == null ? "" : body.code).trim().toUpperCase();
  const front = pngBase64(body.frontImage);
  const back = pngBase64(body.backImage);
  if (!CODE_PATTERN.test(code) || !front || !back) return res.status(400).json({ error: "Missing or invalid card data." });

  try {
    const reg = await db.findByCode(code);
    if (!reg) return res.status(404).json({ error: "Code not found." });
    if (reg.status !== "active") return res.status(409).json({ error: "This code was replaced by a newer registration." });
    if (reg.card_send_count >= MAX_SENDS_PER_REGISTRATION) {
      return res.status(429).json({ error: "This card has already been sent several times." });
    }

    const electiveNames = reg.electives
      .map((id) => { const c = ECAP_COURSES.find((x) => x.id === id); return c ? c.title : id; })
      .join(", ");
    const e = mail.escapeHtml;
    const html =
      "<h2>ECAP ID card ready for printing</h2>" +
      "<p><strong>Name:</strong> " + e(reg.full_name) + "<br/>" +
      "<strong>Course code:</strong> " + e(reg.code) + "<br/>" +
      "<strong>Cohort:</strong> " + e(reg.cohort_label) + "<br/>" +
      "<strong>Nationality:</strong> " + e(reg.nationality) + "<br/>" +
      "<strong>Organisation:</strong> " + e(reg.organisation) + "<br/>" +
      "<strong>Electives:</strong> " + e(electiveNames) + "</p>" +
      "<p>Front and back of the card are attached as PNG files. " +
      "Print once the participant's attendance is confirmed.</p>";

    const sent = await mail.sendToEcap({
      subject: "ECAP ID card — " + reg.full_name + " (" + reg.code + ")",
      html,
      attachments: [
        { filename: "ECAP-ID-" + reg.code + "-front.png", content: front },
        { filename: "ECAP-ID-" + reg.code + "-back.png", content: back },
      ],
    });
    if (!sent.ok) {
      console.error("card email failed", sent.detail);
      return res.status(502).json({ error: "Email provider error" });
    }

    try {
      await db.updateByCode(reg.code, { card_send_count: reg.card_send_count + 1, card_sent_at: new Date().toISOString() });
    } catch (err) { console.error("could not record card send", err); }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("send-card failed", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
};
