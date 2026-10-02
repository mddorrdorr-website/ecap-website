/**
 * GET /api/registration?code=ECAP-...
 * Looks a course code up so the ID card builder works from ANY device.
 * Returns only what is printed on the card (name, nationality, organisation)
 * plus the cohort and electives — never the email address or phone number.
 *   200 { status: "active", registration }
 *   200 { status: "superseded", replacedBy }   (the participant corrected their details)
 *   400 bad code format | 404 unknown code | 501 not configured | 500
 */
const db = require("./_lib/db");

const CODE_PATTERN = /^ECAP-[A-Z]{1,50}-[A-Z0-9]{3,10}-[A-Z0-9]{3}$/;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!db.isConfigured()) return res.status(501).json({ error: "Registration is not configured yet." });

  const raw = Array.isArray(req.query && req.query.code) ? req.query.code[0] : req.query && req.query.code;
  const code = String(raw == null ? "" : raw).trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) return res.status(400).json({ error: "That doesn't look like a course code." });

  try {
    const row = await db.findByCode(code);
    if (!row) return res.status(404).json({ error: "Code not found." });
    if (row.status === "superseded") return res.status(200).json({ status: "superseded", replacedBy: row.superseded_by || "" });
    return res.status(200).json({
      status: "active",
      registration: {
        code: row.code,
        fullName: row.full_name,
        nationality: row.nationality,
        organisation: row.organisation,
        cohortLabel: row.cohort_label,
        electives: row.electives,
      },
    });
  } catch (err) {
    console.error("lookup failed", err);
    return res.status(500).json({ error: "Could not look that code up. Please try again." });
  }
};
