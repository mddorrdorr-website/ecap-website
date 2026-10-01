/* ECAP registration + course-code storage.
   MVP: browser localStorage (same-device lookup). Upgrade path: swap these
   three functions for calls to a Supabase table — nothing else needs to change. */
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

  function generateCode() {
    const all = readAll();
    let code;
    do { code = "ECAP-" + randomBlock(4) + "-" + randomBlock(4); } while (all[code]);
    return code;
  }

  function saveRegistration(record) {
    const all = readAll();
    const code = generateCode();
    all[code] = Object.assign({}, record, { code: code, createdAt: new Date().toISOString() });
    writeAll(all);
    return code;
  }

  function lookupCode(code) {
    const all = readAll();
    return all[(code || "").trim().toUpperCase()] || null;
  }

  global.EcapRegistration = { generateCode, saveRegistration, lookupCode };
})(window);
