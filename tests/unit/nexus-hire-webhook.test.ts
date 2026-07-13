import { describe, it, expect, vi } from 'vitest'
import {
  buildOnboardingFromProperties,
  buildNexusHirePacket,
  sendNexusHirePacket,
  missingRequiredOnboarding,
} from '../../server/utils/nexusHire'
import { envSchema } from '../../server/utils/env'
import type { PropertyEntry } from '../../server/utils/properties'

/**
 * Tests for the reqcore → Nexus "hired" webhook (fork addition).
 * Covers env plumbing, packet construction, custom-property mapping
 * (incl. select id→label resolution), and the fire-and-forget delivery
 * contract (dormant without config, never throws on failure).
 */

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'https://app.example.com',
  S3_ENDPOINT: 'https://s3.example.com',
  S3_ACCESS_KEY: 'test-key',
  S3_SECRET_KEY: 'test-secret',
  S3_BUCKET: 'test-bucket',
}

/** Build a minimal PropertyEntry for a given definition + value. */
function entry(
  name: string,
  type: PropertyEntry['definition']['type'],
  value: unknown,
  config: Record<string, unknown> | null = null,
): PropertyEntry {
  return {
    definition: {
      id: `def-${name}`,
      organizationId: 'org-1',
      jobId: null,
      entityType: 'application',
      type,
      name,
      description: null,
      displayOrder: 0,
      config,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    value,
  }
}

describe('nexus hire webhook — env plumbing', () => {
  it('stays valid when both vars are omitted (dormant by default)', () => {
    const result = envSchema.safeParse(baseEnv)
    expect(result.success).toBe(true)
    expect(result.data?.NEXUS_HIRE_WEBHOOK_URL).toBeUndefined()
    expect(result.data?.NEXUS_HIRE_WEBHOOK_KEY).toBeUndefined()
  })

  it('accepts a valid URL + key', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      NEXUS_HIRE_WEBHOOK_URL: 'https://nexus.fiszu.com/api/onboarding-board/webhooks/reqcore/hired',
      NEXUS_HIRE_WEBHOOK_KEY: 'shared-secret',
    })
    expect(result.success).toBe(true)
    expect(result.data?.NEXUS_HIRE_WEBHOOK_URL).toContain('/reqcore/hired')
    expect(result.data?.NEXUS_HIRE_WEBHOOK_KEY).toBe('shared-secret')
  })

  it('does NOT require both together (no both-or-none crash)', () => {
    // Partial config must not fail validation — the webhook self-gates instead.
    const onlyUrl = envSchema.safeParse({ ...baseEnv, NEXUS_HIRE_WEBHOOK_URL: 'https://x.example/hook' })
    const onlyKey = envSchema.safeParse({ ...baseEnv, NEXUS_HIRE_WEBHOOK_KEY: 'k' })
    expect(onlyUrl.success).toBe(true)
    expect(onlyKey.success).toBe(true)
  })

  it('rejects a non-URL webhook value', () => {
    const result = envSchema.safeParse({ ...baseEnv, NEXUS_HIRE_WEBHOOK_URL: 'not-a-url' })
    expect(result.success).toBe(false)
  })
})

describe('buildOnboardingFromProperties', () => {
  it('maps known properties and resolves select ids to labels', () => {
    const onboarding = buildOnboardingFromProperties([
      entry('Start date', 'date', '2026-08-01'),
      entry('Contract type', 'select', 'ft', {
        options: [{ id: 'ft', label: 'Full-time' }, { id: 'pt', label: 'Part-time' }],
      }),
      entry('Company', 'select', 'esc', { options: [{ id: 'esc', label: 'Escooter Clinic' }] }),
      entry('Country', 'select', 'gbr', { options: [{ id: 'gbr', label: 'GBR' }] }),
      entry('Work email domain', 'select', 'ecc', {
        options: [{ id: 'ecc', label: '@escooterclinic.co.uk' }],
      }),
    ])

    expect(onboarding).toEqual({
      start_date: '2026-08-01',
      contract_type: 'Full-time',
      company: 'Escooter Clinic',
      country: 'GBR',
      work_email_domain: '@escooterclinic.co.uk',
    })
  })

  it('normalizes name casing/spacing when matching', () => {
    const onboarding = buildOnboardingFromProperties([
      entry('  start   DATE ', 'text', '2026-09-01'),
    ])
    expect(onboarding.start_date).toBe('2026-09-01')
  })

  it('skips unmapped and empty properties', () => {
    const onboarding = buildOnboardingFromProperties([
      entry('Favourite colour', 'text', 'blue'), // unmapped
      entry('Start date', 'date', null), // empty
      entry('Country', 'select', 'unknown-id', { options: [{ id: 'gbr', label: 'GBR' }] }), // unresolvable → ''
    ])
    expect(onboarding).toEqual({})
  })
})

describe('missingRequiredOnboarding', () => {
  const sel = (name: string, id: string, label: string) =>
    entry(name, 'select', id, { options: [{ id, label }] })

  it('returns all five labels when nothing is filled', () => {
    expect(missingRequiredOnboarding([])).toEqual([
      'Start date', 'Contract type', 'Company', 'Country', 'Work email domain',
    ])
  })

  it('returns empty when all five are present', () => {
    const entries = [
      entry('Start date', 'date', '2026-08-01'),
      sel('Contract type', 'ft', 'Full-time'),
      sel('Company', 'esc', 'Escooter Clinic'),
      sel('Country', 'gbr', 'GBR'),
      sel('Work email domain', 'ecc', '@escooterclinic.co.uk'),
    ]
    expect(missingRequiredOnboarding(entries)).toEqual([])
  })

  it('lists only the missing ones, in display order', () => {
    const entries = [
      sel('Contract type', 'ft', 'Full-time'),
      sel('Country', 'gbr', 'GBR'),
      entry('Start date', 'date', null), // empty → still missing
    ]
    expect(missingRequiredOnboarding(entries)).toEqual([
      'Start date', 'Company', 'Work email domain',
    ])
  })
})

describe('buildNexusHirePacket', () => {
  const base = {
    applicationId: 'app-123',
    score: 82,
    candidate: {
      firstName: 'Ramy',
      lastName: 'Maher',
      email: 'ramy.maher@gmail.com',
      phone: '+44123',
      dateOfBirth: '1996-04-12',
    },
    job: { title: 'Customer Support Associate', location: 'London' },
    propertyEntries: [entry('Start date', 'date', '2026-08-01')] as PropertyEntry[],
  }

  it('builds the schema-1 shape with event_id = application id', () => {
    const p = buildNexusHirePacket(base)
    expect(p.schema_version).toBe('1')
    expect(p.event).toBe('application.hired')
    expect(p.event_id).toBe('app-123')
    expect(p.application).toEqual({ id: 'app-123', score: 82 })
    expect(p.candidate).toEqual({
      first_name: 'Ramy',
      last_name: 'Maher',
      email: 'ramy.maher@gmail.com',
      phone: '+44123',
      date_of_birth: '1996-04-12',
    })
    expect(p.job).toEqual({ title: 'Customer Support Associate', location: 'London' })
    expect(p.onboarding).toEqual({ start_date: '2026-08-01' })
  })

  it('omits optional candidate/job fields and score when null', () => {
    const p = buildNexusHirePacket({
      ...base,
      score: null,
      candidate: { firstName: 'A', lastName: 'B', email: 'a@b.com', phone: null, dateOfBirth: null },
      job: { title: 'Mechanic', location: null },
      propertyEntries: [],
    })
    expect(p.candidate).toEqual({ first_name: 'A', last_name: 'B', email: 'a@b.com' })
    expect(p.candidate).not.toHaveProperty('phone')
    expect(p.candidate).not.toHaveProperty('date_of_birth')
    expect(p.job).toEqual({ title: 'Mechanic' })
    expect(p.application).toEqual({ id: 'app-123' })
    expect(p.onboarding).toEqual({})
  })
})

describe('sendNexusHirePacket — fire-and-forget delivery', () => {
  const packet = buildNexusHirePacket({
    applicationId: 'app-1',
    score: null,
    candidate: { firstName: 'A', lastName: 'B', email: 'a@b.com', phone: null, dateOfBirth: null },
    job: { title: 'CS', location: null },
    propertyEntries: [],
  })

  it('is dormant (never calls fetch) when url or key is missing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({})
    await sendNexusHirePacket(packet, { url: undefined, key: 'k', fetchImpl })
    await sendNexusHirePacket(packet, { url: 'https://x/h', key: undefined, fetchImpl })
    await sendNexusHirePacket(packet, { url: '', key: '', fetchImpl })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('POSTs with the X-Reqcore-Key header and packet body when configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ process_id: 42 })
    await sendNexusHirePacket(packet, { url: 'https://nexus/h', key: 'secret', fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://nexus/h')
    expect(opts.method).toBe('POST')
    expect(opts.headers['X-Reqcore-Key']).toBe('secret')
    expect(opts.body).toBe(packet)
    expect(opts.retry).toBe(0)
  })

  it('never throws when the POST fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('nexus down'))
    await expect(
      sendNexusHirePacket(packet, { url: 'https://nexus/h', key: 'secret', fetchImpl }),
    ).resolves.toBeUndefined()
  })
})
