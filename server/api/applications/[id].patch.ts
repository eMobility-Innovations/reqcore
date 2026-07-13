import { eq, and } from 'drizzle-orm'
import { application } from '../../database/schema'
import { applicationIdParamSchema, updateApplicationSchema, APPLICATION_STATUS_TRANSITIONS } from '../../utils/schemas/application'

/**
 * PATCH /api/applications/:id
 * Update application status (with server-side transition validation), notes, and score.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, applicationIdParamSchema.parse)
  const body = await readValidatedBody(event, updateApplicationSchema.parse)

  // Fetch current application to validate status transition
  const current = await db.query.application.findFirst({
    where: and(eq(application.id, id), eq(application.organizationId, orgId)),
    columns: { id: true, status: true, jobId: true },
  })

  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  // Validate status transition if status is being changed
  if (body.status && body.status !== current.status) {
    const allowed = APPLICATION_STATUS_TRANSITIONS[current.status] ?? []
    if (!allowed.includes(body.status)) {
      throw createError({
        statusCode: 422,
        statusMessage: `Cannot transition from "${current.status}" to "${body.status}". Allowed: ${allowed.join(', ') || 'none'}`,
      })
    }
  }

  // Fork policy: HR must fill the required onboarding properties before a candidate
  // can be marked hired. Enforced here — the single choke-point for all status
  // changes — so both the "Mark Hired" button and the raw API are covered. The same
  // fields feed the Nexus onboarding card (see server/utils/nexusHire.ts).
  if (body.status === 'hired' && current.status !== 'hired') {
    const entries = await loadPropertyEntriesForEntity({
      organizationId: orgId,
      entityType: 'application',
      entityId: id,
      jobId: current.jobId,
    })
    const missing = missingRequiredOnboarding(entries)
    if (missing.length > 0) {
      throw createError({
        statusCode: 422,
        statusMessage: `Cannot mark hired — fill the required onboarding fields first: ${missing.join(', ')}`,
      })
    }
  }

  const [updated] = await db.update(application)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(application.id, id), eq(application.organizationId, orgId)))
    .returning({
      id: application.id,
      candidateId: application.candidateId,
      jobId: application.jobId,
      status: application.status,
      score: application.score,
      notes: application.notes,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  // Notify the Nexus Onboarding Board on the offer→hired transition so it can
  // open a "Pending onboarding" card. Fire-and-forget: `notifyNexusOnHire`
  // never throws, and we don't await it, so a Nexus outage can't disrupt the
  // recruiter's click. Dormant unless NEXUS_HIRE_WEBHOOK_URL/KEY are set.
  if (updated.status === 'hired' && current.status !== 'hired') {
    void notifyNexusOnHire({
      organizationId: orgId,
      applicationId: id,
      candidateId: updated.candidateId,
      jobId: updated.jobId,
      score: updated.score,
    })
  }

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: body.status && body.status !== current.status ? 'status_changed' : 'updated',
    resourceType: 'application',
    resourceId: id,
    metadata: body.status && body.status !== current.status
      ? { from: current.status, to: body.status }
      : undefined,
  })

  // Track to PostHog for per-user debugging and funnel analytics
  if (body.status && body.status !== current.status) {
    trackEvent(event, session, 'application status_changed', {
      application_id: id,
      job_id: updated.jobId,
      from_status: current.status,
      to_status: body.status,
    })

    logApiRequest(event, session, 'application.status_changed', {
      application_id: id,
      job_id: updated.jobId,
      from_status: current.status,
      to_status: body.status,
    })
  }

  return updated
})
