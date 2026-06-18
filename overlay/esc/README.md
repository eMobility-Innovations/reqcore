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
| `app/layouts/public.vue` | brand wordmark `Reqcore` -> `Remote Crew`; removed `<LanguageSwitcher />` from the public header; removed the `Powered by Reqcore` footer | white-label the public job board for Remote Crew; site is English-only; no third-party attribution on the public board |
| `docker-compose.override.yml` | tracked CT213 override: (a) bakes `NUXT_PUBLIC_SITE_URL` build-arg from `.env` for the admin `app`; (b) adds **`app-public`** — a 2nd reqcore build with `NUXT_PUBLIC_SITE_URL=https://remotecrew.co.uk` baked, on `127.0.0.1:3001`, for the public board served as a subdirectory `remotecrew.co.uk/jobs`; (c) remaps MinIO console 9001->9091; (d) `app-public` `depends_on: service_started` (the base minio healthcheck uses curl, absent from the current image, so `service_healthy` deadlocks `up`) | reqcore serves the SSO admin board at `ats.fiszu.com` (root container) and the PUBLIC board at `remotecrew.co.uk/jobs` (app-public). nuxt-site-config bakes the site URL at **build time** (runtime env NOT honored), so each host is a separate build with its own baked `NUXT_PUBLIC_SITE_URL` for correct canonical/OG. reqcore serves its board natively at `/jobs` (pages/jobs/*) so `app-public` keeps the default `baseURL=/` and the apex routes `/jobs`,`/_nuxt`,`/api` to it — NOT `baseURL=/jobs/`, which would double to `/jobs/jobs`. Keeps base `docker-compose.yml` byte-for-byte upstream. |
| `app/app.vue` | removed the `<ConsentBanner />` mount (patch `0002`) | the PostHog consent popup reads “Help us improve **reqcore** …” — a white-label leak shown to every public candidate; not wanted on a Remote-Crew-branded board |

Keep every deviation tiny and confined to leaf files (layouts/components) so
`git merge origin/main` stays clean. Never edit broad files like
`nuxt.config.ts` for cosmetic changes.

## Public domain (jobs.remotecrew.co.uk)

The public job board is a **reverse proxy** (Pangolin resourceId 209, CT191) to
`192.168.103.213:3000`, **PUBLIC / no Redirect-Manager SSO** — not an iframe
(reqcore CSP `frame-ancestors` excludes remotecrew.co.uk) and not a redirect
(would expose the upstream host). The same backend is reached via `ats.fiszu.com`
for the SSO-gated admin + board; the public board paths are allowlisted in RM
SSO `excluded_paths` for `ats.fiszu.com`.

