# Per-Org Job Boards + ESC Branding + Iframe — EXECUTED

**Date:** 2026-06-27  **CT:** 213 (`ssh ct213`, `/opt/reqcore`, branch `esc`)
**Status:** DONE & verified live. Design spec: `overlay/esc/specs/2026-06-27-per-org-job-boards-design.md`.

## What shipped (commit `2ec88d9` on fork `escooterclinic/reqcore` esc)
- **Org-scoped public API** (`server/api/public/jobs/index.get.ts` + `[slug].get.ts`):
  scope from `?org=<slug>` else env `NUXT_PUBLIC_ORG_SLUG`. Unknown slug → empty.
  Detail page 404s if job's org ≠ scope. Unset (admin `app`) → all orgs.
- **Brand-aware layout** (`app/layouts/public.vue`): `NUXT_PUBLIC_BRAND` selects
  `remote-crew` (unchanged) or `escooter-clinic` (light `#F0F0F0` bg, ink `#1D1D1B`,
  red `#E30D13` titles/links, cyan `#0DE3DD`, self-hosted **Akira Expanded** + Montserrat,
  ESC logo). Force-light script + MutationObserver preserved for both.
- **Embed mode** `?embed=1`: hides header/footer, transparent bg, posts
  `{type:'reqcore-embed-height',height}` to parent for iframe auto-resize.
- **Assets**: `public/brand/escooter-clinic-logo.png`,
  `public/brand/fonts/AkiraExpanded{,-Bold}.woff2`, `montserrat-latin-{300,400,700,900}-normal.woff2`.
- **docker-compose.override.yml**: `app-public` pinned `remote-crew`; NEW `app-esc`
  (container `reqcore_app_esc`, `reqcore-app-esc:latest`, port `3002`, org/brand=escooter-clinic).

## Infra created (this session)
- **Pangolin (CT191)** resource **212**: `jobs.escooterclinic.co.uk` → `192.168.103.213:3002`
  (http, Pangolin SSO OFF, public). Created via RM API `POST /api/v1/pangolin/routes`.
- **Cloudflare** CNAME `jobs.escooterclinic.co.uk` → `internal.escooterclinic.co.uk`
  (proxied=false, fleet convention) — created by the same RM API call.
- Iframe allowed automatically: the Traefik edge injects CSP `frame-ancestors` for all
  fleet domains (incl. `*.escooterclinic.co.uk`) and strips `X-Frame-Options` — verified.

## Verified live
- `https://jobs.escooterclinic.co.uk/api/public/jobs` → only Escooter Clinic.
- `https://remotecrew.co.uk/api/public/jobs` → only Remote Crew (leak fixed).
- `https://jobs.escooterclinic.co.uk/jobs?embed=1` → no header/footer, 200.
- `https://ats.fiszu.com/jobs` → all orgs, light theme (rebuilt `app` w/ ddc6c5e persist).

## idoSell iframe embed snippet (paste into the CMS "CURRENT OPPORTUNITIES" block)
```html
<iframe id="esc-jobs" src="https://jobs.escooterclinic.co.uk/jobs?embed=1"
        style="width:100%;border:0;display:block" scrolling="no" height="600"
        title="Current Opportunities"></iframe>
<script>
  window.addEventListener('message', function (e) {
    if (e.origin !== 'https://jobs.escooterclinic.co.uk') return;
    if (e.data && e.data.type === 'reqcore-embed-height') {
      document.getElementById('esc-jobs').style.height = e.data.height + 'px';
    }
  });
</script>
```
For Remote Crew, embed `https://remotecrew.co.uk/jobs?embed=1` (and match the origin check).

## Redeploy / ops
- `cd /opt/reqcore && docker compose build app-esc && docker compose up -d app-esc`
- Same for `app-public`. Org/brand are runtime env (override) — recreate suffices for env-only
  changes; rebuild needed for code/asset changes.

## Follow-ups (optional)
- ESC og-image for social cards (currently generic). Provide and drop in `public/brand/`.
- If a JSON consumer is ever needed cross-origin, add CORS to `/api/public/jobs`.
