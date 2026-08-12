#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "verify: required tool '$1' is not installed." >&2
    exit 1
  }
}

for tool in npm npx node docker curl openssl aws; do
  need "$tool"
done
docker compose version >/dev/null 2>&1 || {
  echo "verify: Docker Compose v2 ('docker compose') is required." >&2
  exit 1
}
docker info >/dev/null 2>&1 || {
  echo "verify: Docker is installed but its daemon is unavailable." >&2
  exit 1
}

generated_env=false
cleanup() {
  docker rm -f reqcore-gate-postgres minio-ci >/dev/null 2>&1 || true
  docker compose --profile tools down -v >/dev/null 2>&1 || true
  [ "$generated_env" = true ] && rm -f .env
}
trap cleanup EXIT

echo "== E2E: services =="
docker run -d --name reqcore-gate-postgres -p 5432:5432 \
  -e POSTGRES_USER=reqcore \
  -e POSTGRES_PASSWORD=reqcore-ci \
  -e POSTGRES_DB=reqcore \
  --health-cmd 'pg_isready -U reqcore -d reqcore' \
  --health-interval 5s --health-timeout 5s --health-retries 10 \
  postgres:16-alpine
docker run -d --name minio-ci -p 9000:9000 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio:latest server /data
for i in $(seq 15); do
  curl -sf http://localhost:9000/minio/health/live >/dev/null && break
  [ "$i" -eq 15 ] && { echo "verify: MinIO did not become healthy." >&2; exit 1; }
  sleep 2
done
AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin \
  aws s3 mb s3://reqcore --endpoint-url http://localhost:9000 --region us-east-1
for i in $(seq 20); do
  [ "$(docker inspect --format='{{.State.Health.Status}}' reqcore-gate-postgres 2>/dev/null || true)" = healthy ] && break
  [ "$i" -eq 20 ] && { echo "verify: PostgreSQL did not become healthy." >&2; exit 1; }
  sleep 2
done

export DATABASE_URL=postgresql://reqcore:reqcore-ci@localhost:5432/reqcore
export BETTER_AUTH_SECRET=ci-test-secret-that-is-at-least-32-chars-long
export BETTER_AUTH_URL=http://localhost:3000
export NUXT_PUBLIC_SITE_URL=http://localhost:3000
export S3_ENDPOINT=http://localhost:9000
export S3_ACCESS_KEY=minioadmin
export S3_SECRET_KEY=minioadmin
export S3_BUCKET=reqcore
export S3_REGION=us-east-1
export S3_FORCE_PATH_STYLE=true

echo "== E2E: install =="
npm ci
echo "== E2E: schema =="
npx drizzle-kit push
echo "== E2E: build =="
npm run build
echo "== E2E: Playwright browser =="
npx playwright install chromium --with-deps
echo "== E2E: server and tests =="
PORT=3000 NODE_ENV=production node .output/server/index.mjs &
server_pid=$!
trap 'kill "$server_pid" >/dev/null 2>&1 || true; cleanup' EXIT
npx wait-on http://localhost:3000 --timeout 30000
PLAYWRIGHT_BASE_URL=http://localhost:3000 CI=true npx playwright test ./e2e
kill "$server_pid" >/dev/null 2>&1 || true
wait "$server_pid" 2>/dev/null || true
trap cleanup EXIT
docker rm -f reqcore-gate-postgres minio-ci >/dev/null

echo "== Docker new-user integration: setup =="
[ ! -e .env ] || {
  echo "verify: .env already exists; move it aside before the isolated setup.sh gate." >&2
  exit 1
}
./setup.sh
generated_env=true
required='BETTER_AUTH_SECRET BETTER_AUTH_URL DATABASE_URL DB_USER DB_PASSWORD DB_NAME S3_ENDPOINT S3_ACCESS_KEY S3_SECRET_KEY S3_BUCKET STORAGE_USER STORAGE_PASSWORD'
for key in $required; do
  grep -q "^${key}=" .env || { echo "verify: missing key in .env: $key" >&2; exit 1; }
done
storage_pass="$(grep '^STORAGE_PASSWORD=' .env | cut -d= -f2-)"
s3_key="$(grep '^S3_SECRET_KEY=' .env | cut -d= -f2-)"
[ "$storage_pass" = "$s3_key" ] || { echo "verify: storage credentials do not match." >&2; exit 1; }
secret="$(grep '^BETTER_AUTH_SECRET=' .env | cut -d= -f2-)"
[ "${#secret}" -ge 32 ] || { echo "verify: BETTER_AUTH_SECRET is shorter than 32 characters." >&2; exit 1; }
if ./setup.sh >/dev/null 2>&1; then
  echo "verify: setup.sh overwrote an existing .env." >&2
  exit 1
fi

echo "== Docker new-user integration: build and start =="
docker compose up --build -d
for service in reqcore_db reqcore_minio; do
  for i in $(seq 60); do
    state="$(docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null || echo not-started)"
    [ "$state" = healthy ] && break
    [ "$i" -eq 60 ] && { echo "verify: $service did not become healthy." >&2; docker compose logs --tail=100; exit 1; }
    sleep 3
  done
done
for i in $(seq 60); do
  curl -fs http://localhost:3000 >/dev/null 2>&1 && break
  [ "$i" -eq 60 ] && { echo "verify: app did not become reachable." >&2; docker compose logs app --tail=100; exit 1; }
  sleep 3
done
docker compose logs app | grep -q 'Database migrations applied successfully'
docker compose logs app | grep -q 'S3 bucket "reqcore" is ready'

fail=0
check_http() {
  actual="$(curl -s -o /dev/null -w '%{http_code}' "$2")"
  [ "$actual" = "$3" ] || { echo "verify: $1 expected $3, got $actual" >&2; fail=1; }
}
check_http 'Home page' http://localhost:3000 200
check_http 'Sign-in page' http://localhost:3000/auth/sign-in 200
check_http 'Sign-up page' http://localhost:3000/auth/sign-up 200
check_http 'Public job board' http://localhost:3000/jobs 200
check_http 'API/jobs (no auth)' http://localhost:3000/api/jobs 401
check_http 'API/candidates (no auth)' http://localhost:3000/api/candidates 401
[ "$fail" -eq 0 ]

output="$(docker compose exec app npm run db:seed 2>&1)"
echo "$output"
echo "$output" | grep -q 'Seed complete'
response="$(curl -s -X POST http://localhost:3000/api/auth/sign-in/email -H 'Content-Type: application/json' -d '{"email":"demo@reqcore.com","password":"demo1234"}' -w '\n%{http_code}')"
[ "$(echo "$response" | tail -n 1)" = 200 ]
echo "$response" | head -n -1 | grep -q 'demo@reqcore.com'
output="$(docker compose exec app npm run db:seed 2>&1)"
echo "$output"
if echo "$output" | grep -qi '^npm error\|unhandledRejection\|UnhandledPromiseRejection'; then
  echo "verify: second seed run produced an error." >&2
  exit 1
fi

docker compose --profile tools up -d adminer
for i in $(seq 20); do
  curl -fs http://localhost:8080 >/dev/null 2>&1 && break
  [ "$i" -eq 20 ] && { echo "verify: Adminer did not become reachable." >&2; exit 1; }
  sleep 2
done
docker compose restart app
for i in $(seq 30); do
  curl -fs http://localhost:3000 >/dev/null 2>&1 && break
  [ "$i" -eq 30 ] && { echo "verify: app did not recover after restart." >&2; exit 1; }
  sleep 3
done
if docker compose logs app | grep -q 'Migration failed'; then
  echo "verify: migration failure found after restart." >&2
  exit 1
fi

echo "verify: all gates passed."
