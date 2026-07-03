/**
 * Marks existing free workspaces as "grandfathered" so legacy users keep
 * access to grandfathered limits and BYOK.
 *
 * Default is a dry-run:
 *   npx tsx server/scripts/grandfather-byok-orgs.ts --created-before 2026-06-30
 *
 * Apply:
 *   npx tsx server/scripts/grandfather-byok-orgs.ts --apply --created-before 2026-06-30
 *
 * Optional scoping:
 *   npx tsx server/scripts/grandfather-byok-orgs.ts --apply --org acme --org org_123
 *
 * Demo workspaces are always excluded.
 */
import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { and, eq, inArray } from 'drizzle-orm'
import * as schema from '../database/schema'

const CURRENT_STATUSES = ['active', 'trialing', 'past_due']
const DEFAULT_DEMO_ORG_SLUG = 'reqcore-demo'

type CandidateOrg = {
  id: string
  name: string
  slug: string
  created_at: Date
  ai_config_count: number
}

const processWithLoadEnv = process as NodeJS.Process & { loadEnvFile?: (path?: string) => void }
if (!process.env.DATABASE_URL && typeof processWithLoadEnv.loadEnvFile === 'function') {
  try { processWithLoadEnv.loadEnvFile('.env') } catch {}
}

function optionValue(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i === -1) return null
  return process.argv[i + 1] ?? null
}

function repeatedOption(name: string): string[] {
  const values: string[] = []
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === name && process.argv[i + 1]) values.push(process.argv[i + 1]!)
  }
  return values
}

function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? ''
  try {
    const parsed = new URL(raw)
    if (parsed.hostname) return raw
  } catch {}

  const host = process.env.PGHOST ?? process.env.RAILWAY_TCP_PROXY_DOMAIN ?? ''
  const port = process.env.PGPORT ?? process.env.RAILWAY_TCP_PROXY_PORT ?? '5432'
  const user = process.env.PGUSER ?? 'postgres'
  const password = process.env.PGPASSWORD ?? ''
  const database = process.env.PGDATABASE ?? 'railway'

  return host
    ? `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`
    : ''
}

const apply = process.argv.includes('--apply')
const orgFilters = repeatedOption('--org')
const cutoffRaw = optionValue('--created-before')
const cutoff = cutoffRaw ? new Date(cutoffRaw) : null
const demoOrgSlugs = [...new Set([DEFAULT_DEMO_ORG_SLUG, process.env.DEMO_ORG_SLUG].filter((slug): slug is string => Boolean(slug)))]

if (cutoffRaw && Number.isNaN(cutoff?.getTime())) {
  console.error(`Invalid --created-before date: ${cutoffRaw}`)
  process.exit(1)
}

const DATABASE_URL = resolveDatabaseUrl()
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required. Set it in .env or export it.')
  process.exit(1)
}

const client = postgres(DATABASE_URL, { max: 1 })
const db = drizzle(client, { schema })

async function findCandidateOrgs(): Promise<CandidateOrg[]> {
  const filters = [
    client`o.slug not in ${client(demoOrgSlugs)}`,
  ]

  if (cutoff) filters.push(client`o.created_at < ${cutoff.toISOString()}`)
  if (orgFilters.length) {
    filters.push(client`(o.id in ${client(orgFilters)} or o.slug in ${client(orgFilters)})`)
  }

  const where = filters.reduce((acc, filter) => client`${acc} and ${filter}`)

  return client<CandidateOrg[]>`
    select
      o.id,
      o.name,
      o.slug,
      o.created_at,
      count(ac.id)::int as ai_config_count
    from organization o
    left join ai_config ac on ac.organization_id = o.id
    where ${where}
    group by o.id, o.name, o.slug, o.created_at
    order by o.created_at asc
  `
}

async function currentSubscriptions(orgId: string) {
  return db
    .select({
      id: schema.subscription.id,
      plan: schema.subscription.plan,
      status: schema.subscription.status,
      stripeSubscriptionId: schema.subscription.stripeSubscriptionId,
    })
    .from(schema.subscription)
    .where(and(
      eq(schema.subscription.referenceId, orgId),
      inArray(schema.subscription.status, CURRENT_STATUSES),
    ))
}

async function existingGrandfatheredSubscription(orgId: string) {
  const [row] = await db
    .select({ id: schema.subscription.id, status: schema.subscription.status })
    .from(schema.subscription)
    .where(and(
      eq(schema.subscription.referenceId, orgId),
      eq(schema.subscription.plan, 'grandfathered'),
    ))
    .limit(1)
  return row ?? null
}

async function main() {
  const candidates = await findCandidateOrgs()
  console.log(`${apply ? 'Applying' : 'Dry run'} grandfathered BYOK plan for ${candidates.length} candidate org(s).`)
  if (cutoff) console.log(`Cutoff: organization created before ${cutoff.toISOString()}`)
  if (orgFilters.length) console.log(`Scoped to: ${orgFilters.join(', ')}`)

  let changed = 0
  let skipped = 0

  for (const org of candidates) {
    const current = await currentSubscriptions(org.id)
    const paid = current.find(row => row.stripeSubscriptionId)
    const agency = current.find(row => row.plan === 'agency')
    const grandfathered = current.find(row => row.plan === 'grandfathered')

    if (paid || agency) {
      skipped += 1
      console.log(`skip ${org.slug}: already has active ${paid?.plan ?? agency?.plan} entitlement`)
      continue
    }

    if (grandfathered) {
      skipped += 1
      console.log(`skip ${org.slug}: already grandfathered`)
      continue
    }

    changed += 1
    console.log(`${apply ? 'grant' : 'would grant'} ${org.slug} (${org.name}) with ${org.ai_config_count} AI config(s)`)

    if (!apply) continue

    const existing = await existingGrandfatheredSubscription(org.id)
    if (existing) {
      await db
        .update(schema.subscription)
        .set({
          status: 'active',
          periodStart: new Date(),
          periodEnd: null,
          cancelAtPeriodEnd: false,
          canceledAt: null,
          endedAt: null,
          billingInterval: 'grandfathered',
        })
        .where(eq(schema.subscription.id, existing.id))
      continue
    }

    await db.insert(schema.subscription).values({
      id: `grandfathered_${randomUUID()}`,
      plan: 'grandfathered',
      referenceId: org.id,
      status: 'active',
      periodStart: new Date(),
      periodEnd: null,
      cancelAtPeriodEnd: false,
      billingInterval: 'grandfathered',
    })
  }

  console.log(`${apply ? 'Changed' : 'Would change'} ${changed} org(s); skipped ${skipped}.`)
  if (!apply) console.log('Run again with --apply to write the subscription rows.')
}

main()
  .catch((err) => {
    console.error('Failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await client.end()
  })
