/**
 * POST /api/register
 * Validates a registration on the SERVER, issues the course code (the server is
 * the only place a code is created, so uniqueness can be guaranteed), stores
 * the record in Supabase, and alerts ECAP by email in the background.
 *
 * Body (JSON): fullName, email, phone, nationality, organisation,
 *   cohortLocation (CN|UK|GH), cohortYear, electives (array of elective ids),
 *   replaces (optional: an earlier code the participant is correcting).
 * Responses: 201 { code, cohortLabel, notified } | 400 { errors } |
 *   429 too many | 501 not configured | 500.
 */
if (!globalThis.crypto) globalThis.crypto = require("node:crypto").webcrypto;

const db = require("./_lib/db");
const mail = require("./_lib/email");
const V = require("../js/validation.js");
const CODE = require("../js/course-code.js");
const { ECAP_COURSES, ECAP_COHORTS } = require("../js/courses.js");
const { ECAP_COUNTRIES } = require("../js/countries.js");

const MAX_PER_EMAIL_PER_HOUR = 5;
const MAX_CODE_ATTEMPTS = 6;
const ELECTIVE_IDS = new Set(ECAP_COURSES.filter((c) => c.group === "elective").map((c) => c.id));
const CODE_PATTERN = /^ECAP-[A-Z]{1,50}-[A-Z0-9]{3,10}-[A-Z0-9]{3}$/;

function validate(body) {
  const errors = {};
  const b = body && typeof body === "object" ? body : {};

  const fullName = String(b.fullName == null ? "" : b.fullName).trim();
  if (!V.isValidText(fullName, V.MAX_NAME)) errors.fullName = "Please enter your full name.";

  const email = String(b.email == null ? "" : b.email).trim().toLowerCase();
  if (!V.isValidEmail(email)) errors.email = "Please enter a valid email address.";

  const phone = String(b.phone == null ? "" : b.phone).trim();
  if (!V.isValidPhone(phone)) errors.phone = "Please enter a valid phone number.";

  const nationality = String(b.nationality == null ? "" : b.nationality).trim();
  if (!ECAP_COUNTRIES.includes(nationality)) errors.nationality = "Please select your nationality.";

  const organisation = String(b.organisation == null ? "" : b.organisation).trim();
  if (!V.isValidText(organisation, V.MAX_ORGANISATION)) errors.organisation = "Please enter your organisation.";

  const cohort = ECAP_COHORTS.find((c) => c.code === b.cohortLocation);
  const thisYear = new Date().getUTCFullYear();
  const cohortYear = Number(b.cohortYear);
  if (!cohort || !Number.isInteger(cohortYear) || cohortYear < thisYear || cohortYear > thisYear + 1) {
    errors.cohort = "Please choose a programme intake.";
  }

  const electives = Array.isArray(b.electives) ? [...new Set(b.electives.map(String))] : [];
  if (electives.length === 0 || !electives.every((id) => ELECTIVE_IDS.has(id))) {
    errors.electives = "Please select at least one elective programme.";
  }

  const replaces = typeof b.replaces === "string" && CODE_PATTERN.test(b.replaces.trim().toUpperCase())
    ? b.replaces.trim().toUpperCase() : "";

  if (Object.keys(errors).length) return { errors };
  return {
    clean: {
      fullName, email, phone, nationality, organisation, electives, replaces,
      cohortLocation: cohort.code,
      cohortYear,
      cohortLabel: cohort.monthName + " " + cohortYear + " — " + cohort.country + " (" + cohort.code + ")",
    },
  };
}

function buildCode(fullName, locationCode, year) {
  const initials = CODE.getInitials(fullName) || "XX"; // names the code alphabet can't represent
  return "ECAP-" + initials + "-" + locationCode + year + "-" + CODE.createRandomSuffix();
}

function alertHtml(r, code) {
  const rows = [
    ["Course code", code], ["Cohort", r.cohortLabel], ["Name", r.fullName], ["Email", r.email],
    ["Phone", r.phone], ["Nationality", r.nationality], ["Organisation", r.organisation],
    ["Electives", r.electives.join(", ")],
  ];
  const note = r.replacedCode ? "<p><strong>This replaces the earlier registration " + mail.escapeHtml(r.replacedCode) + ".</strong></p>" : "";
  return "<h2>" + (r.replacedCode ? "Updated" : "New") + " ECAP registration</h2>" + note +
    "<table cellpadding='6' style='border-collapse:collapse'>" +
    rows.map((x) => "<tr><td><strong>" + x[0] + "</strong></td><td>" + mail.escapeHtml(x[1]) + "</td></tr>").join("") +
    "</table><p>The 7 core programmes are included for every participant.</p>";
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!db.isConfigured()) return res.status(501).json({ error: "Registration is not configured yet." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  // Hidden form field that real people never see — bots fill it in.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return res.status(400).json({ error: "Invalid request." });
  }

  const { errors, clean } = validate(body);
  if (errors) return res.status(400).json({ errors });

  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    if ((await db.countRecentByEmail(clean.email, since)) >= MAX_PER_EMAIL_PER_HOUR) {
      return res.status(429).json({ error: "Too many registrations for this email address. Please try again later." });
    }

    let code = "", saved = false;
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !saved; attempt++) {
      code = buildCode(clean.fullName, clean.cohortLocation, clean.cohortYear);
      const result = await db.insertRegistration({
        code,
        full_name: clean.fullName,
        email: clean.email,
        phone: clean.phone,
        nationality: clean.nationality,
        organisation: clean.organisation,
        cohort_location: clean.cohortLocation,
        cohort_year: clean.cohortYear,
        cohort_label: clean.cohortLabel,
        electives: clean.electives,
      });
      saved = result.ok; // on a collision, loop and try a fresh random ending
    }
    if (!saved) return res.status(503).json({ error: "Could not issue a course code. Please try again." });

    // Correcting an earlier registration: retire the old code, but only if the
    // email matches, so nobody can cancel someone else's registration.
    let replacedCode = "";
    if (clean.replaces) {
      try {
        const old = await db.findByCode(clean.replaces);
        if (old && old.status === "active" && old.email === clean.email && clean.replaces !== code) {
          await db.updateByCode(clean.replaces, { status: "superseded", superseded_by: code });
          replacedCode = clean.replaces;
        }
      } catch (e) { console.error("supersede failed", e); }
    }

    const sent = await mail.sendToEcap({
      subject: (replacedCode ? "Updated ECAP registration — " : "New ECAP registration — ") + clean.fullName + " (" + code + ")",
      html: alertHtml(Object.assign({}, clean, { replacedCode }), code),
    });
    if (!sent.ok && !sent.skipped) console.error("registration alert failed", sent.detail);

    return res.status(201).json({ code, cohortLabel: clean.cohortLabel, notified: sent.ok });
  } catch (err) {
    console.error("register failed", err);
    return res.status(500).json({ error: "Something went wrong saving your registration. Please try again." });
  }
};

module.exports.validate = validate; // exposed for tests
