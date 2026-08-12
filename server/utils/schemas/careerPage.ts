import { z } from 'zod'

// ─────────────────────────────────────────────
// Career page validation schemas
// ─────────────────────────────────────────────

/**
 * Hex accent color — optional, must be a 3- or 6-digit hex (with leading #).
 * NULL/empty falls back to the brand color on the public page.
 */
const accentColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex color like #4f46e5')
  .max(7)
  .nullish()
  .or(z.literal(''))

/**
 * Slugs that can't be used as a custom career-page URL because they collide with
 * app routes or other pieces of the /career and top-level namespaces.
 */
export const RESERVED_CAREER_SLUGS = new Set([
  'api', 'app', 'www', 'admin', 'dashboard', 'settings', 'auth', 'login',
  'signup', 'career', 'careers', 'jobs', 'job', 'public', 'assets', 'static',
])

/**
 * Custom public slug for /career/:slug. Lowercase letters, numbers and hyphens
 * only; 3–60 chars. NULL/empty falls back to the organization slug.
 */
export const careerPageSlug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Use at least 3 characters')
  .max(60, 'Keep it under 60 characters')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only')
  .refine((s) => !RESERVED_CAREER_SLUGS.has(s), 'This URL is reserved')

export const updateCareerPageSchema = z.object({
  enabled: z.boolean().optional(),
  slug: careerPageSlug.nullish().or(z.literal('')),
  accentColor,
  headline: z.string().max(140).nullish().or(z.literal('')),
  description: z.string().max(1000).nullish().or(z.literal('')),
  /** Vertical focal point of the hero banner, 0–100 (percent). 50 = centered. */
  bannerPosition: z.number().int().min(0).max(100).optional(),
})

export type UpdateCareerPageInput = z.infer<typeof updateCareerPageSchema>

// ─────────────────────────────────────────────
// Career page image assets (logo + hero banner)
// ─────────────────────────────────────────────

/** The two brandable image slots on a career page. */
export const CAREER_ASSET_KINDS = ['logo', 'banner'] as const
export type CareerAssetKind = (typeof CAREER_ASSET_KINDS)[number]

export const careerAssetKindSchema = z.enum(CAREER_ASSET_KINDS)

/**
 * Raster formats only. SVG is deliberately excluded — it can carry inline
 * scripts and we serve these bytes from our own origin.
 */
export const CAREER_ASSET_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type CareerAssetMime = (typeof CAREER_ASSET_MIME_TYPES)[number]

export const CAREER_ASSET_MIME_TO_EXTENSION: Record<CareerAssetMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/** Per-slot upload size caps — logos are small, banners are wide. */
export const CAREER_ASSET_MAX_BYTES: Record<CareerAssetKind, number> = {
  logo: 2 * 1024 * 1024, // 2 MB
  banner: 15 * 1024 * 1024, // 15 MB; banners are optimized before storage
}
