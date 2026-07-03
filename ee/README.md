# Reqcore Enterprise Edition (`ee/`)

Code in this directory is **not** covered by the AGPLv3 license that applies
to the rest of the Reqcore repository. See [LICENSE](LICENSE).

## What goes here

Paid, cloud-only features that sit on top of the AGPL core — things like
career-page custom domains, team roles/SSO, integrations/API/webhooks, and
advanced analytics/audit logs. The AGPL core never depends on `ee/`: the
scoring/shortlist logic, unlimited applicants, and anything before a org's
first shortlist stay out of this folder permanently, since that's the part
of the product self-hosters and evaluators need to trust and verify.

## Structure

This directory is a [Nuxt layer](https://nuxt.com/docs/getting-started/layers),
pulled in by the root `nuxt.config.ts` via `extends: ["./ee"]`. It mirrors the
root app layout — add files under the same paths you would in the root:

```
ee/
  server/api/...        # Nitro API routes
  server/utils/...       # server-only helpers
  app/components/...     # Vue components
  app/composables/...    # composables
  app/pages/...           # pages
```

Only create the subdirectories you actually need — Nuxt doesn't require any
of them to exist.

## Gating

`ee/` code doesn't need its own entitlement system. Every feature in here
should gate itself the same way any other paid feature does, via
`assertPlanFeature(orgId, feature)` / `assertTierFeature` in
`server/utils/billing/plan.ts`, with a matching `PlanFeature` entry in
`shared/billing.ts`. That check already fails closed when Stripe billing
isn't configured in production (see `no-self-hosting` behavior), so a
self-hoster who runs this code gets a locked feature, not a free one — no
separate license-key server required.
