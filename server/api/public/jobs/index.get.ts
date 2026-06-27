import { eq, and, desc, ilike, or } from 'drizzle-orm'
import { job, organization } from '../../../database/schema'
import { publicJobsQuerySchema } from '../../../utils/schemas/publicApplication'

/**
 * GET /api/public/jobs
 * Lists open jobs with pagination, search, and type filter.
 * When NUXT_PUBLIC_ORG_SLUG is set (or ?org= is passed), filters to that org only.
 * No auth required — public-facing job board endpoint.
 */
export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, publicJobsQuerySchema.parse)

  // Resolve org scope: explicit ?org= param takes priority, then runtime env
  const config = useRuntimeConfig(event)
  const orgScope: string =
    (typeof query.org === 'string' && query.org.trim()) ||
    (typeof config.public.orgSlug === 'string' && config.public.orgSlug.trim()) ||
    ''

  const offset = (query.page - 1) * query.limit

  // Always filter to open jobs only
  const conditions = [eq(job.status, 'open')]

  // Org scope filter — join organization and match by slug
  let orgId: string | null = null
  if (orgScope) {
    const org = await db.query.organization.findFirst({
      where: eq(organization.slug, orgScope),
      columns: { id: true },
    })
    if (!org) {
      // Unknown org slug → empty result
      return { data: [], total: 0, page: query.page, limit: query.limit }
    }
    orgId = org.id
    conditions.push(eq(job.organizationId, org.id))
  }

  // Optional search — matches title OR location
  if (query.search) {
    const escaped = query.search.replace(/[%_\\]/g, '\\$&')
    const pattern = `%${escaped}%`
    conditions.push(
      or(
        ilike(job.title, pattern),
        ilike(job.location, pattern),
      )!,
    )
  }

  // Optional type filter
  if (query.type) {
    conditions.push(eq(job.type, query.type))
  }

  // Optional location filter
  if (query.location) {
    const escapedLoc = query.location.replace(/[%_\\]/g, '\\$&')
    conditions.push(ilike(job.location, `%${escapedLoc}%`))
  }

  const where = and(...conditions)

  const [data, total] = await Promise.all([
    db.query.job.findMany({
      where,
      limit: query.limit,
      offset,
      orderBy: [desc(job.createdAt)],
      columns: {
        id: true,
        title: true,
        slug: true,
        description: true,
        location: true,
        type: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
        salaryUnit: true,
        remoteStatus: true,
        createdAt: true,
      },
      with: {
        organization: {
          columns: { name: true },
        },
      },
    }),
    db.$count(job, where),
  ])

  // Flatten org name into each job object
  const flatData = data.map(({ organization: org, ...j }) => ({
    ...j,
    organizationName: org?.name ?? null,
  }))

  return { data: flatData, total, page: query.page, limit: query.limit }
})
