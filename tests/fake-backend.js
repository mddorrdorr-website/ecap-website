// In-memory stand-in for Supabase (PostgREST) and Resend. Used by the test
// suite and by tests/dev-server.js, so the whole site can be exercised locally
// without any real accounts or secrets. Replaces global fetch.
const world = {
  rows: [], emails: [], calls: [], forceCollisions: 0, resendOk: true,
  reset() { this.rows = []; this.emails = []; this.calls = []; this.forceCollisions = 0; this.resendOk = true; },
};

function matches(row, params) {
  for (const [key, val] of params) {
    if (["select", "limit"].includes(key)) continue;
    const [op, ...rest] = val.split("."); const v = rest.join(".");
    if (op === "eq" && String(row[key]) !== v) return false;
    if (op === "gte" && !(row[key] >= v)) return false;
  }
  return true;
}

function install() {
  const realFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    url = String(url);
    const json = (status, data) => ({ status, ok: status < 300, text: async () => (data === undefined ? "" : JSON.stringify(data)) });
    if (url.startsWith("https://api.resend.com")) {
      world.emails.push(JSON.parse(opts.body));
      return world.resendOk ? json(200, { id: "x" }) : json(500, { message: "boom" });
    }
    const u = new URL(url);
    world.calls.push({ method: opts.method, path: u.pathname, headers: opts.headers });
    const method = opts.method || "GET";
    if (method === "GET") {
      const limit = Number(u.searchParams.get("limit") || 1000);
      return json(200, world.rows.filter((r) => matches(r, u.searchParams)).slice(0, limit).map((r) => ({ ...r })));
    }
    if (method === "POST") {
      const row = JSON.parse(opts.body);
      if (world.forceCollisions > 0) { world.forceCollisions--; return json(409, { code: "23505" }); }
      if (world.rows.some((r) => r.code === row.code)) return json(409, { code: "23505" });
      const full = { status: "active", superseded_by: null, card_send_count: 0, card_sent_at: null, created_at: new Date().toISOString(), ...row };
      world.rows.push(full);
      return json(201, [full]);
    }
    if (method === "PATCH") {
      world.rows.filter((r) => matches(r, u.searchParams)).forEach((r) => Object.assign(r, JSON.parse(opts.body)));
      return json(204);
    }
    return json(500, {});
  };
  return () => { global.fetch = realFetch; };
}

module.exports = { world, install };
