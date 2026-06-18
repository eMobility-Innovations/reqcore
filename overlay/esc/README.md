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
| `app/layouts/public.vue` | brand wordmark `Reqcore` -> `Remote Crew`; removed `<LanguageSwitcher />` from the public header | white-label the public job board for Remote Crew; site is English-only |
| `docker-compose.override.yml` | tracked CT213 override: bakes `NUXT_PUBLIC_SITE_URL` build-arg from `.env` (= `https://jobs.remotecrew.co.uk`); remaps MinIO console 9001->9091 | reqcore serves BOTH `ats.fiszu.com` (SSO admin board) and `jobs.remotecrew.co.uk` (public board, no SSO). nuxt-site-config bakes the site URL at **build time** (runtime env is NOT honored), so the public host must be a build arg for correct canonical/OG/sitemap. Using the override keeps base `docker-compose.yml` byte-for-byte upstream. |

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

