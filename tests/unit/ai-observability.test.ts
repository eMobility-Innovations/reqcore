import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * PostHog LLM observability ($ai_generation) is the behavioural cost lens for
 * AI spend. It must (a) never throw into the caller, (b) always carry a trace
 * id so events land in PostHog's trace view, and (c) never leak prompt/response
 * content (candidate PII). These tests lock those invariants in.
 */

const capture = vi.fn()
let phClient: { capture: typeof capture } | null = { capture }

vi.mock('../../server/utils/posthog', () => ({
  useServerPostHog: () => phClient,
}))

const { captureAiGeneration } = await import('../../server/utils/ai/observability')

function lastProps() {
  return capture.mock.calls.at(-1)![0].properties
}

const base = {
  orgId: 'org_1',
  userId: 'user_1',
  feature: 'application_analysis' as const,
  provider: 'openrouter',
  model: 'gpt-4.1-mini',
  billingMode: 'platform' as const,
  promptTokens: 1000,
  completionTokens: 500,
  costUsdMicros: 1200,
  latencyMs: 2000,
  status: 'completed' as const,
}

beforeEach(() => {
  capture.mockClear()
  phClient = { capture }
})

describe('captureAiGeneration', () => {
  it('emits a $ai_generation event with the documented schema', () => {
    captureAiGeneration({ ...base, applicationId: 'app_1', traceId: 'run_1' })

    expect(capture).toHaveBeenCalledOnce()
    const call = capture.mock.calls[0][0]
    expect(call.event).toBe('$ai_generation')
    expect(call.distinctId).toBe('user_1')
    expect(call.groups).toEqual({ organization: 'org_1' })

    const p = call.properties
    expect(p.$ai_provider).toBe('openrouter')
    expect(p.$ai_model).toBe('gpt-4.1-mini')
    expect(p.$ai_input_tokens).toBe(1000)
    expect(p.$ai_output_tokens).toBe(500)
    expect(p.$ai_latency).toBe(2) // seconds
    expect(p.$ai_total_cost_usd).toBe(0.0012) // micros → usd
    expect(p.$ai_is_error).toBe(false)
    expect(p.$ai_http_status).toBe(200)
    expect(p.$ai_trace_id).toBe('run_1')
    expect(p.$ai_span_name).toBe('application_analysis')
    expect(p.feature).toBe('application_analysis')
    expect(p.billing_mode).toBe('platform')
    expect(p.application_id).toBe('app_1')
  })

  it('always supplies a trace id even when none is given', () => {
    captureAiGeneration({ ...base, traceId: null })
    const id = lastProps().$ai_trace_id
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('never sends prompt or completion content (PII)', () => {
    captureAiGeneration({ ...base, applicationId: 'app_1' })
    const p = lastProps()
    expect(p.$ai_input).toBeUndefined()
    expect(p.$ai_output_choices).toBeUndefined()
  })

  it('marks failures and omits an HTTP status it cannot know', () => {
    captureAiGeneration({ ...base, status: 'failed', costUsdMicros: null })
    const p = lastProps()
    expect(p.$ai_is_error).toBe(true)
    expect(p.$ai_http_status).toBeUndefined()
    expect(p.$ai_total_cost_usd).toBeUndefined()
  })

  it('falls back to a system distinct id for background runs', () => {
    captureAiGeneration({ ...base, userId: null })
    expect(capture.mock.calls[0][0].distinctId).toBe('system')
  })

  it('includes reasoning and cache-read tokens only when reported', () => {
    captureAiGeneration({ ...base, reasoningTokens: 64, cacheReadTokens: 800 })
    const withTokens = lastProps()
    expect(withTokens.$ai_reasoning_tokens).toBe(64)
    expect(withTokens.$ai_cache_read_input_tokens).toBe(800)

    captureAiGeneration({ ...base })
    const without = lastProps()
    expect(without.$ai_reasoning_tokens).toBeUndefined()
    expect(without.$ai_cache_read_input_tokens).toBeUndefined()
  })

  it('is a no-op when PostHog is not configured', () => {
    phClient = null
    expect(() => captureAiGeneration(base)).not.toThrow()
    expect(capture).not.toHaveBeenCalled()
  })

  it('swallows capture errors so observability never breaks the caller', () => {
    capture.mockImplementationOnce(() => { throw new Error('network down') })
    expect(() => captureAiGeneration(base)).not.toThrow()
  })
})
