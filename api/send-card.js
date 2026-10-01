/**
 * POST /api/send-card
 * Emails a finished ECAP ID card (front + back PNGs, base64) to ECAP for printing.
 * Uses Resend (https://resend.com) — free tier, no extra npm dependency needed
 * since Vercel's Node runtime has global fetch built in.
 *
 * Required env var (set in Vercel → Project → Settings → Environment Variables):
 *   RESEND_API_KEY   — from resend.com after a free signup
 * Optional:
 *   ECAP_TO_EMAIL    — inbox that receives finished cards (defaults below)
 *   ECAP_FROM_EMAIL  — must be "onboarding@resend.dev" until a sending domain
 *                      is verified in Resend, then switch to your own domain
 *
 * Until RESEND_API_KEY is set, this responds 501 so the front-end's built-in
 * fallback (download + mailto draft) takes over automatically.
 */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(501).json({ error: "Email sending is not configured yet (missing RESEND_API_KEY)." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const { code, fullName, nationality, organisation, electives, frontImage, backImage } = body;

  if (!code || !fullName || !frontImage || !backImage) {
    res.status(400).json({ error: "Missing required fields." });
    return;
  }

  const toEmail = process.env.ECAP_TO_EMAIL || "mddorrdorr.gh@gmail.com";
  const fromEmail = process.env.ECAP_FROM_EMAIL || "ECAP <onboarding@resend.dev>";

  const stripPrefix = (dataUrl) => String(dataUrl).replace(/^data:image\/\w+;base64,/, "");

  const html =
    "<h2>New ECAP ID card ready for printing</h2>" +
    "<p><strong>Name:</strong> " + escapeHtml(fullName) + "<br/>" +
    "<strong>Course code:</strong> " + escapeHtml(code) + "<br/>" +
    "<strong>Nationality:</strong> " + escapeHtml(nationality || "—") + "<br/>" +
    "<strong>Organisation:</strong> " + escapeHtml(organisation || "—") + "<br/>" +
    "<strong>Electives:</strong> " + escapeHtml((electives || []).join(", ") || "—") + "</p>" +
    "<p>Front and back of the card are attached as PNG files.</p>";

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: "ECAP ID card — " + fullName + " (" + code + ")",
        html: html,
        attachments: [
          { filename: "ECAP-ID-" + code + "-front.png", content: stripPrefix(frontImage) },
          { filename: "ECAP-ID-" + code + "-back.png", content: stripPrefix(backImage) },
        ],
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      res.status(502).json({ error: "Email provider error", detail: errText });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Unexpected server error", detail: String(err) });
  }
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
