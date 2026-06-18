# remotecrew.co.uk/jobs — minio root-cause + CF bare-root redirect (EXECUTED)

## Status: DONE & LIVE. Both open follow-ups from 2026-06-18 handover closed.

## 1. "docker compose up -d app-public" failure — ROOT-CAUSED (prior handover MISDIAGNOSED it)

### The prior handover was WRONG
It said `docker compose up -d app-public` "recreates the container with a BROKEN
entrypoint (`/usr/bin/docker-entrypoint.sh` not found)" and that `docker start
reqcore_app_public` fixed it. **app-public was never the problem.** app-public has
a VALID relative entrypoint (`docker-entrypoint.sh` -> /usr/local/bin, resolved via
PATH) and runs fine. `docker start reqcore_app_public` "worked" only because
app-public was already healthy — it was a no-op coincidence.

### Real root cause = the MINIO container
- The error `/usr/bin/docker-entrypoint.sh: no such file or directory` is MINIO's
  image entrypoint, not app-public's. `reqcore_minio` had been **Exited (127) for
  hours**. app-public depends_on minio with `condition: service_started`, so
  `up -d app-public` tries to (re)start minio, and minio is what failed.
- Why minio failed: its container rootfs/overlay was **stale/corrupted** after the
  `minio/minio:latest` layers were re-extracted (image ID matched current, but the
  stopped container's overlay lowerdir links went stale) -> the kernel could not
  assemble the rootfs -> "no such file or directory" for an entrypoint that DOES
  exist in the image (verified: a fresh `docker run --rm minio/minio` has
  `/usr/bin/docker-entrypoint.sh` + `/usr/bin/minio`).
- Compounding it: every `docker compose up` tried to RECREATE minio, and the
  recreate collided with a **leaked network endpoint**:
  `endpoint with name reqcore_minio already exists in network reqcore_default`.
  The broken container never cleanly released its endpoint, so each recreate
  attempt failed and left minio in `Created` (down) state — a loop.

### The fix (operational, no code change)
```bash
ssh ct213; cd /opt/reqcore
docker compose rm -sf minio                 # clean stop+remove -> releases the leaked endpoint
docker network disconnect -f reqcore_default reqcore_minio 2>/dev/null || true
docker compose up -d minio                  # fresh container from the valid image
```
After this, `docker compose up -d` is **idempotent**: all four containers report
`Running` and exit 0 (verified twice, incl. `up -d app-public`). Data safe — minio
data is in named volume `reqcore_minio_data` (untouched by rm; `reqcore` bucket intact).

### Why it kept recurring / how to avoid
- The minio container had been resuscitated by manual `docker start` of a
  half-created container, leaving compose tracking + the network endpoint
  inconsistent. A clean `docker compose rm -sf minio && docker compose up -d minio`
  resets it; `docker start` does NOT.
- RECOMMENDED preventive (NOT applied — minimal-change): pin minio to a digest/tag
  in `docker-compose.override.yml` so `latest` cannot be silently re-pulled and
  corrupt a stopped container, e.g.
  `image: minio/minio:RELEASE.2025-09-07T16-13-09Z`. Decide before applying
  (override-only edit, never base).

## 2. Bare-root jobs.remotecrew.co.uk/ -> remotecrew.co.uk/jobs — DONE (Cloudflare)

- Created a **Cloudflare Single Redirect** (http_request_dynamic_redirect entrypoint)
  on zone remotecrew.co.uk (`6278ef5fcc3ee243eb4aea6a85615e9a`):
  - expr: `(http.host eq "jobs.remotecrew.co.uk" and http.request.uri.path eq "/")`
  - 301 -> `https://remotecrew.co.uk/jobs` (rule id `d63e077996a34bebaaf56de3a8032f8a`).
  - Scoped to **path "/" ONLY** so it never touches /jobs* (RM keeps slug preservation).
- GOTCHA the prior handover missed: `jobs.remotecrew.co.uk` was **DNS-only (grey
  cloud, proxied:False)** -> CF rules never saw its traffic, so the redirect was inert.
  CF Single Redirects ONLY fire on **proxied** hostnames. **Flipped the
  jobs.remotecrew.co.uk DNS record to proxied:True** (record id
  `9d7f802a41150bc6b5cea0ea37cf3bc7`; apex was already proxied via same origin chain;
  fully reversible). User approved the flip.
- Verified AFTER flip (single hop each, server: cloudflare):
  - `/`                 -> 301 -> https://remotecrew.co.uk/jobs
  - `/jobs`             -> 301 -> https://remotecrew.co.uk/jobs
  - `/jobs/<slug>`      -> 301 -> https://remotecrew.co.uk/jobs/<slug>   (slug preserved)
  - `/jobs/<slug>/apply`-> 301 -> .../apply                              (preserved)
  - destination remotecrew.co.uk/jobs -> 200.
  Origin RM still returns 308 slug-preserving for /jobs* (confirmed direct-to-origin);
  CF fronts it now and surfaces 301 to clients. Both are permanent redirects; single hop.

## Public board still healthy (regression check)
- http://127.0.0.1:3001/jobs -> 200; slug page has `application/ld+json` + `JobPosting`
  + `remote-crew-og.png`; light-theme persist (`reqcore-color-mode`) present.
- Live https://remotecrew.co.uk/jobs -> 200.
- All 4 containers Up; minio healthy.

## No code changes this session (operational + Cloudflare API only). Repo: docs only.

## Resume: ssh ct213; cd /opt/reqcore (branch esc). RM on ssh pangolin /home/redirect-manager.
CF token: `grep ^CLOUDFLARE_API_TOKEN= /home/redirect-manager/.env` on ssh pangolin
(do NOT `source` that .env — it has shell-unsafe values; grep+cut the token).
