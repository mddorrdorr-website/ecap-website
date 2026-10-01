/* ECAP registration + course-code storage.
   MVP: browser localStorage (same-device lookup). Upgrade path: swap these
   functions for calls to a Supabase table — nothing else needs to change.

   Code format: ECAP-<INITIALS>-<LOCATION><YY>-<RANDOM3>
   e.g. ECAP-AS-CN26-7K2  (Ama Serwaa, China cohort, 2026, random suffix)
   The three cohorts run: October in China (CN), February in the UK (UK),
   June in Ghana (GH) — see ECAP_COHORTS in js/courses.js. */
(function (global) {
  "use strict";
  const KEY = "ecap_registrations";
  const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids transcription errors

  function randomBlock(len) {
    let s = "";
    for (let i = 0; i < len; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
    return s;
  }

  function readAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
    catch (e) { return {}; }
  }

  function writeAll(all) {
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* storage unavailable */ }
  }

  function initialsOf(fullName) {
    const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "XX";
    if (parts.length === 1) return (parts[0] + "X").slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function generateCode(fullName, locationCode, year) {
    const all = readAll();
    const initials = initialsOf(fullName);
    const yy = String(year).slice(-2);
    const loc = String(locationCode || "XX").toUpperCase();
    let code;
    do { code = "ECAP-" + initials + "-" + loc + yy + "-" + randomBlock(3); } while (all[code]);
    return code;
  }

  function saveRegistration(record) {
    const all = readAll();
    const code = generateCode(record.fullName, record.cohortLocation, record.cohortYear);
    all[code] = Object.assign({}, record, { code: code, createdAt: new Date().toISOString() });
    writeAll(all);
    return code;
  }

  function lookupCode(code) {
    const all = readAll();
    return all[(code || "").trim().toUpperCase()] || null;
  }

  global.EcapRegistration = { generateCode, saveRegistration, lookupCode, initialsOf };
})(window);
