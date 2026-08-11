# Upstream divergence

This repository is a fork of `hahzterry/reqcore` and tracks its `main` branch through the `upstream` remote.

The following upstream-maintained paths are deliberately removed in this fork:

- `.github/workflows/dependabot-automerge.yml` — upstream Dependabot process automation cannot provide a local code gate.
- `.github/workflows/docker-publish.yml` — GitHub Actions publishing is replaced by `deploy.sh`.
- `.github/workflows/docker-readme-validation.yml` — its setup and Docker integration checks run in `verify.sh`.
- `.github/workflows/e2e-tests.yml` — its PostgreSQL, MinIO, build, and Playwright checks run in `verify.sh`.
- `.github/workflows/pr-title-lint.yml` — upstream pull-request process automation does not apply to this fork's local gate.
- `.github/workflows/pr-validation.yml` — its tests, lint, typecheck, audit, and build run in `verify.sh`.
- `.github/workflows/release-please.yml` — upstream release-management automation does not apply to this fork.
- `.github/workflows/release-verification.yml` — published-image verification and release-bundle upload are replaced by `release.sh`.

GitHub Actions is permanently unavailable for the eMobility-Innovations organization by operator decision. These deletions are therefore intentional policy, not temporary workarounds. `check-no-workflows.sh` makes a silently re-added workflow fail the local gate, while `sync-upstream.sh` removes workflows after upstream merges. Delete/modify conflicts remain intentionally loud.

Future workflow removals made during upstream syncs are recorded by commits matching:

```bash
git log --grep="dropping upstream .github/workflows"
```
