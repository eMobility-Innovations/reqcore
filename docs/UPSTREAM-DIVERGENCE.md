# Upstream divergence

## Which repository is upstream

**Upstream is [`reqcore-inc/reqcore`](https://github.com/reqcore-inc/reqcore).** Point the `upstream` remote there; `.sync-upstream.conf` names the remote, not the URL, so nothing else needs changing.

GitHub still records this fork's *parent* as `hahzterry/reqcore`, and this document used to say that was upstream. It is not. `hahzterry/reqcore` is a standalone copy of `reqcore-inc/reqcore` that stopped receiving commits on **2026-03-05** at `94b5cda`; measured on 2026-08-12, `reqcore-inc/reqcore` was **496 commits** beyond it. `94b5cda` is an ancestor of `reqcore-inc/main`, so the histories share a base and a normal merge works — but a fork that tracks the mirror sees no upstream change ever, and reads its own staleness as upstream defects. CT213's deployment clone has always had `origin = reqcore-inc/reqcore`; only this document and the workstation remote were wrong.

## Sending generic changes back

A change that fixes upstream's own defect is PR'd to `reqcore-inc/reqcore` rather than carried here, where it would conflict on every future sync. ESC-specific changes — the consent-banner removal, per-org board pinning, brand env, the RC white-label, and the workflow deletions below — stay in this fork and are never sent up.

PRs cannot be opened from this repository: it belongs to `hahzterry/reqcore`'s fork network, and GitHub only allows pull requests within one network. **[`eMobility-Innovations/reqcore-upstream`](https://github.com/eMobility-Innovations/reqcore-upstream) is a fork of `reqcore-inc/reqcore`** and exists solely to carry those branches. Push the topic branch there and open the PR from it.

Upstream requires a DCO sign-off on every commit (`git commit -s`) and a Conventional Commits PR title; both are enforced by their CI.

## Deliberately removed upstream paths

The following upstream-maintained paths are deliberately removed in this fork:

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
