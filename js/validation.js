/* Shared field validation — loaded by the registration page in the browser AND
   required by the serverless functions, so both always apply the same rules.
   (The server must re-check everything: browser checks can be bypassed.) */
(function (root) {
  "use strict";

  var CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

  function isValidEmail(value) {
    var v = String(value == null ? "" : value).trim();
    return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  // Ghana, China and the UK get their real local/international digit counts;
  // any other country gets a generous generic international sanity check.
  function isValidPhone(raw) {
    var v = String(raw == null ? "" : raw).replace(/[\s().-]/g, "");
    if (!v || v.length > 25) return false;
    if (v[0] === "+") {
      var rest = v.slice(1);
      if (!/^\d+$/.test(rest)) return false;
      if (rest.indexOf("233") === 0) return rest.length === 12; // +233 + 9 digits (GH)
      if (rest.indexOf("86") === 0) return rest.length === 13;  // +86 + 11 digits (CN)
      if (rest.indexOf("44") === 0) return rest.length === 12;  // +44 + 10 digits (UK, leading 0 dropped)
      return rest.length >= 8 && rest.length <= 15;
    }
    if (!/^\d+$/.test(v)) return false;
    if (v[0] === "0" && v.length === 10) return true; // GH local: 0XXXXXXXXX
    if (v[0] === "1" && v.length === 11) return true; // CN local: 1XXXXXXXXXX
    if (v[0] === "0" && v.length === 11) return true; // UK local: 0XXXXXXXXXX
    return v.length >= 7 && v.length <= 12;
  }

  // Free-text names: non-empty, bounded, and no control characters.
  function isValidText(value, maxLength) {
    var v = String(value == null ? "" : value).trim();
    return v.length > 0 && v.length <= maxLength && !CONTROL_CHARS.test(v);
  }

  var api = Object.freeze({
    isValidEmail: isValidEmail,
    isValidPhone: isValidPhone,
    isValidText: isValidText,
    MAX_NAME: 100,
    MAX_ORGANISATION: 150
  });
  root.ECAPValidation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
