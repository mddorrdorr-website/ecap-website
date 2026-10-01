/* ECAP course-code helpers. No dependencies or network calls.
 * Format: ECAP-<Initials>-<Location><Year>-<Random3>
 * Example: ECAP-AS-GH2026-7K2
 *
 * Keep one generated suffix for the registration being edited. Formatting is
 * deterministic and never generates or changes a suffix. The production
 * server must enforce uniqueness of the complete course code and retry on a
 * collision; a three-character suffix alone is not a uniqueness guarantee.
 */
(function (root) {
  "use strict";

  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const ACCEPT_BELOW = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

  function normaliseLetters(value) {
    return value.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
  }

  function getInitials(fullName) {
    if (typeof fullName !== "string" || !fullName.trim()) return "";
    const words = normaliseLetters(fullName.trim()).split(/\s+/u);
    let initials = "";
    for (const word of words) {
      // Punctuation before a name is harmless. A hyphenated name stays one
      // whitespace-separated word. Do not silently skip an unsupported name.
      const firstLetter = word.match(/\p{L}/u);
      if (!firstLetter || !/^[A-Z]$/.test(firstLetter[0])) return "";
      initials += firstLetter[0];
    }
    return initials;
  }

  function normaliseLocationCode(locationCode) {
    if (typeof locationCode !== "string") return "";
    const code = normaliseLetters(locationCode).replace(/[^A-Z0-9]/g, "");
    return /^[A-Z0-9]{1,8}$/.test(code) ? code : "";
  }

  function createRandomSuffix() {
    const secureCrypto = root.crypto;
    if (!secureCrypto || typeof secureCrypto.getRandomValues !== "function") {
      throw new Error("Secure random generation is unavailable. Use Web Crypto or obtain a suffix from the server.");
    }
    let suffix = "";
    const bytes = new Uint8Array(16);
    while (suffix.length < 3) {
      secureCrypto.getRandomValues(bytes);
      for (const byte of bytes) {
        // 252 is divisible by 36. Reject the remaining four byte values so
        // every alphabet character has exactly the same probability.
        if (byte < ACCEPT_BELOW) suffix += ALPHABET[byte % ALPHABET.length];
        if (suffix.length === 3) break;
      }
    }
    return suffix;
  }

  function formatCourseCode(components) {
    if (!components || typeof components !== "object") return "";
    const initials = getInitials(components.fullName);
    const location = normaliseLocationCode(components.locationCode);
    const year = typeof components.year === "number" || typeof components.year === "string"
      ? String(components.year).trim()
      : "";
    const suffix = typeof components.randomSuffix === "string" ? components.randomSuffix.trim() : "";
    if (!initials || !location || !/^\d{4}$/.test(year) || !/^[A-Z0-9]{3}$/.test(suffix)) return "";
    return "ECAP-" + initials + "-" + location + year + "-" + suffix;
  }

  const api = Object.freeze({
    getInitials: getInitials,
    normaliseLocationCode: normaliseLocationCode,
    createRandomSuffix: createRandomSuffix,
    formatCourseCode: formatCourseCode
  });
  root.ECAPCourseCode = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
