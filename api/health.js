/**
 * GET /api/health
 * Runs once a day (see vercel.json) and does a tiny read on the database.
 * Supabase's free plan PAUSES a project after about a week with no activity,
 * and ECAP only registers people a few times a year — without this daily
 * touch, registration would go down in the quiet months.
 */
const db = require("./_lib/db");

function explain(status) {
  if (status === 0) return "Could not reach the database. Check SUPABASE_URL.";
  if (status === 401 || status === 403) return "The database rejected the key. Check SUPABASE_SERVICE_KEY.";
  if (status === 404) return "Table not found. Has supabase/schema.sql been run? (Or SUPABASE_URL points at the wrong project.)";
  return "Unexpected database response (" + status + ").";
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!db.isConfigured()) return res.status(501).json({ ok: false, reason: "SUPABASE_URL / SUPABASE_SERVICE_KEY are not set." });
  const result = await db.ping();
  if (result.ok) return res.status(200).json({ ok: true });
  console.error("health check failed, database status", result.status);
  return res.status(503).json({ ok: false, reason: explain(result.status) });
};
