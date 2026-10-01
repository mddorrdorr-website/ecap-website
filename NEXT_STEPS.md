# ECAP Website — Build Status

## Done (2026-10-01)
Full standalone site built and tested locally end-to-end. Git repo initialized,
2 commits (`0bedef7` scaffold, `b17c51c` full build).

Pages:
- `index.html` — home (hero, about, why ECAP, coming soon, CTA)
- `board.html` — Board of Directors (6 placeholder member cards — swap in real names/titles/photos any time)
- `gallery.html` — photo grid (6 placeholders) + 2 video slots (placeholders with instructions to embed real YouTube/Vimeo links or local video files)
- `programmes.html` — all 14 courses rendered from `js/courses.js`, grouped Core (mandatory) / Elective (choose 1+), each expands into a course outline; plus an "Upcoming Cohorts" pricing/dates section (placeholder dates/fees, marked "enquire")
- `contact.html` — mailto-based enquiry form (same proven pattern as mddorrdorr-website) + WhatsApp
- `register.html` — registration form; core courses shown locked/pre-checked, elective checkboxes required (≥1); on submit generates a unique code (format `ECAP-XXXX-XXXX`, stored in browser localStorage) and opens a confirmation email draft to ECAP
- `id-card.html` — course-code gated (auto-advances if arriving via `?code=` from registration); portrait ID card builder: own-photo upload (FileReader, held only in a JS variable — never written to disk/localStorage/any server), live CSS 3D flip preview (front: logo+org name, photo, full name, course code, nationality, organisation; back: logo + "Building Our Africa Together." slogan, bold), Canvas 2D renderer producing real front/back PNGs, "Download" button, and a small discreet "Send final card to ECAP for printing" text-link
- `api/send-card.js` — Vercel serverless function (zero npm dependencies, uses global fetch), emails the two PNGs via Resend once `RESEND_API_KEY` is set as a Vercel env var; until then, the send link gracefully falls back to downloading both images + opening a mailto draft

## Assumptions made — confirm or correct these
1. **"printed badly at the back"** → read as a typo for **"boldly"**. Back of card currently shows the logo + slogan large and centered. Say the word if something else was meant.
2. **Core vs Elective split** → reused the existing 7+7 split: the old "Core Programmes" are mandatory, the old "Executive Programmes" are the elective pool. Easy to re-flag any course in `js/courses.js` (`group: "core"` or `"elective"`).
3. **Course code format**: `ECAP-XXXX-XXXX`, uppercase, excludes ambiguous characters (0/O/1/I).
4. **Portrait card ratio**: 54:85 (close to a real ID-1 card, rotated to portrait as asked). Canvas renders at 640×1010px — plenty sharp for print.
5. Used your real contact channel (`mddorrdorr.gh@gmail.com`, Ghana/China phone numbers) everywhere, since no separate ECAP-only email/phone exists yet.
6. Canonical URLs point to a placeholder `https://ecap.mddorrdorrgh.org/` — **not registered yet**, just a placeholder so the `<link rel="canonical">` tags aren't broken. Needs a real decision (see below).

## Not yet done — needs your input or a quick follow-up session
1. **Domain decision**: should ECAP live at a subdomain of the main site (`ecap.mddorrdorrgh.org` — free, just a DNS record on the domain you already own) or its own separate domain (e.g. `ecap-edu.org`, costs money, fully independent)? I used the subdomain as a placeholder in canonical tags only — nothing is deployed yet.
2. **Deploy**: same flow as mddorrdorr-website — push to a new private GitHub repo, import into a new Vercel project, connect the domain. Not done yet (no repo/Vercel project created for this one).
3. **Real email sending**: sign up free at resend.com, get an API key, add it as `RESEND_API_KEY` in Vercel's environment variables. Until then, "Send to ECAP" still works via its fallback (download + mailto draft) — nothing is broken, just not fully automatic yet.
4. **Real content**: Board of Directors names/photos, gallery photos/videos, real cohort dates & fees — all currently placeholders by design (per your request to "build the whole page now").
5. Known limitation of the localStorage-MVP: a course code only works on the same browser/device that generated it (no cross-device lookup yet). Upgrade path: swap the 3 functions in `js/registration.js` for calls to a small Supabase table (you already have a Supabase project for the DingDing app) — nothing else in the codebase needs to change.

## Local testing (verified working)
Registered a test participant → got code `ECAP-K59D-YRNQ` → `id-card.html?code=...` auto-advanced into the builder → uploaded a test photo → flipped the card → downloaded PNGs (canvas confirmed non-blank, 640×1010) → clicked Send → confirmed the no-API-key fallback fires cleanly with no errors. Wrong-code entry correctly shows an error and blocks access.
