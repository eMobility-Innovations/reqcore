import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { aiConfig, platformAiConfig } from '../../database/schema'
import { updateAiConfigSchema } from '../../utils/schemas/scoring'
import { encrypt } from '../../utils/encryption'
import {
  canUsePlatformAi,
  getPlatformAiOverride,
  PLATFORM_AI_CONFIG_ID,
  PLATFORM_AI_PROVIDER,
  toPlatformAiConfigListRow,
} from '../../utils/ai/platformConfig'

const paramsSchema = z.object({ id: z.string().min(1) })

/**
 * PATCH /api/ai-config/:id
 *
 * Update an AI configuration. Re-encrypts the API key only when supplied,
 * so users can edit name / model / pricing without re-entering credentials.
 *
 * The platform ("company") config is the exception: it is server-managed and
 * cannot be edited — the only accepted field is `isEnabled`, which toggles it
 * on or off for this workspace.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, updateAiConfigSchema.parse)

  if (id === PLATFORM_AI_CONFIG_ID) {
    if (!await canUsePlatformAi(orgId)) {
      throw createError({ statusCode: 404, statusMessage: 'AI configuration not found.' })
    }
    if (body.isEnabled === undefined) {
      throw createError({
        statusCode: 422,
        statusMessage: 'The platform AI is managed by Reqcore — you can only enable or disable it.',
      })
    }
    const enabled = body.isEnabled
    const existingOverride = await getPlatformAiOverride(orgId)
    const wasDefaultAnalysis = existingOverride?.isDefaultAnalysis ?? false
    const byokAnalysisDefaultCount = await db.$count(
      aiConfig,
      and(eq(aiConfig.organizationId, orgId), eq(aiConfig.isDefaultAnalysis, true)),
    )
    // When enabling, claim the analysis slot if nothing else holds it — so the
    // org always has a working, visibly-marked analysis engine.
    const isDefaultAnalysis = enabled && (wasDefaultAnalysis || byokAnalysisDefaultCount === 0)

    await db.transaction(async (tx) => {
      await tx.insert(platformAiConfig)
        .values({
          organizationId: orgId,
          provider: PLATFORM_AI_PROVIDER,
          isDefaultAnalysis,
          isEnabled: enabled,
        })
        .onConflictDoUpdate({
          target: platformAiConfig.organizationId,
          set: {
            isEnabled: enabled,
            isDefaultAnalysis,
            updatedAt: new Date(),
          },
        })

      // If we just disabled the analysis default, promote the newest BYOK
      // config so the org doesn't silently lose candidate analysis.
      if (!enabled && wasDefaultAnalysis) {
        const successor = await tx.query.aiConfig.findFirst({
          where: eq(aiConfig.organizationId, orgId),
          orderBy: (t, { desc }) => [desc(t.createdAt)],
          columns: { id: true },
        })
        if (successor) {
          await tx.update(aiConfig)
            .set({ isDefaultAnalysis: true, updatedAt: new Date() })
            .where(eq(aiConfig.id, successor.id))
        }
      }
    })

    recordActivity({
      organizationId: orgId,
      actorId: session.user.id,
      action: 'updated',
      resourceType: 'aiConfig',
      resourceId: id,
      metadata: { source: 'platform', isEnabled: enabled },
    })

    const anyByokAnalysisDefault = await db.$count(
      aiConfig,
      and(eq(aiConfig.organizationId, orgId), eq(aiConfig.isDefaultAnalysis, true)),
    )
    const updated = await getPlatformAiOverride(orgId)
    return {
      config: toPlatformAiConfigListRow(updated, {
        isDefaultAnalysisFallback: anyByokAnalysisDefault === 0,
      }),
    }
  }

  const existing = await db.query.aiConfig.findFirst({
    where: and(eq(aiConfig.id, id), eq(aiConfig.organizationId, orgId)),
    columns: { id: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'AI configuration not found.' })

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name !== undefined) updates.name = body.name
  if (body.provider !== undefined) updates.provider = body.provider
  if (body.model !== undefined) updates.model = body.model
  if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl ?? null
  if (body.maxTokens !== undefined) updates.maxTokens = body.maxTokens
  if (body.inputPricePer1m !== undefined) updates.inputPricePer1m = body.inputPricePer1m != null ? String(body.inputPricePer1m) : null
  if (body.outputPricePer1m !== undefined) updates.outputPricePer1m = body.outputPricePer1m != null ? String(body.outputPricePer1m) : null
  if (body.apiKey) updates.apiKeyEncrypted = encrypt(body.apiKey, env.BETTER_AUTH_SECRET)

  const [updated] = await db.update(aiConfig)
    .set(updates)
    .where(and(eq(aiConfig.id, id), eq(aiConfig.organizationId, orgId)))
    .returning({
      id: aiConfig.id,
      name: aiConfig.name,
      provider: aiConfig.provider,
      model: aiConfig.model,
      baseUrl: aiConfig.baseUrl,
      maxTokens: aiConfig.maxTokens,
      inputPricePer1m: aiConfig.inputPricePer1m,
      outputPricePer1m: aiConfig.outputPricePer1m,
      isDefaultChatbot: aiConfig.isDefaultChatbot,
      isDefaultAnalysis: aiConfig.isDefaultAnalysis,
      apiKeyEncrypted: aiConfig.apiKeyEncrypted,
    })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'aiConfig',
    resourceId: id,
  })

  const { apiKeyEncrypted, ...rest } = updated!
  return {
    config: {
      ...rest,
      inputPricePer1m: rest.inputPricePer1m != null ? Number(rest.inputPricePer1m) : null,
      outputPricePer1m: rest.outputPricePer1m != null ? Number(rest.outputPricePer1m) : null,
      hasApiKey: Boolean(apiKeyEncrypted),
    },
  }
})
