# Per-Org Job Boards + ESC Branding + Iframe Embed — Design

**Date:** 2026-06-27
**Repo:** `escooterclinic/reqcore` branch `esc` (deployed CT213 `/opt/reqcore`)
**Status:** DESIGN — awaiting implementation plan

## Problem

1. The public job board (`/api/public/jobs`) has **no org filter**, so every public
   surface shows *all* organizations' jobs mixed together. `remotecrew.co.uk/jobs`
   currently leaks Escooter Clinic jobs (and vice-versa).
2. Escooter Clinic has no branded public board. ESC jobs must live at
   `jobs.escooterclinic.co.uk`, styled to the ESC brand, and be embeddable as an
   `<iframe>` inside the idoSell storefront (idoSell is closed-source → iframe only).
3. (Resolved separately) `ats.fiszu.com/jobs` showed dark mode because the `app`
   container ran a build predating commit `ddc6c5e` (the `localStorage` light-persist).
   Fixed by rebuilding `app`; tracked here for context.

## Goals

- `remotecrew.co.uk/jobs` → **Remote Crew jobs only** (unchanged branding).
- `jobs.escooterclinic.co.uk` → **Escooter Clinic jobs only**, ESC-branded, iframe-able.
- `ats.fiszu.com/jobs` → **all orgs** (internal admin view, behind Keycloak) — unchanged.
- A JSON API option (`?org=<slug>`) available alongside the rendered boards.

## Non-Goals

- No changes to the admin ATS UI or auth.
- No CORS / public JSON consumers wired yet (endpoint supports `?org=` but idoSell
  uses the iframe path). YAGNI until a JSON consumer exists.

## Architecture — one image, org pinned per container

Mirrors the existing `app` / `app-public` split. Same Docker image, three runtime
configs:

| Container | Domain | `NUXT_PUBLIC_ORG_SLUG` | `NUXT_PUBLIC_BRAND` | Port |
|---|---|---|---|---|
| `app` | ats.fiszu.com (admin) | *(unset → all)* | reqcore default | 3000 |
| `app-public` | remotecrew.co.uk/jobs | `remote-crew` | `remote-crew` | 3001 |
| **`app-esc`** (NEW) | **jobs.escooterclinic.co.uk** | `escooter-clinic` | `escooter-clinic` | 3002 |

**Alternative considered:** single container resolving org by `Host` header — rejected;
branding differs per brand and per-brand containers match the established pattern.

## Components

### 1. Org-scoped public API (`server/`)
- `server/api/public/jobs/index.get.ts`: resolve org scope from `?org=<slug>` (request)
  → else runtime env `NUXT_PUBLIC_ORG_SLUG`. When set, join `organization` and filter
  `organization.slug = scope`. Unset → all orgs (admin, unchanged).
- `server/api/public/jobs/[slug].get.ts`: when org scope is set, **404** if the job's
  org ≠ scope (slugs are globally unique → prevents cross-brand access on a brand domain).
- Invalid/unknown org slug → empty result set (not 500).

### 2. Brand-aware public layout (`app/layouts/public.vue`)
- Read `NUXT_PUBLIC_BRAND` (runtimeConfig.public.brand). Brand config object maps a
  brand key → { logo, header link, footer text, CSS custom-property palette }.
- `remote-crew` = current palette (unchanged).
- `escooter-clinic` = ESC light theme:
  - bg `#F0F0F0`, surface `#FFFFFF`, ink `#1D1D1B`
  - primary/red `#E30D13` (job titles, links, primary buttons)
  - secondary/cyan `#0DE3DD`
  - display font **Akira Expanded** (licensed, self-hosted); body **Montserrat** (OFL).
- Keep the force-light pre-paint + MutationObserver logic (both brands are light).

### 3. Iframe embed mode
- `?embed=1` (read in `public.vue`): hide `<header>`/`<footer>`, transparent/bg-less
  wrapper → renders just the job-list section for embedding inside a parent page that
  already has its own heading (matches the idoSell "CURRENT OPPORTUNITIES" section).
- Standalone full page (no param) retained for direct visits.
- **Auto-height:** the embed page posts `{type:'reqcore-embed-height',height}` via
  `postMessage` on mount + resize; a ~10-line snippet pasted into idoSell resizes the
  iframe. (Documented in the handover.)
- **CSP/framing:** the Traefik/Pangolin edge already injects `frame-ancestors` for all
  ESC domains automatically → no app-level CSP change. Verify during rollout.

### 4. Brand assets (`public/brand/`)
- `escooter-clinic-logo.png` (pulled from escooterclinic.co.uk, 1063×200).
- Self-hosted fonts: `AkiraExpanded.woff2`, `AkiraExpanded-Bold.woff2` (licensed),
  Montserrat woff2 (OFL) — `@font-face` scoped so `font-src 'self'` CSP passes.
- Optional ESC og-image (defer; reuse generic until provided).

### 5. Deploy (`docker-compose.override.yml`, tracked)
- Add `app-esc` service: `build.args.NUXT_PUBLIC_SITE_URL=https://jobs.escooterclinic.co.uk`,
  env `NUXT_PUBLIC_ORG_SLUG=escooter-clinic`, `NUXT_PUBLIC_BRAND=escooter-clinic`,
  `ports: "3002:3000"`, shared db+minio (same pattern as `app-public`).
- Update `app-public` env: add `NUXT_PUBLIC_ORG_SLUG=remote-crew`,
  `NUXT_PUBLIC_BRAND=remote-crew` (stops the ESC-job leak).

### 6. Infra (check-before-create — per CLAUDE.md)
- **Cloudflare:** verify then create `jobs.escooterclinic.co.uk` CNAME → Pangolin edge
  (proxied/orange), with API rate-limit delays.
- **Pangolin (CT191):** new resource `jobs.escooterclinic.co.uk` → `CT213:3002`.

## Data flow

```
visitor → CF (jobs.escooterclinic.co.uk) → Pangolin CT191 → CT213:3002 (app-esc)
  app-esc SSR: brand=escooter-clinic, org=escooter-clinic
    pages/jobs/index.vue → /api/public/jobs (org filter: escooter-clinic)
    layout public.vue → ESC palette + logo + Akira/Montserrat
  ?embed=1 → chrome-less list + postMessage height → idoSell <iframe>
```

## Testing / verification

- `/api/public/jobs?org=escooter-clinic` returns only ESC jobs; `?org=remote-crew` only RC.
- `remotecrew.co.uk/jobs` no longer lists ESC jobs after `app-public` redeploy.
- `jobs.escooterclinic.co.uk/jobs` renders ESC brand (red titles, light bg, Akira/Montserrat).
- `jobs.escooterclinic.co.uk/jobs?embed=1` renders no header/footer.
- A job-detail slug from the other org → 404 on a brand domain.
- iframe loads inside an escooterclinic.co.uk page (frame-ancestors allows it).

## Reproducibility / git

- All source on branch `esc`; deploy specifics in the tracked `docker-compose.override.yml`;
  assets committed under `public/brand/`. Base files stay upstream-clean.
- Handover doc in `overlay/esc/handovers/` after rollout. Commit + push to fork.
