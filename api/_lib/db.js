/* Minimal Supabase (PostgREST) client for the serverless functions — plain
   fetch, no npm packages. Uses the project's SECRET key, which bypasses Row
   Level Security, so it must only ever run here on the server and be read
   from environment variables (never put it in any file or page).

   Required Vercel environment variables:
     SUPABASE_URL          e.g. https://abcdefgh.supabase.co
     SUPABASE_SERVICE_KEY  the project's secret / service_role key */

function config() {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SERVICE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

function isConfigured() {
  return config() !== null;
}

// Newer "sb_secret_..." keys go in the apikey header only; legacy JWT-style
// service_role keys also need an Authorization header.
function authHeaders(key) {
  const h = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_")) h.Authorization = "Bearer " + key;
  return h;
}

async function rest(method, path, body, prefer) {
  const cfg = config();
  if (!cfg) throw new Error("Database is not configured");
  const headers = authHeaders(cfg.key);
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(cfg.url + "/rest/v1/" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  return { status: res.status, data };
}

// PostgREST filter values: percent-encode, so odd characters can't alter a query.
const q = (value) => encodeURIComponent(String(value));

const COLUMNS =
  "code,full_name,email,phone,nationality,organisation,cohort_location,cohort_year,cohort_label,electives,status,superseded_by,card_send_count,created_at";

async function findByCode(code) {
  const r = await rest("GET", "registrations?code=eq." + q(code) + "&select=" + COLUMNS + "&limit=1");
  if (r.status !== 200) throw new Error("Lookup failed (" + r.status + ")");
  return r.data && r.data[0] ? r.data[0] : null;
}

async function countRecentByEmail(email, sinceIso) {
  const r = await rest(
    "GET",
    "registrations?email=eq." + q(email) + "&created_at=gte." + q(sinceIso) + "&select=id&limit=50"
  );
  if (r.status !== 200) throw new Error("Rate-limit lookup failed (" + r.status + ")");
  return r.data.length;
}

// Returns { ok: true, row } or { ok: false, duplicate: true } when the code already exists.
async function insertRegistration(row) {
  const r = await rest("POST", "registrations", row, "return=representation");
  if (r.status === 201) return { ok: true, row: r.data[0] };
  if (r.status === 409) return { ok: false, duplicate: true };
  throw new Error("Insert failed (" + r.status + "): " + JSON.stringify(r.data));
}

async function updateByCode(code, patch) {
  const r = await rest("PATCH", "registrations?code=eq." + q(code), patch, "return=minimal");
  if (r.status !== 204 && r.status !== 200) throw new Error("Update failed (" + r.status + ")");
}

// Returns { ok, status }; status 0 means the database could not be reached at all.
async function ping() {
  try {
    const r = await rest("GET", "registrations?select=id&limit=1");
    return { ok: r.status === 200, status: r.status };
  } catch (e) {
    return { ok: false, status: 0 };
  }
}

module.exports = { isConfigured, findByCode, countRecentByEmail, insertRegistration, updateByCode, ping };
