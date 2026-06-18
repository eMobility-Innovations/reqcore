# Handover — 2026-06-18 — jobs.remotecrew.co.uk + reqcore SSO/branding

## Status
IN-PROGRESS. reqcore updated + white-labeled (DONE). Two infra items PENDING:
(1) public reverse-proxy domain jobs.remotecrew.co.uk, (2) RM SSO allowlist for
the public job board on ats.fiszu.com. Footer rebrand optional.

## What was done (this session)
- Diagnosed: ats.fiszu.com public track link 404/SSO is NOT reqcore auth — it is
  OUR Redirect Manager forward-auth (Keycloak, fiszu-sso -> 172.18.0.1:5000/auth/verify
  on CT191). /api/* is bypassed by RM builtin; the HTML page /jobs/<slug>/apply is
  what gets SSO-gated. RM matcher (forwardauth.py): plain=prefix, *=wildcard, ~=regex.
- reqcore (CT213, /opt/reqcore, branch esc) fast-forwarded e139b72 -> v1.5.0
  (f47296e), migration 0028 applied, rebuilt, healthy. DB backup:
  /opt/reqcore/backup-pre-v150-20260618-085331.sql (rollback commit e139b72).
- White-label commit 4274eb6 (pushed to fork escooterclinic/reqcore): in
  app/layouts/public.vue brand Reqcore->Remote Crew, removed <LanguageSwitcher/>.
  Verified rendered /jobs shows Remote Crew, Select language=0.
- Strategy recorded in overlay/esc/ (README + patches/0001-public-layout-branding.patch).
  UPDATE PROCEDURE: git fetch origin && git merge origin/main (NEVER hard-reset esc);
  re-apply patch if ever reset.

## Next steps (ordered)
1. Attach public domain via the service-domain-attach skill (RM API, no blind DNS):
   jobs.remotecrew.co.uk  ->  192.168.103.213:3000  (reqcore), PUBLIC = NO RM SSO.
   This is a reverse proxy (NOT iframe: reqcore CSP frame-ancestors excludes
   remotecrew.co.uk; NOT redirect: would expose target URL).
2. RM SSO allowlist for ats.fiszu.com (Redirect Manager excluded paths, prefix, one per line):
   /jobs  /interview  /_nuxt/  /_ipx/  /sitemap.xml  /__sitemap__/  /sw.js
   /ingest/  /apple-touch-icon.png  /favicon.png  /favicon.svg
   (localized /es/jobs.. optional; switcher removed so visitors cannot switch).
   Then POST RM /api/v1/sso/reconcile. Verify /jobs/<slug>/apply = 200 unauth.
3. Optional: footer Powered by Reqcore -> Remote Crew (same file public.vue), rebuild.

## Gotchas
- One reqcore backend serves BOTH ats.fiszu.com (SSO admin+board) and (new)
  jobs.remotecrew.co.uk (public board). The new Pangolin resource MUST be public.
- NUXT_PUBLIC_SITE_URL currently set for the old host: canonical/og/sitemap will
  emit the wrong host for jobs.remotecrew.co.uk. Decide canonical host; may need
  env set + rebuild. Check docker-compose env on CT213.
- Confirm remotecrew.co.uk zone is in the same Cloudflare account RM manages.
- Rebuild needed after any source/env change: docker compose build app && up -d app
  (Nuxt build ~2-3 min; run in background, poll image Created timestamp).

## How to resume
ssh ct213; cd /opt/reqcore. Use skill service-domain-attach for step 1.
RM on CT191 (ssh pangolin); SESSION_KILL_API_KEY in RM env for reconcile.
