-- ECAP registrations — run once in the Supabase dashboard:
--   SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run more than once.

create table if not exists public.registrations (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,            -- e.g. ECAP-AS-CN2026-7K2
  full_name       text not null,
  email           text not null,                   -- stored lower-case
  phone           text not null,
  nationality     text not null,
  organisation    text not null,
  cohort_location text not null,                   -- CN / UK / GH
  cohort_year     int  not null,
  cohort_label    text not null,                   -- e.g. "October 2026 — China (CN)"
  electives       text[] not null,                 -- elective course ids; the 7 core courses are implied
  status          text not null default 'active'
                  check (status in ('active', 'superseded')),
  superseded_by   text,                            -- the new code, if the participant edited and resubmitted
  card_send_count int  not null default 0,         -- how many times the ID card was sent to ECAP
  card_sent_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- Used by the "no more than a few registrations per email per hour" limit.
create index if not exists registrations_email_created_idx
  on public.registrations (email, created_at);

-- Lock the table down completely. Row Level Security is switched on with NO
-- policies, and the public roles are stripped of access, so nothing in a
-- visitor's browser can read or write it. Only the website's server code,
-- using the secret key (which bypasses RLS), can touch these rows.
alter table public.registrations enable row level security;
revoke all on public.registrations from anon, authenticated;
