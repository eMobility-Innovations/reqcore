# Plan — move public board to remotecrew.co.uk/jobs (subdirectory)

## Status
PLANNED / NOT STARTED. Decided 2026-06-18. Subdomain jobs.remotecrew.co.uk is
LIVE and working — this migrates it to a subdirectory for SEO authority
consolidation under the WordPress apex. Execute in a fresh session.

## Key facts discovered (LOCKED — do not re-litigate)
- `ats.fiszu.com` (SSO admin + board) AND `jobs.remotecrew.co.uk` are the SAME
  single container: `192.168.103.213:3000`. (Pangolin: ats.fiszu.com + resource
  209 both target CT213:3000.)
- Nuxt `app.baseURL` is GLOBAL to a build → you CANNOT serve root (ats admin)
  and `/jobs` from one container. **Therefore a SECOND dedicated reqcore
  container is required** for the public `/jobs` board.
- `NUXT_PUBLIC_SITE_URL` is BAKED AT BUILD by nuxt-site-config — runtime env is
  NOT honored (proven this session). So the public host MUST be a build arg.
- WordPress apex `remotecrew.co.uk` = Pangolin **resource 76 -> 192.168.103.122:80**
  (CT122 WP). `remotecrew.co.uk/jobs` currently 404 (slug is FREE). WP serves its
  own `/sitemap.xml` (Yoast/RankMath) — must NOT be shadowed.
- reqcore v1.5.0 emits **NO JobPosting JSON-LD** (0 schema.org/ld+json in HTML or
  Nuxt payload). Google for Jobs gets nothing today regardless of URL layout.
- White-label leak: job page `<title>` still ends "— Reqcore".

## Architecture (LOCKED)
Keep existing container serving `ats.fiszu.com` at root, UNCHANGED. Add a 2nd
service `app-public` built with `NUXT_PUBLIC_SITE_URL=https://remotecrew.co.uk`
and `app.baseURL=/jobs/`, sharing the same Postgres (`db`) + MinIO (`minio`),
exposed on a new host port (e.g. 3001). Route `remotecrew.co.uk/jobs/*` -> that
container. Because baseURL=/jobs/, ALL reqcore paths live under `/jobs/` -> no
collision with WP `/sitemap.xml`, `/api`, etc. (that is the whole point).

## Steps (ordered)
1. **GATE FIRST (cheapest test):** verify `NUXT_APP_BASE_URL=/jobs/` is honored at
   RUNTIME by this Nuxt build (Nuxt 3 usually maps it to `app.baseURL`). If assets
   end up under `/jobs/_nuxt/` at runtime, no Dockerfile edit needed. If it must
   be baked at build, add `ARG/ENV NUXT_APP_BASE_URL` to the Dockerfile — that is a
   base-file edit (broad file): record as an overlay patch like 0001. Check
   nuxt.config.ts `app:` block (~line 169) + `baseUrl: siteUrl` (~line 153).
2. Add `app-public` service to `docker-compose.override.yml` (already tracked):
   build.args `NUXT_PUBLIC_SITE_URL=https://remotecrew.co.uk` (+ baseURL if baked),
   runtime `NUXT_APP_BASE_URL=/jobs/`, same `env_file: .env`, `DATABASE_URL`->db,
   `S3_ENDPOINT`->minio, `ports: 127.0.0.1:3001:3000`, depends_on db+minio.
   Build + up. Verify locally: curl -H "Host: remotecrew.co.uk" localhost:3001/jobs/
   returns 200 with assets at `/jobs/_nuxt/` and canonical `https://remotecrew.co.uk/jobs`.
3. **Pangolin path route (TOUCHES LIVE WP — careful):** add a `/jobs` PathPrefix
   target to resource 76 (remotecrew.co.uk) -> CT213:3001 with priority ABOVE the
   WP catch-all. Check whether RM `/api/v1/pangolin/routes` accepts path/pathMatchType
   /priority (the target object has those fields) or if it needs a direct Pangolin
   API call. Do NOT route `/sitemap.xml` or `/api` on the apex to reqcore.
4. Canonical is handled by step 2 build-arg. Confirm sitemap host = remotecrew.co.uk.
5. **301** `jobs.remotecrew.co.uk` -> `https://remotecrew.co.uk/jobs` via Redirect
   Manager (convert/redirect resource 209) so existing links/signals are not split.
6. Verify end-to-end: remotecrew.co.uk/jobs = 200 + assets load; /jobs/<slug>/apply
   = 200 unauth + POST works; canonical = remotecrew.co.uk/jobs; WP apex still 200
   and /sitemap.xml intact; jobs.remotecrew.co.uk 301 -> /jobs.

## Recommended companion work (separate, higher SEO value than the URL move)
- Add **JobPosting + Organization JSON-LD** (reqcore has nuxt seo/site-config; use
  schema-org `defineJobPosting` on the job detail page). This is the real Google
  for Jobs lever and works on subdomain OR subdirectory. Generic -> ideally PR
  upstream (reqcore-inc), else overlay component + patch.
- Fix `<title>` "— Reqcore" suffix (siteName) — white-label leak.

## Gotchas
- SITE_URL baked at build (runtime ignored) — build-arg only.
- One build can't do root + /jobs — dedicated 2nd container, mandatory.
- Resource 76 is the LIVE WordPress site — path-route changes risk the main site;
  verify WP apex + its /sitemap.xml after every routing change.
- baseURL=/jobs/ keeps ALL reqcore paths under /jobs/ — that is what avoids WP
  collisions; do NOT fall back to per-path proxying of /_nuxt,/api,/sitemap.xml.

## How to resume
ssh ct213; cd /opt/reqcore (branch esc, remote: fork=escooterclinic, origin=upstream).
ssh pangolin (CT191) for routing; RM API 127.0.0.1:5000, Bearer $SESSION_KILL_API_KEY.
Read this file. Start with step 1 (the NUXT_APP_BASE_URL runtime gate) before any
infra change.
