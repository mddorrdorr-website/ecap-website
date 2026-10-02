/* ECAP registration client — talks to the website's own server functions.
   Registrations live in the database (not in this browser), so a participant
   can register on one device and build their ID card on another.

   register(fields)  -> POST /api/register    (the SERVER issues the course code)
   lookup(code)      -> GET  /api/registration (card details for a code)

   Both resolve to { ok, status, data, network }:
     network: true when the server couldn't be reached at all;
     otherwise status/data are the server's response. They never throw. */
(function (global) {
  "use strict";

  async function request(method, url, body) {
    let res;
    try {
      res = await fetch(url, {
        method: method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      return { ok: false, network: true, status: 0, data: null };
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON error page */ }
    return { ok: res.ok, network: false, status: res.status, data: data };
  }

  function register(fields) {
    return request("POST", "/api/register", fields);
  }

  function lookup(code) {
    return request("GET", "/api/registration?code=" + encodeURIComponent(String(code || "").trim().toUpperCase()));
  }

  global.EcapRegistration = { register: register, lookup: lookup };
})(window);
