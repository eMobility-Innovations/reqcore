export {
  SURVEY_PERSON_PROPS,
  SURVEY_QUESTIONS,
  type SurveyAnswers,
  type SurveyOption,
  type SurveyQuestion,
  type SurveyQuestionId,
} from '~~/shared/onboarding-survey'

import {
  SURVEY_PERSON_PROPS,
  SURVEY_QUESTIONS,
} from '~~/shared/onboarding-survey'

export function useOnboardingSurvey() {
  return { questions: SURVEY_QUESTIONS, personProps: SURVEY_PERSON_PROPS }
}
