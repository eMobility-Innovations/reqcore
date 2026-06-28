# ESC overlay — `escooterclinic/reqcore` (branch `esc`, deployed on 001esc **CT213**)

This is a **fork** of upstream `reqcore-inc/reqcore` (remote: `origin`, HTTPS).
The deploy branch is **`esc`** (remote: `fork` = `git@github-reqcore:escooterclinic/reqcore.git`).
One Docker image, three runtime configs, three public surfaces.

> **Prime directive: stay upstream-mergeable.** Every deviation is confined to
> *leaf* files (layouts, pages, a self-contained server plugin/middleware, the
> tracked compose override, and `public/brand/*` assets). We never touch broad
> shared files (`app/assets/css/main.css`, the base `docker-compose.yml`) and we
> keep edits to `nuxt.config.ts` to a couple of additive `runtimeConfig` keys.
> So `git merge origin/main` only ever conflicts on the handful of lines we own.

---

## 1. What runs where (the three surfaces)

| Container | Port | Public URL | `NUXT_PUBLIC_ORG_SLUG` | `NUXT_PUBLIC_BRAND` | Auth |
|---|---|---|---|---|---|
| `reqcore_app` | 3000 | `ats.fiszu.com` (admin + all-org board) | *(unset → all orgs)* | *(reqcore default)* | Keycloak SSO (edge) |
| `reqcore_app_public` | 3001 | `remotecrew.co.uk/jobs` | `remote-crew` | `remote-crew` | public |
| `reqcore_app_esc` | 3002 | `jobs.escooterclinic.co.uk` | `escooter-clinic` | `escooter-clinic` | public |

All three are the **same image/source**, differing only by env. `app-public` and
`app-esc` bake their own `NUXT_PUBLIC_SITE_URL` at **build time** (nuxt-site-config
does not honor runtime env for canonical/OG), so each host is a separate build.
They share the same Postgres + MinIO as the admin app.

Redeploy (after a code/asset change):
```bash
ssh ct213 'cd /opt/reqcore && docker compose build app-esc app-public && docker compose up -d app-esc app-public'
# env-only (org/brand) change → `up -d` (recreate) is enough; no rebuild.
# Push from CT213 is fine UNLESS the diff touches .github/workflows (deploy key lacks workflow scope).
```

---

## 2. Update procedure — pull upstream WITHOUT losing our work

> ✅ **2026-06-29 — FINAL OSS SYNC DONE. Upstream is now dead; we are independent.**
> reqcore-inc published a one-time squashed snapshot `1ea7f0a "Publish archived open source
> snapshot"` at the same `origin` URL (history rewritten, **no common ancestor** with our old
> `esc`). We did **not** merge it (impossible — unrelated histories). Instead: branched
> **`esc-final`** off the snapshot and **cherry-picked our 33 overlay commits** onto it (one
> conflict, in `server/api/public/jobs/[slug].get.ts` — resolved by keeping BOTH upstream's new
> GDPR privacy-notice lookup AND our org-scope 404 guard). Built all 3 images, applied new
> migrations (`0029/0030/0031`), verified all 3 surfaces live.
> - **Deploy branch is now `esc-final`** (pushed to `fork`). The old `esc` (528 commits, real
>   pre-snapshot history) is retained as the backup tag **`pre-final-oss-sync-20260628`** (on
>   `fork` + local). New upstream base = snapshot `1ea7f0a`.
> - Code delta the snapshot brought vs our old base (excl. `overlay/`): **92 files, +22,590/−3,346**
>   — GDPR data-retention (candidate export/restore/retention APIs + settings), Application
>   Builder, job preview, e2e privacy tests.
> - **There is no more `origin` to pull.** Do NOT attempt `git merge origin/main` again. Maintain
>   independently on `esc-final`. Keep this `overlay/esc/` as the record of what was ever ours.
>
> _Historical plan that led here (now executed) is preserved below for context:_

> ⚠️ **2026-06-27 reality check: upstream went closed-source.** `reqcore-inc/reqcore` was **replaced with a 2-commit stub** — `8fa49da Initial commit` + `7916463 "Revise README to reflect new direction for Reqcore"` (2026-06-24). The real source history was deleted from the public remote, so `origin/main` now shares **NO common ancestor** with our `esc` branch (`git merge-base origin/main esc` → empty). **`git merge origin/main` brings nothing but a README and would error on unrelated histories.** Our `esc` branch (523 commits, app source from 2026-02-14) is now the **canonical full copy** of reqcore we hold. **Go-forward plan (confirmed): reqcore-inc will hand us the LAST open-source version ONCE. We do a single final sync onto it, then we are permanently on our own.** Prep for that one-time merge:
>
> 1. **Snapshot now** (safety net) — our `esc` (523 commits) is the only full copy we hold; tag it: `git tag pre-final-oss-sync esc && git push fork pre-final-oss-sync`.
> 2. **When the OSS drop lands** (tarball / new repo / tag), add it as a remote `final` (e.g. `git remote add final <url> && git fetch final`).
> 3. **Compare against our base**, not the stub: our app source starts at `72b89f8` (2026-02-14). Diff `final/main` vs our pre-overlay tree to see what upstream changed; the **overlay discipline** (this doc, §3) means our deltas are confined to leaf files, so re-applying them onto the OSS drop is mechanical.
> 4. **Strategy:** branch `esc-final` off `final/main`, then cherry-pick / replay ONLY our overlay commits (branding, per-org scoping, `esc-frame-headers.ts`, compose override, `public/brand/*`). Histories are unrelated, so prefer cherry-pick over merge. Validate (build all 3 containers), then make `esc-final` the new deploy branch.
> 5. **After that, upstream is dead.** No more `origin`; we maintain independently. Keep `overlay/esc/` as the record of what was ever ours.

**Do NOT hard-reset `esc` to upstream.** Merge upstream INTO `esc`:
```bash
cd /opt/reqcore
git fetch origin
git merge origin/main          # keeps the ESC commits; conflicts (if any) are
                               # limited to the few leaf-file lines we own
docker compose build app app-public app-esc && docker compose up -d
```
If `esc` is ever blown away, the two oldest cosmetic deviations can be re-applied
from `overlay/esc/patches/*.patch` (RC white-label + consent-banner removal). The
later structural work (per-org boards, ESC brand, iframe) lives as normal commits
on `esc` — re-apply by cherry-picking, not patches.

**Conflict-resolution rule:** when a merge conflicts, keep the upstream side of
the base logic and re-apply *only* our additive hook (the `brand`/`orgSlug`
branch, the `.rc-job-title` class, etc.). Never resolve a conflict by reverting
an upstream change.

---

## 3. Deviations from upstream (what is "ours")

### 3a. Branding & public layout
| File | Change | Why |
|------|--------|-----|
| `app/layouts/public.vue` | **Brand-aware public board.** A `brandConfig` map keyed by `runtimeConfig.public.brand` selects logo / header link / footer / CSS-custom-property palette for `remote-crew` (cream/navy/indigo/mint) **and** `escooter-clinic` (grey bg `#F0F0F0`, white cards, red `#E30D13`, cyan `#0DE3DD`, **Akira Expanded** display + **Montserrat** body). Also: forced **light** theme (nonce inline script + `MutationObserver`, both brands are light), brand-aware **favicon** (ESC icon via `useHead`), ESC **job-card title** rule (`.rc-job-title` → brand-red, uppercase), and **iframe embed mode** (`?embed=1` — see §4). Removed `<LanguageSwitcher />`. | one layout white-labels the board per brand; all brand CSS scoped to `.rc-brand-*` so `main.css` stays upstream |
| `app/pages/jobs/index.vue` | Brand-aware OG/SEO meta (`escooter-clinic` → ESC title/desc/og-image); `.rc-job-title` class on the card `<h2>` (the hook the layout colours red — inert for RC). | per-brand social cards; red ESC titles without touching base card markup logic |
| `app/pages/jobs/[slug]/index.vue` | Brand-aware OG/SEO meta + ESC og-image on the job detail page. | stop RemoteCrew branding leaking onto ESC job links |
| `app/app.vue` | Removed the `<ConsentBanner />` mount (patch `0002`). | the PostHog banner says "Help us improve **reqcore**" — a white-label leak to public candidates |
| `public/brand/*` | Vendored assets: RC logos (`remote-crew-logo*.svg`), ESC `escooter-clinic-logo.png` + `favicon.{ico,png}` + `og.png`, self-hosted fonts (`fonts/AkiraExpanded*.woff2`, `montserrat-*.woff2`). | self-contained branding; `font-src 'self'` CSP-safe |

### 3b. Per-org scoping (one DB, three boards)
| File | Change | Why |
|------|--------|-----|
| `server/api/public/jobs/index.get.ts` | Resolve org scope from `?org=<slug>` else `NUXT_PUBLIC_ORG_SLUG`; when set, join `organization` and filter `slug = scope`. **Unset = all orgs** (admin, unchanged). Unknown slug → empty set (not 500). | each brand domain shows ONLY its own jobs; admin still sees everything |
| `server/api/public/jobs/[slug].get.ts` | When org scope is set, **404** if the job's org ≠ scope. | slugs are globally unique → block cross-brand access on a brand domain |
| `server/middleware/00-public-root-redirect.ts` | On the public boards (non-empty `orgSlug`), redirect `/` → `/jobs`. Admin unaffected. | brand domains have no marketing root; send visitors straight to the board |

### 3c. Iframe framing (ESC board embeds in idoSell) — see **[IFRAME-EMBED.md](./IFRAME-EMBED.md)**
| File | Change | Why |
|------|--------|-----|
| `server/plugins/esc-frame-headers.ts` | **NEW, brand-gated.** A Nitro `beforeResponse` plugin that — for the `escooter-clinic` container ONLY — removes `X-Frame-Options` and rewrites CSP `frame-ancestors` → `'self' https://escooterclinic.co.uk https://www.escooterclinic.co.uk`. No-op for RC + admin (they keep `DENY` + `'none'`). | the ESC board is iframed inside the idoSell storefront; its pass-through Pangolin route does NOT inject framing, so the app must allow it. Base files (`nuxt.config.ts` routeRule, `server/middleware/csp.ts`) stay upstream-clean. |

### 3d. Deploy / config
| File | Change | Why |
|------|--------|-----|
| `docker-compose.override.yml` | Tracked CT213 override: bakes `NUXT_PUBLIC_SITE_URL` for `app`; adds **`app-public`** (3001, RC) and **`app-esc`** (3002, ESC) builds; `depends_on: service_started` (base minio healthcheck uses curl, absent from the image → `service_healthy` deadlocks); MinIO console 9001→9091. | keeps base `docker-compose.yml` byte-for-byte upstream while running 3 surfaces |
| `nuxt.config.ts` | **Additive only:** two `runtimeConfig.public` keys — `orgSlug` and `brand` (read from env). | per-container org + brand selection; minimal touch to a shared file |

---

## 4. Edge / DNS (NOT in git — lives in Pangolin CT191 SQLite)

- **`jobs.escooterclinic.co.uk`** → CF CNAME (proxied) → Pangolin **resource 212** →
  `CT213:3002`, public, no SSO. This is a **plain pass-through** route — it does
  NOT inject `frame-ancestors`/strip `X-Frame-Options` (unlike fleet domains such
  as `ats.fiszu.com`), which is exactly why §3c exists.
- **`remotecrew.co.uk/jobs`** → Pangolin resource **76** path-prefix targets
  (`/jobs`,`/_nuxt`,`/api`,`/brand` @ priority 1100) → `CT213:3001`. Apex `/` and
  `/wp-*` stay on WordPress. (SQL to reproduce is in the git history of this file.)
- **`ats.fiszu.com`** → fleet edge (Keycloak SSO) → `CT213:3000`.

---

## 5. Where to look

- **Iframe embed** (how it works + the idoSell paste snippet + verification):
  [`overlay/esc/IFRAME-EMBED.md`](./IFRAME-EMBED.md)
- **Design spec** (per-org boards + ESC brand): `overlay/esc/specs/`
- **Session handovers** (chronological): `overlay/esc/handovers/`
- **Re-appliable patches** (RC white-label, consent removal): `overlay/esc/patches/`
