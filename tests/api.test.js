// Run with:  node --test tests/
// Exercises the serverless functions against an in-memory stand-in for
// Supabase (PostgREST) and Resend, so no real accounts or secrets are needed.
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "sb_secret_test";
process.env.RESEND_API_KEY = "re_test";

const register = require("../api/register.js");
const lookup = require("../api/registration.js");
const sendCard = require("../api/send-card.js");
const health = require("../api/health.js");

const YEAR = new Date().getUTCFullYear();
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const { world, install } = require("./fake-backend.js");
const uninstall = install();

function call(handler, { method = "POST", body, query } = {}) {
  const res = { statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(o) { this.body = o; return this; } };
  return Promise.resolve(handler({ method, body, query }, res)).then(() => res);
}

const good = (over = {}) => ({
  fullName: "Ama Serwaa", email: "Ama@Example.com", phone: "0244123456", nationality: "Ghana",
  organisation: "Acme Ltd", cohortLocation: "CN", cohortYear: YEAR, electives: ["marketing"], ...over,
});

// ---------- registration ----------
test("a valid registration is stored, gets a well-formed code, and alerts ECAP", async () => {
  world.reset();
  const r = await call(register, { body: good({ fullName: "Ama <b>Serwaa</b>" }) });
  assert.equal(r.statusCode, 201);
  assert.match(r.body.code, /^ECAP-AB-CN\d{4}-[A-Z0-9]{3}$/);
  assert.equal(r.body.notified, true);
  assert.equal(world.rows.length, 1);
  assert.equal(world.rows[0].email, "ama@example.com", "email is stored lower-case");
  assert.equal(world.emails.length, 1);
  assert.ok(!world.emails[0].html.includes("<b>Serwaa</b>"), "participant text is HTML-escaped in the alert");
  assert.ok(world.emails[0].html.includes("&lt;b&gt;"));
});

test("blank and bogus input is rejected field by field and nothing is stored", async () => {
  world.reset();
  const r = await call(register, { body: {} });
  assert.equal(r.statusCode, 400);
  for (const f of ["fullName", "email", "phone", "nationality", "organisation", "cohort", "electives"]) assert.ok(r.body.errors[f], f);
  assert.equal(world.rows.length, 0);
});

test("only real countries, real electives, real cohorts and sensible years are accepted", async () => {
  world.reset();
  const bad = [
    good({ nationality: "Atlantis" }), good({ electives: ["leadership"] }), good({ electives: [] }),
    good({ cohortLocation: "US" }), good({ cohortYear: YEAR + 5 }), good({ cohortYear: YEAR - 1 }),
    good({ phone: "123" }), good({ email: "nope" }), good({ fullName: "x".repeat(101) }),
  ];
  for (const body of bad) assert.equal((await call(register, { body })).statusCode, 400, JSON.stringify(body).slice(0, 80));
  assert.equal(world.rows.length, 0);
});

test("the bot trap field blocks the request", async () => {
  world.reset();
  const r = await call(register, { body: good({ website: "http://spam" }) });
  assert.equal(r.statusCode, 400);
  assert.equal(world.rows.length, 0);
});

test("no more than 5 registrations per email address per hour", async () => {
  world.reset();
  for (let i = 0; i < 5; i++) assert.equal((await call(register, { body: good() })).statusCode, 201);
  assert.equal((await call(register, { body: good() })).statusCode, 429);
  assert.equal((await call(register, { body: good({ email: "other@example.com" }) })).statusCode, 201);
});

test("a code collision is retried with a fresh ending; endless collisions give up cleanly", async () => {
  world.reset(); world.forceCollisions = 2;
  assert.equal((await call(register, { body: good() })).statusCode, 201);
  world.reset(); world.forceCollisions = 99;
  assert.equal((await call(register, { body: good() })).statusCode, 503);
});

test("a failing email provider does not lose the registration", async () => {
  world.reset(); world.resendOk = false;
  const r = await call(register, { body: good() });
  assert.equal(r.statusCode, 201);
  assert.equal(r.body.notified, false);
  assert.equal(world.rows.length, 1);
});

test("a name the code alphabet can't represent still registers (falls back to XX)", async () => {
  world.reset();
  const r = await call(register, { body: good({ fullName: "Ama - Serwaa" }) });
  assert.equal(r.statusCode, 201);
  assert.match(r.body.code, /^ECAP-XX-CN/);
});

test("correcting a registration retires the old code — but only for the same email", async () => {
  world.reset();
  const first = (await call(register, { body: good() })).body.code;
  const second = (await call(register, { body: good({ replaces: first, nationality: "Nigeria" }) })).body.code;
  assert.notEqual(first, second);
  assert.equal(world.rows.find((r) => r.code === first).status, "superseded");
  assert.equal(world.rows.find((r) => r.code === first).superseded_by, second);

  world.reset();
  const victim = (await call(register, { body: good() })).body.code;
  await call(register, { body: good({ email: "attacker@example.com", replaces: victim }) });
  assert.equal(world.rows.find((r) => r.code === victim).status, "active", "someone else's code stays valid");
});

// ---------- lookup ----------
test("lookup returns card details but never the email or phone", async () => {
  world.reset();
  const code = (await call(register, { body: good() })).body.code;
  const r = await call(lookup, { method: "GET", query: { code: code.toLowerCase() } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.status, "active");
  assert.equal(r.body.registration.fullName, "Ama Serwaa");
  const text = JSON.stringify(r.body);
  assert.ok(!text.includes("example.com") && !text.includes("0244123456"), "no personal contact details leak");
});

test("lookup handles replaced, unknown and malformed codes", async () => {
  world.reset();
  const a = (await call(register, { body: good() })).body.code;
  const b = (await call(register, { body: good({ replaces: a }) })).body.code;
  const old = await call(lookup, { method: "GET", query: { code: a } });
  assert.deepEqual(old.body, { status: "superseded", replacedBy: b });
  assert.equal((await call(lookup, { method: "GET", query: { code: "ECAP-ZZ-CN2026-AAA" } })).statusCode, 404);
  assert.equal((await call(lookup, { method: "GET", query: { code: "'; drop table" } })).statusCode, 400);
  assert.equal((await call(lookup, { method: "GET", query: {} })).statusCode, 400);
});

// ---------- card sending ----------
test("a card is emailed using database details, not browser-supplied ones, and the send is counted", async () => {
  world.reset();
  const code = (await call(register, { body: good() })).body.code;
  world.emails.length = 0;
  const r = await call(sendCard, { body: { code, frontImage: PNG, backImage: PNG, fullName: "FAKE NAME" } });
  assert.equal(r.statusCode, 200);
  assert.equal(world.emails.length, 1);
  assert.ok(world.emails[0].subject.includes("Ama Serwaa") && !world.emails[0].subject.includes("FAKE"));
  assert.equal(world.emails[0].attachments.length, 2);
  assert.equal(world.rows[0].card_send_count, 1);
  assert.ok(world.rows[0].card_sent_at);
});

test("sending is refused for unknown codes, replaced codes, bad images, and after 5 sends", async () => {
  world.reset();
  const a = (await call(register, { body: good() })).body.code;
  assert.equal((await call(sendCard, { body: { code: "ECAP-ZZ-CN2026-AAA", frontImage: PNG, backImage: PNG } })).statusCode, 404);
  assert.equal((await call(sendCard, { body: { code: a, frontImage: "data:text/html;base64,AAAA", backImage: PNG } })).statusCode, 400);
  assert.equal((await call(sendCard, { body: { code: a, frontImage: "x".repeat(3100000), backImage: PNG } })).statusCode, 400);
  for (let i = 0; i < 5; i++) assert.equal((await call(sendCard, { body: { code: a, frontImage: PNG, backImage: PNG } })).statusCode, 200);
  assert.equal((await call(sendCard, { body: { code: a, frontImage: PNG, backImage: PNG } })).statusCode, 429);

  const b = (await call(register, { body: good({ replaces: a }) })).body.code;
  assert.equal((await call(sendCard, { body: { code: a, frontImage: PNG, backImage: PNG } })).statusCode, 409);
  assert.equal((await call(sendCard, { body: { code: b, frontImage: PNG, backImage: PNG } })).statusCode, 200);
});

test("a provider failure on card send returns 502 and does not count the send", async () => {
  world.reset();
  const code = (await call(register, { body: good() })).body.code;
  world.resendOk = false;
  assert.equal((await call(sendCard, { body: { code, frontImage: PNG, backImage: PNG } })).statusCode, 502);
  assert.equal(world.rows[0].card_send_count, 0);
});

// ---------- configuration & plumbing ----------
test("wrong methods are refused", async () => {
  assert.equal((await call(register, { method: "GET" })).statusCode, 405);
  assert.equal((await call(lookup, { method: "POST" })).statusCode, 405);
  assert.equal((await call(sendCard, { method: "GET" })).statusCode, 405);
});

test("every endpoint reports 'not configured' (501) rather than crashing when secrets are missing", async () => {
  const saved = { u: process.env.SUPABASE_URL, k: process.env.SUPABASE_SERVICE_KEY, r: process.env.RESEND_API_KEY };
  delete process.env.SUPABASE_URL;
  assert.equal((await call(register, { body: good() })).statusCode, 501);
  assert.equal((await call(lookup, { method: "GET", query: { code: "ECAP-AS-CN2026-AAA" } })).statusCode, 501);
  assert.equal((await call(sendCard, { body: {} })).statusCode, 501);
  assert.equal((await call(health, { method: "GET" })).statusCode, 501);
  process.env.SUPABASE_URL = saved.u;
  delete process.env.RESEND_API_KEY;
  assert.equal((await call(sendCard, { body: {} })).statusCode, 501);
  process.env.RESEND_API_KEY = saved.r; process.env.SUPABASE_SERVICE_KEY = saved.k;
});

test("the database key is sent the right way for both key styles", async () => {
  world.reset();
  await call(health, { method: "GET" });
  assert.equal(world.calls[0].headers.apikey, "sb_secret_test");
  assert.equal(world.calls[0].headers.Authorization, undefined, "new-style keys go in apikey only");
  const old = process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_SERVICE_KEY = "eyJlegacy.jwt.key";
  world.calls.length = 0; await call(health, { method: "GET" });
  assert.equal(world.calls[0].headers.Authorization, "Bearer eyJlegacy.jwt.key");
  process.env.SUPABASE_SERVICE_KEY = old;
});

test("the health check reports ok when the database answers", async () => {
  world.reset();
  const r = await call(health, { method: "GET" });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { ok: true });
});

test.after(() => uninstall());
