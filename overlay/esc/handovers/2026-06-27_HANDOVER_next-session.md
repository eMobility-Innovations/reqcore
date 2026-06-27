# reqcore Job Boards — HANDOVER (next session)

**Date:** 2026-06-27  **CT:** 213 (`ssh ct213`, `/opt/reqcore`, branch `esc`, remote `fork`=`escooterclinic/reqcore`)
**Public boards:** `remotecrew.co.uk/jobs` (Remote Crew) · `jobs.escooterclinic.co.uk` (Escooter Clinic) · `ats.fiszu.com/jobs` (admin, all orgs)

## Architecture (read this first)
Same Docker image, 3 services in tracked `docker-compose.override.yml`:
| Container | Port | Domain | `NUXT_PUBLIC_ORG_SLUG` | `NUXT_PUBLIC_BRAND` |
|---|---|---|---|---|
| `reqcore_app` | 3000 | ats.fiszu.com (admin, KC SSO) | *(unset → all orgs)* | *(default)* |
| `reqcore_app_public` | 3001 | remotecrew.co.uk/jobs | `remote-crew` | `remote-crew` |
| `reqcore_app_esc` | 3002 | jobs.escooterclinic.co.uk | `escooter-clinic` | `escooter-clinic` |

- Org filter lives in `server/api/public/jobs/index.get.ts` + `[slug].get.ts` (scope = `?org=` else env). Empty scope = all orgs.
- Brand (palette, logo, fonts, OG meta, favicon) selected by `runtimeConfig.public.brand` in `app/layouts/public.vue` + the two `app/pages/jobs/*` files.
- `/` → `/jobs` redirect for public boards: `server/middleware/00-public-root-redirect.ts` (gated on non-empty orgSlug; admin unaffected).
- Edge: Pangolin CT191 resource **212** → CT213:3002 (public, no SSO). CF CNAME `jobs.escooterclinic.co.uk → internal.escooterclinic.co.uk`. Traefik edge auto-injects CSP `frame-ancestors` + strips `X-Frame-Options` ONLY for fleet-routed domains (e.g. ats.fiszu.com). **The ESC board uses a plain pass-through Pangolin resource (212) that does NOT inject framing**, so the app default (`X-Frame-Options: DENY` + `frame-ancestors 'none'`) reached the browser and blocked the iframe — fixed at app level 2026-06-28 (see UPDATE below).

## DONE this session (all pushed to fork `esc`)
- `2ec88d9` per-org boards + ESC branding + embed mode + assets
- `424f8eb` design spec · `562075c` execution handover
- `cb05d53` `/` → `/jobs` redirect on public boards
- `098a736` brand-aware OG/social meta + ESC og-image (`public/brand/escooter-clinic-og.png`)
- `f090e9a` brand-aware ESC favicon (`public/brand/escooter-clinic-favicon.{ico,png}`, pulled from escooterclinic.co.uk)
- Dark-mode fix on ats.fiszu.com: rebuilt `app` so it carries commit `ddc6c5e` localStorage light-persist.

## HOW MICHAL IFRAMES "JOBS ONLY" (no header/footer) — the answer
The ESC board has an **embed mode**: append `?embed=1` and the page renders ONLY the job list
(no RemoteCrew/ESC header, no footer, transparent background), designed to sit inside idoSell's
own "CURRENT OPPORTUNITIES" section. It also auto-resizes the iframe via `postMessage`.

Paste this into the idoSell CMS block:
```html
<iframe id="esc-jobs" src="https://jobs.escooterclinic.co.uk/jobs?embed=1"
        style="width:100%;border:0;display:block" scrolling="no" height="600"
        title="Current Opportunities"></iframe>
<script>
  window.addEventListener('message', function (e) {
    if (e.origin !== 'https://jobs.escooterclinic.co.uk') return;
    if (e.data && e.data.type === 'reqcore-embed-height')
      document.getElementById('esc-jobs').style.height = e.data.height + 'px';
  });
</script>
```
- WITHOUT the `<script>`, the iframe is fixed at `height="600"` and will inner-scroll — set a bigger
  height or keep the script for auto-fit. The script is the recommended path.
- Same for Remote Crew: `https://remotecrew.co.uk/jobs?embed=1` (change the origin check to remotecrew.co.uk).
- A job's detail page also supports `?embed=1`.

## Ops / redeploy
```bash
ssh ct213 'cd /opt/reqcore && docker compose build app-esc app-public && docker compose up -d app-esc app-public'
# env-only (org/brand) changes: recreate suffices. Code/asset changes: rebuild.
# Push from CT213 is fine UNLESS the diff touches .github/workflows (deploy key lacks workflow scope).
```

## OUTSTANDING / next-session candidates
1. **Pixel-match the ESC card styling** to Michal's screenshot (red uppercase titles, spacing,
   Akira display sizing). Current ESC theme is correct brand colours but not design-QA'd against the mock.
2. **Better ESC og-image**: current `escooter-clinic-og.png` is auto-generated (logo on `#F0F0F0` + red bar).
   Replace with a proper designed 1200×630 banner if desired.
3. **Real-world iframe test inside idoSell**: confirm auto-height works in their actual CMS template
   (cross-origin postMessage + their CSP). Verify on mobile widths.
4. **OG/preview cache**: chat apps cache OG cards; if Remote Crew card still shows for ESC, force a
   re-scrape (e.g. opengraph.xyz) — server tags are already correct.
5. (Optional) apple-touch-icon / PWA icons for ESC; CORS on `/api/public/jobs` only if a cross-origin
   JSON consumer is ever needed (idoSell uses the iframe, so not needed now).
6. Keep base files upstream-clean for `git merge upstream/main`; ESC changes are on app/server/overlay files on the `esc` branch.

## Quick verify commands
```bash
curl -s https://jobs.escooterclinic.co.uk/api/public/jobs | python3 -c "import sys,json;d=json.load(sys.stdin);print(sorted({j['organizationName'] for j in d['data']}),d['total'])"  # only Escooter Clinic
curl -s https://remotecrew.co.uk/api/public/jobs | python3 -c "import sys,json;d=json.load(sys.stdin);print(sorted({j['organizationName'] for j in d['data']}),d['total'])"           # only Remote Crew
curl -s -o /dev/null -w '%{http_code}\n' -L https://jobs.escooterclinic.co.uk/         # 200 (redirects / -> /jobs)
curl -s "https://jobs.escooterclinic.co.uk/jobs?embed=1" | grep -c 'class="rc-header"' # 0 (no header in embed)
```

---

## UPDATE 2026-06-28 — design-QA + iframe framing FIX (pushed to fork `esc`)

Two commits land the outstanding card-styling + the real iframe blocker:

- `327d3a7` **feat(esc): brand-red uppercase job-card titles.** Card `<h2>` was
  ink-black (`text-surface-900`), red only on hover. Now red (`#E30D13`/brand-600),
  uppercase, line-height 1.3 — via a `.rc-job-title` hook on the title +
  scoped `.rc-brand-escooter-clinic :deep(.rc-job-title)` rule in `public.vue`.
  Inert for Remote Crew (no RC rule) → RC board unchanged. (OUTSTANDING #1 ✓)
- `7a6d880` **fix(esc): allow idoSell to iframe the ESC board.** New
  `server/plugins/esc-frame-headers.ts` — a **brand-gated** Nitro `beforeResponse`
  plugin (runs AFTER the routeRule + csp middleware → wins). For the
  escooter-clinic container ONLY it removes `X-Frame-Options` and rewrites CSP
  `frame-ancestors` → `'self' https://escooterclinic.co.uk https://www.escooterclinic.co.uk`.
  No-op for RC + admin (both still `DENY` + `'none'` — verified). (OUTSTANDING #3 ✓)

### Why the app fix was needed (corrects the architecture note above)
The handover assumed the edge fixes framing. **It doesn't for this route.** Live
`curl -I` proved the ESC board carried the app's `X-Frame-Options: DENY` +
`frame-ancestors 'none'` (the edge injects framing only for fleet domains like
ats.fiszu.com). Without the plugin the browser refuses to frame it.

### Verification (browserless CT192, real cross-origin)
- Headers: ESC board → `frame-ancestors 'self' + escooterclinic.co.uk + www`, no XFO.
  RC + admin → unchanged strict framing.
- End-to-end: loaded the real `https://escooterclinic.co.uk/` parent, injected
  `<iframe src=".../jobs?embed=1">` → frame **committed**, **zero** "Refused to
  display/frame" console errors, list rendered (red titles, no chrome).

### Still open
- **Pixel-match to Michal's actual screenshot** (exact spacing / Akira sizing):
  needs the screenshot itself + the live idoSell "CURRENT OPPORTUNITIES" page,
  which is not published yet (all escooterclinic.co.uk/career* → 404). Red
  uppercase titles done per spec; finer pixel-QA awaits the mock.
- Paste the idoSell `<iframe>` + auto-height `<script>` block (above) into the
  storefront CMS and confirm on mobile widths in the real template.

