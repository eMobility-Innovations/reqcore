import { formatPropertyValueAsText, type PropertyConfig, type PropertyType } from './properties'

/**
 * Onboarding field mapping + hire-time requirements, shared by the server (the
 * applications PATCH guard + the Nexus hire packet in `server/utils/nexusHire.ts`)
 * and the client (the "Mark Hired" button gating in `ApplicationDetailDrawer.vue`),
 * so the required-field policy lives in exactly one place.
 */

/** Minimal shape common to server `PropertyEntry` and client property entries. */
export interface OnboardingPropertyInput {
  definition: { name: string; type: PropertyType; config?: PropertyConfig | null }
  value: unknown
}

/**
 * Map a normalized custom-property name → its onboarding packet key. reqcore has
 * no native start-date/contract/company/country fields; recruiters add them as
 * application-scoped `propertyDefinition`s. Names are normalized (lowercased,
 * non-alphanumerics stripped) so minor label differences still match.
 */
const ONBOARDING_PROP_MAP: Record<string, string> = {
  startdate: 'start_date',
  contracttype: 'contract_type',
  company: 'company',
  country: 'country',
  workemaildomain: 'work_email_domain',
  position: 'position',
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Build the `onboarding` map from an application's custom property entries.
 * Select values resolve to their human-readable label (not the option id) via
 * `formatPropertyValueAsText`. Unmapped or empty properties are skipped.
 */
export function buildOnboardingFromProperties(
  entries: readonly OnboardingPropertyInput[],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { definition, value } of entries) {
    const key = ONBOARDING_PROP_MAP[normalizeName(definition.name)]
    if (!key) continue
    const text = formatPropertyValueAsText(
      definition.type,
      value,
      (definition.config ?? null) as PropertyConfig,
    )
    if (text) out[key] = text
  }
  return out
}

/**
 * Onboarding fields HR must fill before a candidate can be marked hired.
 * `key` matches the packet field; `label` is the human-readable property name.
 */
export const REQUIRED_ONBOARDING: { key: string; label: string }[] = [
  { key: 'start_date', label: 'Start date' },
  { key: 'contract_type', label: 'Contract type' },
  { key: 'company', label: 'Company' },
  { key: 'country', label: 'Country' },
  { key: 'work_email_domain', label: 'Work email domain' },
]

/**
 * Return the labels of any required onboarding fields absent/empty on the
 * application, in display order. Empty ⇒ all present (hire may proceed).
 */
export function missingRequiredOnboarding(entries: readonly OnboardingPropertyInput[]): string[] {
  const onboarding = buildOnboardingFromProperties(entries)
  return REQUIRED_ONBOARDING.filter((f) => !onboarding[f.key]).map((f) => f.label)
}
