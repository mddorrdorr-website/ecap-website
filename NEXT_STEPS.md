# ECAP Website — Status & Next Steps

Last updated: 2026-10-03 (registration database LIVE)

## Where it lives
- **Live site:** https://ecap-website.vercel.app (Vercel project `ecap-website`, account `tinodebby2016-4089's projects`)
- **Source:** https://github.com/mddorrdorr-website/ecap-website (private). Vercel auto-deploys on every push to `main`.
- **Commit email must be `tinodebby2016@gmail.com`** (already set repo-locally). Vercel blocks deploys from commits whose author email isn't tied to a GitHub account.
- **Local preview:** `node tests/dev-server.js`, then open http://127.0.0.1:8793. It serves the site AND runs the real `/api` functions against an in-memory stand-in for Supabase/Resend (`tests/fake-backend.js`), so registration, lookup and card sending all work locally with no accounts. Data resets when it stops.
- **Tests:** `node --test tests/api.test.js` (18 tests; the SQL schema was also replay-checked in pglite). `tests/` and `supabase/` are excluded from deploys via `.vercelignore`.
- Plain static HTML/CSS/JS, no build step, no framework. Same format as `mddorrdorr-website`.

## Pages
| Page | What it does |
|---|---|
| `index.html` | Home: hero, about, why ECAP, coming soon, CTA |
| `programmes.html` | 14 courses from `js/courses.js`, Core (mandatory) and Elective (choose 1+), each expands to an outline. Cohort section with placeholder dates/fees ("enquire") |
| `board.html` | 7 placeholder cards: Chairperson, Vice Chairperson, Executive Board Secretary, Executive Director, Director Africa and UK Operations, Director China Operations, Academic Advisor. Bios say "to be announced" |
| `gallery.html` | 6 photo placeholders + 2 video placeholders, with swap-in instructions on the page |
| `register.html` | Registration form (details below) |
| `id-card.html` | Course-code-gated ID card builder (details below) |
| `contact.html` | Email / phone / WhatsApp + mailto-based enquiry form |

## Registration (`register.html`)
- **Every field is mandatory.** Invalid or empty fields turn red with a message, all at once. Each clears as soon as it becomes valid.
- **Phone rules:** Ghana 10-digit local (`0244123456`) or `+233` + 9 digits; China 11-digit local or `+86` + 11 digits; UK 11-digit local or `+44` + 10 digits. Other countries get a generic 7-15 digit check.
- **Nationality** is a closed dropdown of 197 countries (`js/countries.js`), so free text is impossible.
- **Programme intake:** three cohorts a year, October China (CN), February UK (UK), June Ghana (GH). Year is auto-picked as the next upcoming occurrence.
- **Course code:** `ECAP-<Initials>-<Location><YYYY>-<Random3>`, e.g. `ECAP-AS-CN2026-FDF`. **Issued by the server** (`api/register.js` using `js/course-code.js`), never the browser, so uniqueness is guaranteed (collisions are retried with a new ending). One initial per name word; names the alphabet can't represent fall back to `XX`.
- **Shared rules:** `js/validation.js` (email, phone, text) is loaded by the page AND required by the server, so the two can't disagree. The server re-validates everything: nationality in the country list, electives real, cohort real, year this year or next.
- **"Spotted a mistake? Edit my details"** brings the form back with answers intact. Resubmitting issues a new code; the server retires the old one (status `superseded`) **only if the email matches**, and looking the old code up tells the participant the newer code. ECAP receives an "Updated registration" email instead of a confusing duplicate.
- **Protections:** hidden bot-trap field, max 5 registrations per email per hour, no email/phone ever returned by the lookup.

## ID card (`id-card.html`)
- Uses the approved design package from `ECAP-ID-Card-Source/`: `js/card-renderer.js` (SVG renderer), `js/course-code.js`, `js/logo-data.js` (embedded logo, crop coordinates are calibrated to it, don't swap the logo file). Front: logo, centre name, slogan, "PARTICIPANT CARD", 336px circular photo, name, course code, nationality, organisation. Back: only the full logo, rotated -90 degrees, on plain white. Canvas is 640x1010; PNG export is 1280x2020.
- **Photo editor:** drag to reposition, zoom slider, Change photo, Remove. The photo exists only in browser memory and is never stored anywhere. (`computePhotoGeometry` in `js/id-card-builder.js` feeds a 672x672 crop to the renderer.)
- **Buttons:** the red **Send final card to ECAP for printing** is the primary action. It locks while sending (a send can take 10-30 seconds), so a double-click can't email ECAP twice. If the server says no (limit reached, code replaced, unknown code) the participant sees why; only a real outage or network failure triggers the download + email-draft fallback. "Download my card instead" is a small link below it.

## Email sending (live and tested)
- `api/send-card.js` is a Vercel serverless function (no npm dependencies) that emails the front and back PNGs through **Resend**, entirely server-side. The participant's mailbox is not involved.
- Vercel environment variables: `RESEND_API_KEY` (set), `ECAP_FROM_EMAIL` (set; sender on the verified domain `mddorrdorrgh.org`), `ECAP_TO_EMAIL` (optional, defaults to `mddorrdorr.gh@gmail.com`).
- **Registration alert:** every registration (and every correction) also emails ECAP in the background with the participant's full details. If that email fails, the registration is still saved.
- **Send-card now requires a real registered code.** The email's name/nationality/organisation come from the database, not the browser, so the endpoint can't be used to send arbitrary content to ECAP. Capped at 5 sends per registration. (Old-style tests with a made-up code now correctly return 404.)
- Behaviour: `501` if no key is configured, which makes the page fall back to download + mailto draft. `200` on a successful send. Resend only delivers to arbitrary recipients because the domain is verified; before that it could only send to the Resend account owner's email.
- Resend free tier is about 100 emails/day and 3,000/month. Plenty for cohort-sized volumes.
- **Tested live on 2026-10-03:** direct API call returned 200, and a full run (register, photo, zoom, press Send) returned 200 and showed "Sent!". Worst-case request size with a pure-noise photo was 3.1 MB against Vercel's 4.5 MB limit.
- Environment variables only apply after a redeploy. If you change one, redeploy.

## Open items
1. **Confirm the test emails arrived.** Two went to `mddorrdorr.gh@gmail.com` on 2026-10-03 ("DEPLOY TEST" and "FULL FLOW TEST"). Check the attachments look right (photo on the front, rotated logo on the back), then delete them. Still unverified: I could only confirm the send succeeded, not what arrives.
2. **Registration database: LIVE and verified on 2026-10-03.** New Supabase project for ECAP (host `xegqftwpxbdxuzqxvisw.supabase.co`), `supabase/schema.sql` run, `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` set in Vercel. Live test passed: registered, wiped all browser storage, built the card from the code alone, pressed Send (200, emailed). **A test row ("LIVE TEST Please Ignore", code `ECAP-LTPI-CN2026-51N`) is still in the table: delete it in Supabase -> Table Editor -> registrations.**
   - **Check `https://ecap-website.vercel.app/api/health` any time.** `{"ok":true}` means the database is reachable. Otherwise it says in plain English what is wrong (key rejected, table missing, address unreachable, key pasted wrongly).
   - **Gotcha that cost time:** the Supabase secret key must be copied with the eye icon revealed. Copying it while hidden pastes dots into Vercel and breaks everything. Changing a Vercel variable only takes effect after a redeploy.
   - Free Supabase projects **pause after ~a week of inactivity**. `vercel.json` runs `/api/health` daily to keep it awake; check Vercel -> Cron Jobs shows it, or move to a paid plan before relying on it.
   - The table is locked down with Row Level Security and no policies: only the server's secret key can read or write it.
   - Known limits: a code is the only credential (anyone with a code can build that person's card, which shows only name/nationality/organisation); there is no admin screen yet, so ECAP reads registrations from the alert emails or the Supabase table editor; a participant who loses their code must ask ECAP.
   - Possible next step: a confirmation email to the participant with their code (needs safeguards so the site can't be used to email strangers).
3. **Domain.** Canonical and og:url tags still point to `https://ecap.mddorrdorrgh.org/`, which is **not set up**. Either add that subdomain in Vercel (a DNS record on a domain you already own) or change the tags to `ecap-website.vercel.app`.
4. **Real content:** board names, titles and photos; gallery photos and two videos; real cohort dates and fees.
5. **Site-wide logo.** The nav/footer use the older, lower-resolution `assets/logos/ecap-logo.png`. The card uses the official high-resolution logo. Swapping the site-wide one would make them consistent.
6. **Long names give long initials** (a five-word name gives `FFTPI`), per the design team's rule. Cap at first + last name if preferred (one-line change).
7. Minor: `assets/logos/mddorrdorr-white.png` is unused. The `.gold` CSS class name is a leftover from an earlier gold palette; it renders teal now.
