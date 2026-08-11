#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null 2>&1 || { echo "deploy: required tool '$1' is not installed." >&2; exit 1; }; }
required() { [ -n "${!1:-}" ] || { echo "deploy: required environment variable $1 is missing." >&2; exit 1; }; }
for tool in docker cosign git; do need "$tool"; done
required GITHUB_TOKEN
required GHCR_USERNAME

repository="${GITHUB_REPOSITORY:-eMobility-Innovations/reqcore}"
ghcr_image="ghcr.io/${repository}"
ref="${PUBLISH_REF:-$(git describe --tags --exact-match 2>/dev/null || git branch --show-current)}"
sha_tag="sha-$(git rev-parse --short=7 HEAD)"
tags="${ghcr_image}:${sha_tag}"

case "$ref" in
  main) tags="$tags ${ghcr_image}:edge ${ghcr_image}:latest" ;;
  v[0-9]*.[0-9]*.[0-9]*)
    version="${ref#v}"
    major_minor="${version%.*}"
    tags="$tags ${ghcr_image}:${version} ${ghcr_image}:${major_minor}"
    ;;
  *) echo "deploy: PUBLISH_REF must be main or a v* semantic-version tag (got '$ref')." >&2; exit 1 ;;
esac

printf '%s' "$GITHUB_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
if [ -n "${DOCKERHUB_USERNAME:-}" ]; then
  required DOCKERHUB_TOKEN
  printf '%s' "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin
  dockerhub_tags=""
  for tag in $tags; do dockerhub_tags="$dockerhub_tags reqcore/reqcore:${tag##*:}"; done
  tags="$tags $dockerhub_tags"
fi

args=()
for tag in $tags; do args+=(--tag "$tag"); done
docker run --privileged --rm tonistiigi/binfmt --install all
docker buildx inspect reqcore-publisher >/dev/null 2>&1 || docker buildx create --name reqcore-publisher --use
docker buildx use reqcore-publisher
docker buildx inspect --bootstrap
docker buildx build . --platform linux/amd64,linux/arm64 --push \
  --provenance=mode=max --sbom=true "${args[@]}"

for image in $(printf '%s\n' $tags | sed -E 's#:[^:/]+$##' | sort -u); do
  digest="$(docker buildx imagetools inspect "$image:${sha_tag}" --format '{{json .Manifest.Digest}}' | tr -d '"')"
  [ -n "$digest" ] || { echo "deploy: could not resolve digest for $image." >&2; exit 1; }
  cosign sign --yes "${image}@${digest}"
done
