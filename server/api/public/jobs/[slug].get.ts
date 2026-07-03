import { eq, and, asc } from 'drizzle-orm'
import { job, organization, orgSettings } from '../../../database/schema'
import { publicJobSlugSchema } from '../../../utils/schemas/publicApplication'

/**
 * GET /api/public/jobs/:slug
 * Returns job details + custom questions for an open job, resolved by slug.
 * Includes organization name for SEO structured data (Google Jobs).
 * When org scope is set, 404s if the job belongs to a different org (prevents
 * cross-brand URL access on a branded domain).
 * No auth required — public-facing endpoint for applicants.
 */
export default defineEventHandler(async (event) => {
  const { slug } = await getValidatedRouterParams(event, publicJobSlugSchema.parse)

  // Resolve org scope: runtime env (set per-container for branded boards)
  const config = useRuntimeConfig(event)
  const orgScope: string =
    (typeof config.public.orgSlug === 'string' && config.public.orgSlug.trim()) || ''

  const result = await db.query.job.findFirst({
    where: and(eq(job.slug, slug), eq(job.status, 'open')),
    columns: {
      id: true,
      organizationId: true,
      title: true,
      slug: true,
      description: true,
      location: true,
      type: true,
      status: true,
      salaryMin: true,
      salaryMax: true,
      salaryCurrency: true,
      salaryUnit: true,
      salaryNegotiable: true,
      remoteStatus: true,
      validThrough: true,
      phoneRequirement: true,
      requireResume: true,
      requireCoverLetter: true,
      createdAt: true,
    },
    with: {
      organization: {
        columns: {
          name: true,
          logo: true,
          slug: true,
        },
      },
      questions: {
        orderBy: (q, { asc }) => [asc(q.displayOrder), asc(q.createdAt)],
        columns: {
          id: true,
          type: true,
          label: true,
          description: true,
          required: true,
          options: true,
          displayOrder: true,
        },
      },
    },
  })

  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }

  // Org scope guard: if this container is pinned to an org, reject jobs from other orgs
  if (orgScope && result.organization?.slug !== orgScope) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }
  // Org-configured privacy notice shown on the application form.
  const settings = await db.query.orgSettings.findFirst({
    where: eq(orgSettings.organizationId, result.organizationId),
    columns: { privacyPolicyUrl: true, privacyPolicyText: true, privacyContactEmail: true },
  })

  // Flatten organization name into the response for SEO consumers
  const { organization: org, organizationId: _orgId, ...jobData } = result
  return {
    ...jobData,
    organizationName: org?.name ?? null,
    organizationLogo: org?.logo ?? null,
    privacyPolicyUrl: settings?.privacyPolicyUrl ?? null,
    privacyPolicyText: settings?.privacyPolicyText ?? null,
    privacyContactEmail: settings?.privacyContactEmail ?? null,
  }
})
