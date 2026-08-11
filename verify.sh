#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "verify: required tool '$1' is not installed." >&2
    exit 1
  }
}

for tool in node npm npx; do
  need "$tool"
done

[ -x ./verify-e2e.sh ] || {
  echo "verify: ./verify-e2e.sh is missing or not executable." >&2
  exit 1
}
if [ -d ./e2e ] && ! grep -qE '(^|[^[:alnum:]_])e2e([^[:alnum:]_]|$)' ./verify-e2e.sh; then
  echo "verify: ./verify-e2e.sh no longer references the e2e spec directory." >&2
  exit 1
fi

echo "== no-workflows =="
./check-no-workflows.sh

echo "== PR validation: install =="
npm ci
echo "== PR validation: lint =="
npm run lint --if-present
echo "== PR validation: typecheck =="
npx nuxi typecheck
echo "== PR validation: tests =="
npm run test --if-present
echo "== PR validation: dependency audit =="
npm audit --audit-level=high 2>&1 | tee audit-output.txt
echo "== PR validation: build =="
npm run build

echo "verify: all push gates passed."
