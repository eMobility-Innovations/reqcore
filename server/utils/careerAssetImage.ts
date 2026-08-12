import sharp from 'sharp'

export const CAREER_BANNER_OUTPUT_MAX_BYTES = 2 * 1024 * 1024

const BANNER_OUTPUT_STRATEGIES = [
  { width: 2400, height: 1350, quality: 82 },
  { width: 2400, height: 1350, quality: 72 },
  { width: 1920, height: 1080, quality: 70 },
  { width: 1600, height: 900, quality: 64 },
  { width: 1280, height: 720, quality: 56 },
] as const

/** Normalize a banner for fast public delivery while preserving its aspect ratio. */
export async function optimizeCareerBanner(input: Buffer): Promise<Buffer> {
  let output: Buffer | undefined

  for (const strategy of BANNER_OUTPUT_STRATEGIES) {
    output = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({
        width: strategy.width,
        height: strategy.height,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: strategy.quality, effort: 4, smartSubsample: true })
      .toBuffer()

    if (output.length <= CAREER_BANNER_OUTPUT_MAX_BYTES) return output
  }

  if (!output || output.length > CAREER_BANNER_OUTPUT_MAX_BYTES) {
    throw new Error('Unable to optimize career banner below the delivery size limit')
  }

  return output
}
