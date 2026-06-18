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

---

## UPDATE 2026-06-18 (later session) — DONE

All three items complete, verified live, pushed to `fork/esc`.

### 1. jobs.remotecrew.co.uk (PUBLIC reverse proxy) — DONE
- Pangolin **resourceId 209**, target `192.168.103.213:3000` (http), `sso=false`
  (public, NO RM SSO). CF CNAME -> `internal.escooterclinic.co.uk` created.
- Verified: `https://jobs.remotecrew.co.uk/` = 200, valid wildcard cert
  (`*.remotecrew.co.uk`, ssl_verify=0), `/jobs` = 200 with NO auth redirect.
- **Canonical host fixed (user chose jobs.remotecrew.co.uk):**
  `NUXT_PUBLIC_SITE_URL` is baked at BUILD time by nuxt-site-config (runtime env
  NOT honored — verified: container env was correct but canonical still rendered
  the baked localhost). Fixed via a **build arg**, wired through the tracked
  `docker-compose.override.yml` (`app.build.args.NUXT_PUBLIC_SITE_URL=${...}`
  from `.env`). Base `docker-compose.yml` kept byte-for-byte upstream.
  Verified canonical/og:url now = `https://jobs.remotecrew.co.uk/jobs`.

### 2. RM SSO allowlist for ats.fiszu.com — DONE
- `excluded_paths` already held the full list (set earlier this day). Ran
  `POST /api/v1/sso/reconcile` (88 reconciled, 0 errors). Verified
  `https://ats.fiszu.com/jobs/<slug>/apply` = **200 unauth**, no KC redirect.

### 3. Footer "Powered by Reqcore" — REMOVED (user chose remove entirely)
- Dropped the whole `<footer>` from `app/layouts/public.vue`; rebuilt; verified
  no `<footer>` on `https://jobs.remotecrew.co.uk/jobs`. Patch 0001 regenerated
  to capture brand+switcher+footer deviations vs upstream f47296e.
- NOTE (not actioned): reqcore still bakes an SEO **meta description** ending
  "...Powered by the open-source ATS you actually own." — separate from the
  footer. Left as-is; change the meta/SEO copy if full white-label is wanted.

### SEO note (subdomain vs /jobs)
Kept the **subdomain**. Subdirectory (`remotecrew.co.uk/jobs`) is marginally
better for authority consolidation, but reqcore serves all assets at ROOT paths
(`/_nuxt/ /_ipx/ /api/ /sitemap.xml`), so a subdir mount needs a Nuxt
`app.baseURL=/jobs/` rebuild + path proxying (collision-prone). Subdomain is the
pragmatic choice; for jobs SEO the bigger lever is `JobPosting` JSON-LD + Google
for Jobs, which works fine on a subdomain.

### Commits (fork/esc)
- `e428cab` public domain + canonical (override build-arg, README, gitignore)
- `b675113` remove footer + regenerate patch
