/**
 * Helpers for the per-job "analysis context" setting — which candidate data
 * optional sources the AI scoring engine is allowed to read. A resume is used
 * when available but is not required when another enabled source has evidence.
 */
import { eq, and, asc } from 'drizzle-orm'
import { jobQuestion, questionResponse } from '../../database/schema'

export interface AnalysisContext {
  coverLetter: boolean
  screeningAnswers: boolean
  recruiterNotes: boolean
}

/**
 * Fallback used for legacy rows written before the column existed. Mirrors the
 * column default in the schema. The resume is included automatically when present.
 */
export const DEFAULT_ANALYSIS_CONTEXT: AnalysisContext = {
  coverLetter: true,
  screeningAnswers: true,
  recruiterNotes: false,
}

/** Render a stored question-response value into a human-readable answer string. */
function formatAnswer(value: string | string[] | number | boolean): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

/**
 * Fetch the applicant's answers to the job's custom screening questions,
 * ordered as they appear on the form. Returns an empty array when there are none.
 */
export async function fetchScreeningAnswers(
  applicationId: string,
  orgId: string,
): Promise<{ question: string, answer: string }[]> {
  const rows = await db.select({
    label: jobQuestion.label,
    value: questionResponse.value,
    displayOrder: jobQuestion.displayOrder,
  })
    .from(questionResponse)
    .innerJoin(jobQuestion, eq(questionResponse.questionId, jobQuestion.id))
    .where(and(
      eq(questionResponse.applicationId, applicationId),
      eq(questionResponse.organizationId, orgId),
    ))
    .orderBy(asc(jobQuestion.displayOrder))

  return rows
    .map(r => ({ question: r.label, answer: formatAnswer(r.value).trim() }))
    .filter(r => r.answer.length > 0)
}
