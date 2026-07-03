/**
 * PostHog LLM observability for AI generations.
 *
 * Emits a `$ai_generation` event (PostHog's LLM-observability schema) so AI
 * spend shows up next to product analytics — e.g. cost per converted customer,
 * which features burn tokens. This is the *behavioural* lens; it is NOT the
 * money-safety layer (that's budget.ts) nor the billing source of truth (that's
 * the OpenRouter invoice). Numbers here won't reconcile to the penny, by design.
 *
 * Privacy by design: we deliberately never send `$ai_input` /
 * `$ai_output_choices`. Prompts and completions contain candidate PII (resume
 * text, recruiter notes, conversation content). We track cost, tokens, latency
 * and outcome — never content. See DATA-RETENTION.md.
 *
 * Fire-and-forget: tracking must never break or slow the primary operation.
 */
import { randomUUID } from 'node:crypto'
import { useServerPostHog } from '../posthog'
import { microsToUsd } from './pricing'

export interface AiGenerationEvent {
  /** Org the generation belongs to — attached as a PostHog group. */
  orgId: string
  /** User who triggered it, if any. Background runs (auto-scoring) omit this. */
  userId?: string | null
  provider: string
  model: string
  billingMode: 'platform' | 'byok'
  promptTokens: number
  completionTokens: number
  /** Reasoning/thinking tokens, when the model reports them (extended thinking). */
  reasoningTokens?: number | null
  /** Prompt-cache read tokens, when the model reports them. */
  cacheReadTokens?: number | null
  /** Frozen cost in integer micro-dollars, or null when the model is unpriced. */
  costUsdMicros: number | null
  latencyMs: number
  status: 'completed' | 'failed'
  /**
   * Logical feature emitting the generation. Becomes both `$ai_span_name` (so
   * it reads well in PostHog's trace view) and a `feature` dimension for
   * slicing. e.g. 'application_analysis', 'chatbot_message'.
   */
  feature: string
  /**
   * Groups related generations under one trace in PostHog. Pass a stable id
   * (the DB run id, or a conversation id) when you have one; otherwise a fresh
   * UUID is generated so every event is still a valid singleton trace. PostHog
   * requires this field, so it is never left empty.
   */
  traceId?: string | null
  /** Optional product dimensions for slicing cost/usage. */
  applicationId?: string | null
  conversationId?: string | null
}

export function captureAiGeneration(e: AiGenerationEvent): void {
  try {
    const ph = useServerPostHog()
    if (!ph) return

    ph.capture({
      distinctId: e.userId || 'system',
      event: '$ai_generation',
      groups: { organization: e.orgId },
      properties: {
        $ai_provider: e.provider,
        $ai_model: e.model,
        $ai_input_tokens: e.promptTokens,
        $ai_output_tokens: e.completionTokens,
        ...(e.reasoningTokens != null ? { $ai_reasoning_tokens: e.reasoningTokens } : {}),
        ...(e.cacheReadTokens != null ? { $ai_cache_read_input_tokens: e.cacheReadTokens } : {}),
        $ai_latency: e.latencyMs / 1000,
        $ai_total_cost_usd: e.costUsdMicros != null ? microsToUsd(e.costUsdMicros) : undefined,
        $ai_is_error: e.status === 'failed',
        // We only know the transport succeeded on a completed run; on failure we
        // don't have a reliable upstream status, so we let $ai_is_error carry it.
        ...(e.status === 'completed' ? { $ai_http_status: 200 } : {}),
        $ai_trace_id: e.traceId || randomUUID(),
        $ai_span_name: e.feature,
        // Reqcore-specific dimensions for product/cost analysis.
        billing_mode: e.billingMode,
        feature: e.feature,
        ...(e.applicationId ? { application_id: e.applicationId } : {}),
        ...(e.conversationId ? { conversation_id: e.conversationId } : {}),
      },
    })
  }
  catch {
    // Observability must never break the primary operation.
  }
}
