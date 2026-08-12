import { describe, expect, it } from 'vitest'
import { hasScorableCandidateMaterial } from '../../server/utils/ai/scoring'

describe('hasScorableCandidateMaterial', () => {
  it('accepts each supported evidence source without requiring a resume', () => {
    expect(hasScorableCandidateMaterial({ resumeText: 'Experience' })).toBe(true)
    expect(hasScorableCandidateMaterial({ coverLetterText: 'Why I am a fit' })).toBe(true)
    expect(hasScorableCandidateMaterial({ applicationNotes: 'Relevant portfolio reviewed' })).toBe(true)
    expect(hasScorableCandidateMaterial({
      screeningAnswers: [{ question: 'Experience?', answer: 'Five years' }],
    })).toBe(true)
  })

  it('rejects absent and whitespace-only material', () => {
    expect(hasScorableCandidateMaterial({})).toBe(false)
    expect(hasScorableCandidateMaterial({
      resumeText: ' ',
      coverLetterText: '\n',
      applicationNotes: '',
      screeningAnswers: [{ question: 'Experience?', answer: '  ' }],
    })).toBe(false)
  })
})
