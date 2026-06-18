# remotecrew.co.uk/jobs subdirectory migration — EXECUTED

## Status
**IN-PROGRESS (core DONE & LIVE).** The public job board is live and fully
working at `https://remotecrew.co.uk/jobs` with Remote Crew branding; WordPress
apex untouched. Remaining: the 301 from the old subdomain, and JobPosting JSON-LD.

## What was done (2026-06-18)
Commits on `escooterclinic/reqcore` branch `esc` (remote `fork`):
- `961a60a` add app-public service + remove reqcore consent popup (patch 0002)
- `aed9de8` white-label public board UI to match remotecrew.co.uk (patch 0001)
- `54143d7` bind app-public to LAN (0.0.0.0:3001) so Pangolin can reach it
- (this) README: document live Pangolin subdirectory routing + this handover

### Architecture (LIVE)
- `ats.fiszu.com` = admin/SSO board, root container `reqcore_app` CT213:**3000**
  (baseURL=/, `NUXT_PUBLIC_SITE_URL` baked = jobs.remotecrew.co.uk). UNCHANGED.
- `remotecrew.co.uk/jobs` = public board, 2nd container `reqcore_app_public`
  CT213:**3001** (baseURL=/, `NUXT_PUBLIC_SITE_URL=https://remotecrew.co.uk`
  baked). Shares the same Postgres `db` + MinIO `minio`.
- Key insight that changed the plan: reqcore serves its board NATIVELY at `/jobs`
  (pages/jobs/*), and `/` is a Reqcore *marketing* page. So baseURL=/jobs/ (the
  original plan) would have produced `/jobs/jobs/<slug>` + leaked the marketing
  page at `/jobs/`. Correct approach = baseURL=/ + route the apex paths to 3001.

### Pangolin routing (CT191 SQLite `/home/config/db/db.sqlite`, NOT git)
Resource 76 (remotecrew.co.uk) is LIVE WP (-> 122:80) AND fronted by an RM SSO
router at priority **1000**. Added path targets at priority **1100** (Pangolin
maps targets.priority -> Traefik router priority; verified router
`76-2fjobs-prefix-...` emitted at 1100, beats SSO 1000):
```
targetId 374 /jobs   prefix 1100 -> 192.168.103.213:3001
targetId 375 /_nuxt  prefix 1100 -> 192.168.103.213:3001
targetId 376 /api    prefix 1100 -> 192.168.103.213:3001
targetId 377 /brand  prefix 1100 -> 192.168.103.213:3001
```
DB backup before change: `/home/config/db/db.sqlite.bak-jobsmigration-*`.
Rollback: `DELETE FROM targets WHERE targetId IN (374,375,376,377);` (60s repoll).

### Verified (all 200, WP intact)
remotecrew.co.uk/jobs board, /_nuxt css, /brand logo, /jobs/<slug> detail,
/jobs/<slug>/apply, /api/public/jobs; canonical = remotecrew.co.uk/jobs/<slug>.
WP apex / , /index.php/wp-json/ , /wp-login.php all still 200 & WordPress.

### Other fixes this session
- CT213 rootfs was 100% full (16G) -> grew to 40G via `pct resize 213 rootfs +24G`.
- minio shows "unhealthy" (image lacks curl for its healthcheck) but serves fine;
  app-public uses `depends_on: service_started` to avoid a compose-up deadlock.
- Killed PostHog ConsentBanner ("improve reqcore" — white-label leak).

## Decisions & rationale (LOCKED — do not re-open)
- baseURL stays `/` (NOT /jobs/). Board is native at /jobs; routing handles the
  subdirectory. baseURL=/jobs/ is wrong here (doubles to /jobs/jobs).
- Public board is a SEPARATE build (app-public) only to bake the correct
  canonical host; code is identical to the admin app.
- LAN bind 0.0.0.0:3001 is correct: CT213 has no 1:1 NAT, Pangolin reaches it
  over the LAN (same as the admin app on :3000).
- All white-label deviations confined to leaf files (public.vue, app.vue) +
  /public/brand + docker-compose.override.yml + overlay/esc/patches; main.css and
  base files stay byte-for-byte upstream so `git merge origin/main` stays clean.

## Next steps (ordered)
1. **301 the old subdomain** `jobs.remotecrew.co.uk` -> `remotecrew.co.uk/jobs`
   (path-preserving) via the Redirect Manager (CT191). It is Pangolin resource
   209 -> 213:3000 at priority 100; the redirect router must WIN over it.
   - Desired: `jobs.remotecrew.co.uk/jobs(.*)` -> `https://remotecrew.co.uk/jobs$1`
     (preserve slugs) AND `jobs.remotecrew.co.uk/` -> `https://remotecrew.co.uk/jobs`.
   - RM adds redirects via the UI ("/" POST) -> redirectRegex middleware in
     /home/config/traefik/dynamic_config.yml (regenerated; do NOT hand-edit).
     Confirm priority beats 209, or disable/convert resource 209 first.
   - Until done: both hosts serve the board (duplicate content, different
     canonicals) — not harmful short-term but should be closed soon.
2. **JobPosting + Organization JSON-LD** on the job detail page (the real Google
   for Jobs lever; reqcore emits NONE today). Use nuxt schema-org
   (`useSchemaOrg`/`defineJobPosting`) on `app/pages/jobs/[slug]/index.vue`.
   Prefer a PR UPSTREAM to reqcore-inc (generic win); else an overlay component +
   patch. Map: title, description (HTML), datePosted, employmentType, hiring
   organization=Remote Crew, jobLocation/applicantLocationRequirements (role is
   "Egypt"/remote), validThrough, baseSalary if available.
3. (optional) Fix the `<title>` "— Reqcore" suffix on public pages (white-label
   leak) — `app.config`/`nuxt.config` titleTemplate is a broad file; do it scoped
   in the public layout via useHead titleTemplate override if possible.

## How to resume
`ssh ct213; cd /opt/reqcore` (branch esc; remotes fork=escooterclinic,
origin=upstream). Public board container `reqcore_app_public` (:3001). Routing on
`ssh pangolin` (CT191) SQLite `/home/config/db/db.sqlite` table `targets`,
resource 76. RM at /home/redirect-manager (API 127.0.0.1:5000). Read this file +
overlay/esc/README.md "Public domain — remotecrew.co.uk/jobs".

## Gotchas / anti-patterns
- Do NOT set baseURL=/jobs/ (doubles to /jobs/jobs; leaks marketing page at /jobs/).
- app-public MUST bind 0.0.0.0 (not 127.0.0.1) or Pangolin gets 502.
- Pangolin http provider repolls every 60s — wait after DB changes.
- minio is "unhealthy" by design (healthcheck bug) — do NOT "fix" by restarting
  into a service_healthy gate; use --no-deps or service_started.
- CT213 rootfs is small-ish (40G) and `docker build` cache fills it — prune after
  builds (`docker builder prune -af`).
- Never edit base files / main.css for branding — leaf files + patches only.
