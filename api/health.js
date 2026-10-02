/**
 * GET /api/health
 * Runs once a day (see vercel.json) and does a tiny read on the database.
 * Supabase's free plan PAUSES a project after about a week with no activity,
 * and ECAP only registers people a few times a year — without this daily
 * touch, registration would go down in the quiet months.
 */
const db = require("./_lib/db");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!db.isConfigured()) return res.status(501).json({ ok: false, error: "Database not configured" });
  try {
    const ok = await db.ping();
    return res.status(ok ? 200 : 503).json({ ok });
  } catch (err) {
    console.error("health check failed", err);
    return res.status(503).json({ ok: false });
  }
};
