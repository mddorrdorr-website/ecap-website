# ECAP Website — Build Plan (in progress)

## Done
- Project scaffold created (css/, js/, assets/, api/ folders)
- Design system copied from mddorrdorr-website (css/styles.css, js/main.js) — navy/teal/red palette, Lexend+Source Sans
- Brand assets copied: ecap-logo.png, mddorrdorr-white.png (for "member of" credit), ecap-boardroom.jpg
- Git repo initialized locally

## Confirmed scope (from user)
1. Board of Directors page — placeholder member cards, real bios/photos added later
2. Gallery page — photo grid (real event photos added later) + 2 video slots
3. Registration + ID card system:
   - Register → choose elective(s) (core 7 programmes auto-included, elective pool = current "Executive Programmes" 7) → get unique course code
   - Enter code later → portrait ID card builder: upload own photo (processed in-browser only, never stored server-side)
   - Front: "ECAP — Executive Centre for African Professionals", logo, applicant name, course code, nationality, organisation
   - Back: ECAP logo + slogan, printed BOLDLY (assumption — confirm with user; original msg said "badly", read as typo)
   - "Send to ECAP" emails the finished card for printing — build with Resend (serverless /api/send-card.js) + graceful mailto/download fallback if no API key configured yet
4. Independent branding (own nav/footer, "a member of the MD DorrDorr.gh family" credit instead of leading with it)
5. Pricing/dates + registration form
- Design: REUSE existing design system (confirmed, not a fresh look)

## Not yet built (next session)
- index.html (home/hero/about/why ECAP)
- board.html
- gallery.html
- programmes.html (14 courses, core vs elective, each opens a course outline)
- register.html (form + course code generation)
- id-card.html (portrait card builder, canvas rendering, photo upload, send flow)
- api/send-card.js (Resend email relay)
- Course code persistence: MVP = localStorage (same browser only); upgrade path = Supabase table (user already has a Supabase project for the DingDing app — could reuse or create a new one) for cross-device code lookup
- Needs from user when ready: a free Resend.com API key (for automated email sending); decide Supabase now vs localStorage-MVP-first
- Git commit + push to a new private GitHub repo + new Vercel project + domain (same flow as mddorrdorr-website)
