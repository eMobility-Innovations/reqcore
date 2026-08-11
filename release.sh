#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null 2>&1 || { echo "release: required tool '$1' is not installed." >&2; exit 1; }; }
for tool in docker curl gh git tar sha256sum; do need "$tool"; done
[ -n "${GH_TOKEN:-}" ] || { echo "release: required environment variable GH_TOKEN is missing." >&2; exit 1; }
tag="${1:-}"
[[ "$tag" = v* ]] || { echo "usage: GH_TOKEN=... ./release.sh v1.4.0" >&2; exit 1; }
git rev-parse --verify -q "$tag^{commit}" >/dev/null || { echo "release: local tag '$tag' does not exist." >&2; exit 1; }
version="${tag#v}"
image="ghcr.io/reqcore-inc/reqcore:${version}"

work="$(mktemp -d)"
demote_on_error=false
finish() {
  rc=$?
  trap - EXIT
  docker compose -f "$work/docker-compose.production.yml" down -v >/dev/null 2>&1 || true
  if [ "$rc" -ne 0 ] && [ "$demote_on_error" = true ]; then
    gh release edit "$tag" --prerelease --latest=false || true
    gh release view "$tag" --json isPrerelease,isLatest || true
    echo "release: smoke test failed; release was demoted to a pre-release." >&2
  fi
  rm -rf "$work"
  exit "$rc"
}
trap finish EXIT
git archive "$tag" | tar -x -C "$work"
sed -i.bak "s|ghcr.io/reqcore-inc/reqcore:latest|$image|" "$work/docker-compose.production.yml"
rm -f "$work/docker-compose.production.yml.bak"
grep "$image" "$work/docker-compose.production.yml"

demote_on_error=true
for i in $(seq 60); do
  docker manifest inspect "$image" >/dev/null 2>&1 && break
  [ "$i" -eq 60 ] && { echo "release: image $image did not appear within 20 minutes." >&2; exit 1; }
  sleep 20
done
(cd "$work" && ./setup.sh && docker compose -f docker-compose.production.yml up -d)
for i in $(seq 60); do
  curl -fs http://localhost:3000 >/dev/null 2>&1 && break
  [ "$i" -eq 60 ] && { echo "release: app did not become reachable." >&2; exit 1; }
  sleep 3
done
ready=false
for i in $(seq 40); do
  logs="$(docker compose -f "$work/docker-compose.production.yml" logs app || true)"
  if grep -q 'Database migrations applied successfully' <<<"$logs" && grep -q 'S3 bucket "reqcore" is ready' <<<"$logs"; then ready=true; break; fi
  sleep 3
done
if [ "$ready" != true ]; then
  echo "release: required startup messages were not found." >&2
  exit 1
fi
demote_on_error=false

bundle="$work/bundle/reqcore-$version"
mkdir -p "$bundle"
cp "$work/setup.sh" "$work/SELF-HOSTING.md" "$bundle/"
cp "$work/docker-compose.production.yml" "$bundle/"
printf 'Reqcore %s — Self-Hoster Bundle\n\n1. ./setup.sh\n2. docker compose -f docker-compose.production.yml up -d\n3. Open http://localhost:3000\n\nThe image tag in docker-compose.production.yml is pinned to %s.\nTo upgrade later, download the newer release bundle and re-run docker compose up -d.\n\nFull guide: SELF-HOSTING.md\n' "$tag" "$version" > "$bundle/INSTALL.txt"
(cd "$work/bundle" && tar -czf "$work/reqcore-$version.tar.gz" "reqcore-$version")
(cd "$work" && sha256sum "reqcore-$version.tar.gz" > "reqcore-$version.tar.gz.sha256")
gh release upload "$tag" "$work/reqcore-$version.tar.gz" "$work/reqcore-$version.tar.gz.sha256" --clobber
echo "release: verified $image and uploaded the self-hoster bundle."
