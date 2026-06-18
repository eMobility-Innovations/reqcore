# ESC overlay — escooterclinic/reqcore (branch `esc`, deployed on 001esc CT213)

This fork tracks upstream `reqcore-inc/reqcore` (remote: `origin`). The deploy
branch is `esc`.

## Update procedure (DO NOT hard-reset esc to upstream)

```bash
cd /opt/reqcore
git fetch origin
git merge origin/main      # keeps the ESC commits below; conflicts (if any)
                           # are limited to the few leaf-file lines we touch
docker compose build app && docker compose up -d app
```

If `esc` ever gets hard-reset to upstream, re-apply the deviations with:
```bash
git apply overlay/esc/patches/*.patch
```

## Deviations from upstream

| File | Change | Why |
|------|--------|-----|
| `app/layouts/public.vue` | full Remote Crew white-label of the public board (patch `0001`): RC SVG logo in the header, forced **light** theme (nonce-based inline script, mirrors app.vue), Remote Crew palette — cream `#f3f0ec` bg, navy `#2a2952` text, indigo `#444CE7` primary, mint `#5efbd7` accent — applied by remapping reqcore’s `--color-brand-*`/`--color-accent-*` on a scoped `.rc-public` wrapper so child job pages inherit the brand without markup edits; RC footer (`Hire smarter →`). Removed `<LanguageSwitcher />` (English-only). All in this one leaf file + `/public/brand/*` assets so `app/assets/css/main.css` stays byte-for-byte upstream. | make the public job board look like part of remotecrew.co.uk |
| `public/brand/remote-crew-logo*.svg` | vendored Remote Crew logos (header uses the dark-text footer variant on the light board) | self-contained branding assets for the public board header/footer |
| `docker-compose.override.yml` | tracked CT213 override: (a) bakes `NUXT_PUBLIC_SITE_URL` build-arg from `.env` for the admin `app`; (b) adds **`app-public`** — a 2nd reqcore build with `NUXT_PUBLIC_SITE_URL=https://remotecrew.co.uk` baked, on `127.0.0.1:3001`, for the public board served as a subdirectory `remotecrew.co.uk/jobs`; (c) remaps MinIO console 9001->9091; (d) `app-public` `depends_on: service_started` (the base minio healthcheck uses curl, absent from the current image, so `service_healthy` deadlocks `up`) | reqcore serves the SSO admin board at `ats.fiszu.com` (root container) and the PUBLIC board at `remotecrew.co.uk/jobs` (app-public). nuxt-site-config bakes the site URL at **build time** (runtime env NOT honored), so each host is a separate build with its own baked `NUXT_PUBLIC_SITE_URL` for correct canonical/OG. reqcore serves its board natively at `/jobs` (pages/jobs/*) so `app-public` keeps the default `baseURL=/` and the apex routes `/jobs`,`/_nuxt`,`/api` to it — NOT `baseURL=/jobs/`, which would double to `/jobs/jobs`. Keeps base `docker-compose.yml` byte-for-byte upstream. |
| `app/app.vue` | removed the `<ConsentBanner />` mount (patch `0002`) | the PostHog consent popup reads “Help us improve **reqcore** …” — a white-label leak shown to every public candidate; not wanted on a Remote-Crew-branded board |

Keep every deviation tiny and confined to leaf files (layouts/components) so
`git merge origin/main` stays clean. Never edit broad files like
`nuxt.config.ts` for cosmetic changes.

## Public domain — remotecrew.co.uk/jobs (subdirectory, LIVE since 2026-06-18)

The public board now lives at **`remotecrew.co.uk/jobs`** (subdirectory of the
WordPress apex) for SEO authority consolidation. Served by a dedicated 2nd
reqcore build `app-public` (see docker-compose.override.yml) on **CT213:3001**
with `NUXT_PUBLIC_SITE_URL=https://remotecrew.co.uk` baked (correct canonical/OG)
and the default `baseURL=/` — reqcore serves its board natively at `/jobs`, so
NO baseURL change is needed (baseURL=/jobs/ would have doubled to `/jobs/jobs`).

### Pangolin routing (CT191 — lives in SQLite `/home/config/db/db.sqlite`, NOT git)

The apex `remotecrew.co.uk` is the LIVE WordPress site (Pangolin resource **76**,
catch-all -> 192.168.103.122:80) AND is fronted by a Redirect-Manager SSO router
`sso-override-remotecrew-co-uk` at **priority 1000** (file provider). To serve
`/jobs` from reqcore we add path-prefix targets on resource 76 at priority
**1100** (beats the RM SSO router; Pangolin maps `targets.priority` -> Traefik
router priority). Reproduce with:

```sql
-- on CT191: sqlite3 /home/config/db/db.sqlite
INSERT INTO targets (resourceId,siteId,ip,method,port,enabled,path,pathMatchType,priority)
VALUES
 (76,1,192.168.103.213,http,3001,1,/jobs,prefix,1100),
 (76,1,192.168.103.213,http,3001,1,/_nuxt,prefix,1100),
 (76,1,192.168.103.213,http,3001,1,/api,prefix,1100),
 (76,1,192.168.103.213,http,3001,1,/brand,prefix,1100);
-- Traefik (http provider) repolls every 60s. Rollback: DELETE these rows.
```

`/jobs` board+detail+apply, `/_nuxt` assets, `/api` public jobs API + apply POST,
`/brand` the vendored RC logos. All other apex paths (`/`, `/index.php/...`,
`/wp-*`) stay on WordPress untouched (verified). WP uses non-pretty permalinks so
`/jobs`,`/_nuxt`,`/api`,`/brand` were all free (404) on the apex.

### TODO (not yet done) — 301 the old subdomain
`jobs.remotecrew.co.uk` (Pangolin resource 209 -> 213:3000) still serves the board
directly = duplicate content. Add a path-preserving 301 via the Redirect Manager:
`jobs.remotecrew.co.uk/jobs/X -> remotecrew.co.uk/jobs/X` and
`jobs.remotecrew.co.uk/ -> remotecrew.co.uk/jobs`. Must win over the 209 proxy
(priority 100). See handover 2026-06-18_subdirectory-migration-EXECUTED.md.

## Public domain (jobs.remotecrew.co.uk) — LEGACY (pre-subdirectory)

The public job board is a **reverse proxy** (Pangolin resourceId 209, CT191) to
`192.168.103.213:3000`, **PUBLIC / no Redirect-Manager SSO** — not an iframe
(reqcore CSP `frame-ancestors` excludes remotecrew.co.uk) and not a redirect
(would expose the upstream host). The same backend is reached via `ats.fiszu.com`
for the SSO-gated admin + board; the public board paths are allowlisted in RM
SSO `excluded_paths` for `ats.fiszu.com`.

