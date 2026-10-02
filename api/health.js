/**
 * GET /api/health
 * Runs once a day (see vercel.json) and does a tiny read on the database.
 * Supabase's free plan PAUSES a project after about a week with no activity,
 * and ECAP only registers people a few times a year — without this daily
 * touch, registration would go down in the quiet months.
 */
const db = require("./_lib/db");

function explain(status, info) {
  if (status === 0) return "Could not reach the database at " + info.host + ". Check that this matches your Supabase project's URL exactly, and that the project is not paused.";
  if (status === 401 || status === 403) return "The database rejected the key. Check SUPABASE_SERVICE_KEY.";
  if (status === 404) return "Table not found. Has supabase/schema.sql been run? (Or SUPABASE_URL points at the wrong project.)";
  return "Unexpected database response (" + status + ").";
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const info = db.describe();
  if (!db.isConfigured()) {
    let reason = "SUPABASE_URL and SUPABASE_SERVICE_KEY are not both set.";
    if (info.urlSet && !info.urlValid) reason = "SUPABASE_URL is not a valid web address. It should look like https://abcdefgh.supabase.co";
    else if (info.urlSet && !info.keySet) reason = "SUPABASE_SERVICE_KEY is not set.";
    else if (!info.urlSet && info.keySet) reason = "SUPABASE_URL is not set.";
    return res.status(501).json({ ok: false, reason });
  }
  const result = await db.ping();
  if (result.ok) return res.status(200).json({ ok: true });
  console.error("health check failed, database status", result.status);
  return res.status(503).json({ ok: false, reason: explain(result.status, info) });
};
