import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  plan: 'grandfathered',
  platformOverride: null as null | { isEnabled: boolean, isDefaultAnalysis: boolean, model: string },
}))

vi.mock('../../server/utils/ai/loadConfig', () => ({
  loadAiConfig: vi.fn(async () => {
    throw new Error('No AI config')
  }),
}))

vi.mock('../../server/utils/billing/plan', () => ({
  resolveOrgPlanId: vi.fn(async () => state.plan),
}))

vi.mock('../../server/utils/ai/platformConfig', () => ({
  PLATFORM_AI_CONFIG_ID: '__platform__',
  getPlatformAiOverride: vi.fn(async () => state.platformOverride),
  platformOverrideEnabled: vi.fn((row: null | { isEnabled: boolean }) => row?.isEnabled ?? true),
  resolvePlatformAiProviderConfig: vi.fn(async () => ({
    providerConfig: {
      provider: 'openrouter',
      model: state.platformOverride?.model ?? 'openai/gpt-5.4-mini',
      apiKeyEncrypted: 'encrypted-platform-key',
      baseUrl: 'https://openrouter.ai/api/v1',
      maxTokens: 4096,
    },
    provider: 'openrouter',
    model: state.platformOverride?.model ?? 'openai/gpt-5.4-mini',
  })),
}))

import { resolveAnalysisProvider } from '../../server/utils/ai/resolveProvider'

describe('resolveAnalysisProvider grandfathered tier', () => {
  beforeEach(() => {
    state.plan = 'grandfathered'
    state.platformOverride = null
    vi.stubGlobal('env', {
      OPENROUTER_API_KEY: 'sk-platform-test',
      OPENROUTER_MODEL: 'openai/gpt-5.4-mini',
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
      model: 'openai/gpt-5.4-mini',
    })
  })

  it('does not resurrect the platform fallback after it has been removed', async () => {
    state.plan = 'free'
    state.platformOverride = { isEnabled: false, isDefaultAnalysis: false, model: 'openai/gpt-5.4-mini' }

    await expect(resolveAnalysisProvider('org_1')).rejects.toThrow('No AI config')
  })

  it('uses a customized platform default without classifying it as BYOK', async () => {
    state.plan = 'free'
    state.platformOverride = { isEnabled: true, isDefaultAnalysis: true, model: 'anthropic/claude-sonnet-5' }

    await expect(resolveAnalysisProvider('org_1')).resolves.toMatchObject({
      billingMode: 'platform',
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-5',
    })
  })
})
