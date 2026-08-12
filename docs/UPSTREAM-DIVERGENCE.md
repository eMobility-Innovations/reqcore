# Upstream divergence

## Which repository is upstream

**Upstream is [`reqcore-inc/reqcore`](https://github.com/reqcore-inc/reqcore).** Point the `upstream` remote there; `.sync-upstream.conf` names the remote, not the URL, so nothing else needs changing.

GitHub still records this fork's *parent* as `hahzterry/reqcore`, and this document used to say that was upstream. It is not. `hahzterry/reqcore` is a standalone copy of `reqcore-inc/reqcore` that stopped receiving commits on **2026-03-05** at `94b5cda`; measured on 2026-08-12, `reqcore-inc/reqcore` was **496 commits** beyond it. `94b5cda` is an ancestor of `reqcore-inc/main`, so the histories share a base and a normal merge works — but a fork that tracks the mirror sees no upstream change ever, and reads its own staleness as upstream defects. CT213's deployment clone has always had `origin = reqcore-inc/reqcore`; only this document and the workstation remote were wrong.

## Sending generic changes back

A change that fixes upstream's own defect is PR'd to `reqcore-inc/reqcore` rather than carried here, where it would conflict on every future sync. ESC-specific changes — the consent-banner removal, per-org board pinning, brand env, the RC white-label, and the workflow deletions below — stay in this fork and are never sent up.

PRs cannot be opened from this repository: it belongs to `hahzterry/reqcore`'s fork network, and GitHub only allows pull requests within one network. **[`eMobility-Innovations/reqcore-upstream`](https://github.com/eMobility-Innovations/reqcore-upstream) is a fork of `reqcore-inc/reqcore`** and exists solely to carry those branches. Push the topic branch there and open the PR from it.

Upstream requires a DCO sign-off on every commit (`git commit -s`) and a Conventional Commits PR title; both are enforced by their CI.

## Deliberate dependency deviations

Measured while syncing `main` onto tag `v1.6.0` on 2026-08-12. Each is a deviation from upstream's
own `package.json`, kept because upstream's version does not pass this fork's gate. Remove any of
them the moment upstream's own tree makes it unnecessary — a stale deviation is the thing this
document exists to prevent.

| deviation | why | when it goes |
|---|---|---|
| `ai`, `@ai-sdk/{anthropic,google,openai}` carry `<` ceilings | the TAIL of every current major is under advisory, and `@ai-sdk/provider-utils` 4.0.41+ pulls `undici ^5.29.0` — all of undici 5.x sits inside `GHSA-vrm6-8vpv-qv8q`, the one HIGH that fails `./verify.sh` | when the `ai` 7 / `@ai-sdk` 4 upgrade is reviewed and taken; the ceilings block genuine fixes too |
| `unhead` override raised to `>=3.3.1` | upstream pins it at `2.1.13` while their own nuxt 4.4.8 asks for `^2.1.15`, and nuxt 4.5.2 — the first release outside the nuxt advisory — needs `^3.3.1`. The exact pin was already forcing their tree backwards | when upstream raises the pin themselves |
| security overrides are ranges (`>=`), not exact pins | [reqcore-inc/reqcore#273](https://github.com/reqcore-inc/reqcore/pull/273); every floor is `max(ours, upstream's)`, so the form never lowers a version upstream reached | if #273 lands, this stops being a deviation |
| `engines` + `.nvmrc` | [#272](https://github.com/reqcore-inc/reqcore/pull/272), pending | if #272 lands |
| no CI badges in `README.md` | they point at workflows this fork deletes, so they would report an account failure forever | never — it follows from the workflow deletion |

**The lockfile is generated with npm 11, and `npm ci` is then proved under npm 10.9.8 as well.**
Both matter and neither is optional: `node:22.22-alpine` ships npm 10.9.8, so the Docker build runs
`npm ci` under it — but npm 10.9.8's *resolver* hoists `cac@7` and cannot nest the `cac@6`
`@bomb.sh/tab` requires, producing a lockfile its own `npm ci` then rejects. An npm 11-resolved
lockfile satisfies both. A green `npm ci` is a claim about one npm version, never about the repo.

## Deliberately removed upstream paths

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
