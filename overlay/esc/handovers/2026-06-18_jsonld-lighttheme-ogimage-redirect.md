# remotecrew.co.uk/jobs — JSON-LD, light theme, OG image, 301 (EXECUTED)

## Status: DONE & LIVE (one deploy gotcha + one optional follow-up)

## What was done
1. **301 jobs.remotecrew.co.uk -> remotecrew.co.uk/jobs** (RM on CT191, traefik backend).
   - Rule: `/jobs*` (wildcard, priority high=9999) -> `remotecrew.co.uk/jobs${1}` (path-preserving).
     Beats Pangolin resource 209 (router prio 100). Verified: /jobs, /jobs/<slug>, /jobs/<slug>/apply all 308 -> preserved, dest 200.
   - **Root (/) NOT redirected** — bare jobs.remotecrew.co.uk/ still serves the app via resource 209.
     RM CANNOT do root->/jobs AND preserve /jobs slugs: RM root rule is a host-wide catch-all that
     out-prioritises/ties the /jobs rule -> /jobs/jobs/ doubling (verified). To get bare-root->board
     cleanly: add a Cloudflare Single Redirect (exact `jobs.remotecrew.co.uk/` -> /jobs).
   - Created via RM python API (export TRAEFIK_* then manager.save_redirect + redirect_meta.set_priority high
     + manager._rebuild_traefik_config). DB backup: /home/config/db/db.sqlite.bak-301jobs-*.
2. **JobPosting JSON-LD now in SSR** (app/pages/jobs/[slug]/index.vue). Was buried in watchEffect ->
   never serialized. Now top-level reactive useHead(() => ...) with computed jobPostingLd + CSP nonce.
   Verified: application/ld+json + "@type":"JobPosting" present in curl SSR.
3. **Public board pinned to LIGHT theme** (app/layouts/public.vue). color-mode.client.ts re-added .dark
   on hydration (OS dark) -> flipped board black ~1s after load. Added onMounted + MutationObserver that
   keeps .dark off + colorScheme light while the public layout is mounted. Fixes white-on-white "Open
   Positions" + the dark-flip. Scoped to public layout (admin dark mode untouched).
4. **Absolute Remote Crew og:image** (was relative /reqcore-banner-github.jpeg -> 404 on apex).
   - New on-brand banner public/brand/remote-crew-og.png (1200x630, built locally via rsvg-convert from
     remote-crew-logo-footer.svg). Routed via Pangolin /brand target.
   - nuxt.config runtimeConfig.public.siteUrl exposed; both jobs pages use ${siteUrl}/brand/remote-crew-og.png
     for ogImage+twitterImage.
   - GOTCHA FIXED: runtimeConfig.public.siteUrl is RUNTIME-overridden by NUXT_PUBLIC_SITE_URL in .env
     (=jobs.remotecrew.co.uk) -> og pointed at jobs.* which 404s. Fixed by setting
     NUXT_PUBLIC_SITE_URL: https://remotecrew.co.uk in app-public override `environment:`.
   - Verified: og:image = https://remotecrew.co.uk/brand/remote-crew-og.png (200).

## Commits (escooterclinic/reqcore branch esc, remote fork): pushed
- f11be3f JSON-LD SSR + light pin + absolute og:image + banner
- 32a4a96 pin app-public runtime NUXT_PUBLIC_SITE_URL=remotecrew.co.uk

## DEPLOY GOTCHA (important)
`docker compose up -d app-public` recreates the container with a BROKEN entrypoint
(`/usr/bin/docker-entrypoint.sh` not found) and fails to start. Workaround that WORKS:
after the failed `up`, run `docker start reqcore_app_public` (image entrypoint resolves
correctly to /usr/local/bin via PATH). Root cause not yet found (compose merge sets wrong
abs entrypoint; admin reqcore_app unaffected). TODO: investigate compose entrypoint resolution.

## Follow-ups (NOT done — need user go-ahead)
- **WordPress link previews (CT122)**: remotecrew.co.uk WP/WooCommerce emits NO og: tags (no SEO plugin
  installed: only akismet/CF7/GTM/site-kit/woo/etc). Install Yoast SEO or Rank Math (works w/ Woo) to get
  per-page OG. Outward-facing prod store -> confirm before installing.
- **Bare-root jobs.remotecrew.co.uk/ -> /jobs**: via Cloudflare exact-match redirect (see #1).

## Resume: ssh ct213; cd /opt/reqcore (branch esc). RM on ssh pangolin /home/redirect-manager.

## Session addendum — WordPress plugin decisions + open follow-ups (2026-06-18)

### WordPress (CT122 = remotecrew.co.uk; applies to ALL service sites — Woo catalog, no checkout)
Current plugins: Akismet, Contact Form 7, HFCM (headers/footers), Site Kit, WP Mail SMTP, WPForms Lite, WPCode Lite.
Decisions:
- **Install Rank Math SEO** (fixes missing OG/link-previews; per-page OG+schema; Woo-friendly). Set a DEFAULT social image in Rank Math -> Titles & Meta -> Social.
- **Drop redundancies:** keep WPForms Lite (drop Contact Form 7); keep WPCode Lite (drop HFCM). Review/remove unused miniOrange social-login if present.
- **Security:** user runs **CrowdSec AppSec (full WAF)** at Pangolin edge -> DO NOT install Wordfence firewall (redundant). Add **WPScan** plugin for vuln alerts (inside-WP integrity the WAF cannot see). Optional Wordfence scan-only (firewall off).
- **Image optimization:** **EWWW Image Optimizer in LOCAL mode** (unlimited, free, no subscription, images stay on server). Chosen over ShortPixel (ShortPixel = slightly better compression + AVIF + offloads CPU, but cloud/subscription). EWWW local needs binaries in the WP container: `apt install jpegoptim optipng pngquant webp` (else it falls back to cloud = the trap). Converter-for-Media is an alt for WebP/AVIF.
- **Page cache:** rely on **Cloudflare**. CF free CAN cache HTML via a **Cache Rule (Cache Everything)** but it is OFF by default and needs bypasses (/wp-admin, cart, logged-in cookie). If not comfortable editing CF rules -> install **WP Super Cache** instead. Do not run both. ShortPixel/EWWW are image-compress, NOT page cache (different jobs).
- Target lean set per site: Rank Math, WPScan, UpdraftPlus (backups!), WPForms Lite, WPCode Lite, WP Mail SMTP, Site Kit, Akismet, EWWW.

### OPEN FOLLOW-UPS (not done)
1. Bare-root `jobs.remotecrew.co.uk/` -> board: add a **Cloudflare Single Redirect** (exact match `jobs.remotecrew.co.uk/` -> https://remotecrew.co.uk/jobs). RM cannot do it without breaking /jobs slug preservation (root catch-all doubles -> /jobs/jobs). Check-before-create per CF rules.
2. **`docker compose up -d app-public` entrypoint bug** (CT213): recreates container with broken `/usr/bin/docker-entrypoint.sh` -> fails. Workaround in use: after `up`, run `docker start reqcore_app_public` (image entrypoint resolves to /usr/local/bin via PATH). Root-cause the compose merge entrypoint resolution; admin reqcore_app unaffected.
3. Install the WP plugin set above across all service WordPress sites (+ EWWW binaries in containers).
