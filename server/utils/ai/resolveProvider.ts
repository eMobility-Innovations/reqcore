/**
 * Resolve which AI provider + key an analysis run should use, and who pays.
 *
 *   1. The org has its own AI config  → BYOK. Their key, their bill. Not capped.
 *   2. No org config, platform key set → route through OpenRouter on our key.
 *      `billingMode: 'platform'` — subject to the budget gate (budget.ts).
 *   3. Neither                         → 422, same as before.
 *
 * The platform key is encrypted here with the same secret the provider layer
 * decrypts with, so it travels the identical `apiKeyEncrypted` path — the raw
 * key never sits in a plaintext field on the config object.
 */
import { encrypt } from '../encryption'
import { resolveOrgPlanId } from '../billing/plan'
import { loadAiConfig } from './loadConfig'
import { OPENROUTER_BASE_URL, type ProviderConfig } from './provider'
import {
  getPlatformAiOverride,
  PLATFORM_AI_CONFIG_ID,
  platformOverrideEnabled,
  resolvePlatformAiProviderConfig,
} from './platformConfig'

export interface ResolvedProvider {
  providerConfig: ProviderConfig
  /** Stored on the analysisRun row; drives budget enforcement. */
  billingMode: 'platform' | 'byok'
  /** Provider + model strings for the audit trail. */
  provider: string
  model: string
}

export async function resolveAnalysisProvider(
  orgId: string,
  opts: { preferId?: string | null } = {},
): Promise<ResolvedProvider> {
  if (opts.preferId === PLATFORM_AI_CONFIG_ID) {
    const platform = await resolvePlatformAiProviderConfig(orgId)
    return {
      ...platform,
      billingMode: 'platform',
    }
  }

  if (!opts.preferId) {
    const platformOverride = await getPlatformAiOverride(orgId)
    if (platformOverride?.isEnabled && platformOverride.isDefaultAnalysis) {
      const platform = await resolvePlatformAiProviderConfig(orgId)
      return {
        ...platform,
        billingMode: 'platform',
      }
    }
  }

  // 1 + 3: org's own config (or 422 if none AND no platform fallback below).
  try {
    const config = await loadAiConfig(orgId, { purpose: 'analysis', preferId: opts.preferId })
    return {
      providerConfig: {
        provider: config.provider as ProviderConfig['provider'],
        model: config.model,
        apiKeyEncrypted: config.apiKeyEncrypted,
        baseUrl: config.baseUrl,
        maxTokens: config.maxTokens,
      },
      billingMode: 'byok',
      provider: config.provider,
      model: config.model,
    }
  }
  catch (err) {
    // Grandfathered hosted orgs are free because they pay the LLM provider
    // directly. If their BYOK config is missing, do not spend the platform key.
    if (await resolveOrgPlanId(orgId) === 'grandfathered') throw err

    // 2: no org config — fall back to the platform key if one is configured.
    const platformKey = env.OPENROUTER_API_KEY
    if (!platformKey) throw err
    const platformOverride = await getPlatformAiOverride(orgId)
    if (!platformOverrideEnabled(platformOverride)) throw err

    if (platformOverride) {
      const platform = await resolvePlatformAiProviderConfig(orgId)
      return {
        ...platform,
        billingMode: 'platform',
      }
    }

    const model = env.OPENROUTER_MODEL
    return {
      providerConfig: {
        provider: 'openrouter',
        model,
        apiKeyEncrypted: encrypt(platformKey, env.BETTER_AUTH_SECRET),
        baseUrl: OPENROUTER_BASE_URL,
        maxTokens: 4096,
      },
      billingMode: 'platform',
      provider: 'openrouter',
      model,
    }
  }
}
