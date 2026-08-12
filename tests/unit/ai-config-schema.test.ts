import { describe, it, expect } from 'vitest'
import { createAiConfigSchema, updateAiConfigSchema } from '../../server/utils/schemas/scoring'

/**
 * Validates the AI config schema accepts all supported providers,
 * especially 'openai_compatible' (issue #130).
 *
 * `name` became required when named configurations arrived with the AI chatbot
 * feature (912d55d): `ai_config.name` is NOT NULL, AiConfigForm.vue refuses to
 * submit an empty one, and POST /api/ai-config passes it straight through. The
 * four cases below predate that and had gone stale unnoticed, because the push
 * gate's `npm run test --if-present` step had no `test` script to run. They are
 * updated to the schema they exist to guard, and the create-vs-update
 * distinction each requirement rests on is now pinned in both directions.
 */
describe('createAiConfigSchema', () => {
  it('accepts openai_compatible provider with baseUrl', () => {
    const result = createAiConfigSchema.safeParse({
      name: 'Local Llama',
      provider: 'openai_compatible',
      model: 'llama-3.1-8b',
      apiKey: 'test-key',
      baseUrl: 'http://localhost:11434/v1',
      maxTokens: 4096,
    })

    expect(result.success).toBe(true)
  })

  it('accepts openai_compatible without baseUrl', () => {
    const result = createAiConfigSchema.safeParse({
      name: 'Custom model',
      provider: 'openai_compatible',
      model: 'custom-model',
      apiKey: 'test-key',
    })

    expect(result.success).toBe(true)
  })

  it('accepts standard openai provider', () => {
    const result = createAiConfigSchema.safeParse({
      name: 'GPT-4.1 mini',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      apiKey: 'sk-test123',
    })

    expect(result.success).toBe(true)
  })

  it('rejects unknown provider', () => {
    const result = createAiConfigSchema.safeParse({
      name: 'Ollama',
      provider: 'ollama',
      model: 'llama-3.1',
      apiKey: 'test',
    })

    expect(result.success).toBe(false)
  })

  it('rejects SSRF-risky baseUrl targeting cloud metadata', () => {
    const result = createAiConfigSchema.safeParse({
      name: 'Metadata probe',
      provider: 'openai_compatible',
      model: 'test',
      apiKey: 'test',
      baseUrl: 'http://169.254.169.254/latest/meta-data/',
    })

    expect(result.success).toBe(false)
  })

  it('requires a name — ai_config.name is NOT NULL', () => {
    const result = createAiConfigSchema.safeParse({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      apiKey: 'sk-test123',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.some(i => i.path[0] === 'name')).toBe(true)
  })

  it('requires an apiKey on create — there is no existing key to fall back on', () => {
    const result = createAiConfigSchema.safeParse({
      name: 'GPT-4.1 mini',
      provider: 'openai',
      model: 'gpt-4.1-mini',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.some(i => i.path[0] === 'apiKey')).toBe(true)
  })
})

describe('updateAiConfigSchema', () => {
  it('allows apiKey to be omitted (the stored key is kept)', () => {
    const result = updateAiConfigSchema.safeParse({
      provider: 'openai',
      model: 'gpt-4.1-mini',
    })

    expect(result.success).toBe(true)
  })

  it('allows a rename on its own', () => {
    const result = updateAiConfigSchema.safeParse({ name: 'Renamed config' })

    expect(result.success).toBe(true)
  })
})
