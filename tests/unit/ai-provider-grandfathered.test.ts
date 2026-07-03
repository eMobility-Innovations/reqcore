import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ plan: 'grandfathered' }))

vi.mock('../../server/utils/ai/loadConfig', () => ({
  loadAiConfig: vi.fn(async () => {
    throw new Error('No AI config')
  }),
}))

vi.mock('../../server/utils/billing/plan', () => ({
  resolveOrgPlanId: vi.fn(async () => state.plan),
}))

import { resolveAnalysisProvider } from '../../server/utils/ai/resolveProvider'

describe('resolveAnalysisProvider grandfathered tier', () => {
  beforeEach(() => {
    state.plan = 'grandfathered'
    vi.stubGlobal('env', {
      OPENROUTER_API_KEY: 'sk-platform-test',
      OPENROUTER_MODEL: 'openai/gpt-4.1-mini',
      BETTER_AUTH_SECRET: 'test-secret-that-is-long-enough',
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('does not fall back to the platform key for grandfathered orgs', async () => {
    await expect(resolveAnalysisProvider('org_1')).rejects.toThrow('No AI config')
  })

  it('still falls back to the platform key for normal free orgs', async () => {
    state.plan = 'free'
    await expect(resolveAnalysisProvider('org_1')).resolves.toMatchObject({
      billingMode: 'platform',
      provider: 'openrouter',
      model: 'openai/gpt-4.1-mini',
    })
  })
})
