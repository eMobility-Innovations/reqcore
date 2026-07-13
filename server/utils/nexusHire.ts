import { and, eq } from 'drizzle-orm'
import { candidate, job } from '../database/schema'
import { logWarn } from './logger'
import { buildOnboardingFromProperties, missingRequiredOnboarding } from '../../shared/onboarding'
import type { PropertyEntry } from './properties'

// The onboarding field mapping + hire-time requirements live in shared/onboarding
// (one source of truth, used by the client button gating too). Re-exported here so
// the applications PATCH handler (Nitro auto-import) and the unit tests keep
// reaching them via server/utils.
export { buildOnboardingFromProperties, missingRequiredOnboarding }

/**
 * Nexus onboarding "hired" webhook (fork addition — escooterclinic).
 *
 * When a candidate is marked hired in reqcore, notify the Nexus Onboarding
 * Board so it can open a "Pending onboarding" card and pre-fill the HR form.
 *
 * Direction: reqcore → Nexus. Strictly fire-and-forget — Nexus is the
 * consumer and a Nexus outage must never disrupt the recruiter's click, so
 * every function here is written to NEVER throw to the caller.
 *
 * Contract: nexus `docs/integrations/reqcore-hired-contract.md` (schema 1).
 * Wiring: `NEXUS_HIRE_WEBHOOK_URL` + `NEXUS_HIRE_WEBHOOK_KEY` (both optional,
 * self-gating — the webhook stays dormant unless both are set).
 */

/** Schema-1 packet posted to the Nexus hire webhook. */
export type NexusHirePacket = {
  schema_version: '1'
  event: 'application.hired'
  event_id: string
  candidate: {
    first_name: string
    last_name: string
    email: string
    phone?: string
    date_of_birth?: string
  }
  job: { title: string; location?: string }
  application: { id: string; score?: number }
  onboarding: Record<string, string>
}

/** Build the schema-1 packet from an application's joined candidate/job/props. */
export function buildNexusHirePacket(input: {
  applicationId: string
  score: number | null
  candidate: {
    firstName: string
    lastName: string
    email: string
    phone: string | null
    dateOfBirth: string | null
  }
  job: { title: string; location: string | null }
  propertyEntries: PropertyEntry[]
}): NexusHirePacket {
  const c = input.candidate
  return {
    schema_version: '1',
    event: 'application.hired',
    event_id: input.applicationId,
    candidate: {
      first_name: c.firstName,
      last_name: c.lastName,
      email: c.email,
      ...(c.phone ? { phone: c.phone } : {}),
      ...(c.dateOfBirth ? { date_of_birth: c.dateOfBirth } : {}),
    },
    job: {
      title: input.job.title,
      ...(input.job.location ? { location: input.job.location } : {}),
    },
    application: {
      id: input.applicationId,
      ...(input.score != null ? { score: input.score } : {}),
    },
    onboarding: buildOnboardingFromProperties(input.propertyEntries),
  }
}

type FetchLike = (url: string, opts: Record<string, unknown>) => Promise<unknown>

/**
 * POST the packet to Nexus. Dormant (no-op) unless both `url` and `key` are
 * provided. Never throws — a delivery failure is logged and swallowed so the
 * hire transition that triggered it always succeeds. `fetchImpl` is injectable
 * for tests; production uses the Nitro `$fetch` global.
 */
export async function sendNexusHirePacket(
  packet: NexusHirePacket,
  opts: { url?: string | null; key?: string | null; fetchImpl?: FetchLike },
): Promise<void> {
  if (!opts.url || !opts.key) return // dormant unless configured

  const doFetch: FetchLike = opts.fetchImpl ?? ($fetch as unknown as FetchLike)
  try {
    await doFetch(opts.url, {
      method: 'POST',
      headers: {
        'X-Reqcore-Key': opts.key,
        'Content-Type': 'application/json',
      },
      body: packet,
      timeout: 5000,
      retry: 0,
    })
  }
  catch (err) {
    logWarn('nexus.hire_webhook_post_failed', {
      event_id: packet.event_id,
      error_message: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Orchestrator called from the applications PATCH handler on the offer→hired
 * transition. Reads the candidate, job, and custom properties (all org-scoped),
 * builds the packet, and fires it. Wrapped so it NEVER throws to the caller —
 * `void notifyNexusOnHire(...)` in the handler must not be able to 500 the
 * recruiter's request.
 */
export async function notifyNexusOnHire(opts: {
  organizationId: string
  applicationId: string
  candidateId: string
  jobId: string
  score: number | null
}): Promise<void> {
  try {
    const url = env.NEXUS_HIRE_WEBHOOK_URL
    const key = env.NEXUS_HIRE_WEBHOOK_KEY
    if (!url || !key) return // dormant unless configured — skip the DB reads too

    const [cand, jb, propertyEntries] = await Promise.all([
      db.query.candidate.findFirst({
        where: and(
          eq(candidate.id, opts.candidateId),
          eq(candidate.organizationId, opts.organizationId),
        ),
        columns: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          dateOfBirth: true,
        },
      }),
      db.query.job.findFirst({
        where: and(eq(job.id, opts.jobId), eq(job.organizationId, opts.organizationId)),
        columns: { title: true, location: true },
      }),
      loadPropertyEntriesForEntity({
        organizationId: opts.organizationId,
        entityType: 'application',
        entityId: opts.applicationId,
        jobId: opts.jobId,
      }),
    ])

    if (!cand || !jb) {
      logWarn('nexus.hire_webhook_skipped', {
        application_id: opts.applicationId,
        reason: !cand ? 'candidate_missing' : 'job_missing',
      })
      return
    }

    const packet = buildNexusHirePacket({
      applicationId: opts.applicationId,
      score: opts.score,
      candidate: cand,
      job: jb,
      propertyEntries,
    })

    await sendNexusHirePacket(packet, { url, key })
  }
  catch (err) {
    // Never disrupt the primary hire operation.
    logWarn('nexus.hire_webhook_failed', {
      application_id: opts.applicationId,
      error_message: err instanceof Error ? err.message : String(err),
    })
  }
}
