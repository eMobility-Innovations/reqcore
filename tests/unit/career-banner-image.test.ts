import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  CAREER_BANNER_OUTPUT_MAX_BYTES,
  optimizeCareerBanner,
} from '../../server/utils/careerAssetImage'
import { CAREER_ASSET_MAX_BYTES } from '../../server/utils/schemas/careerPage'

describe('career banner image processing', () => {
  it('allows a 15 MB source upload and optimizes it for delivery', async () => {
    expect(CAREER_ASSET_MAX_BYTES.banner).toBe(15 * 1024 * 1024)

    const source = await sharp({
      create: {
        width: 4000,
        height: 2000,
        channels: 3,
        background: { r: 34, g: 112, b: 168 },
      },
    }).png().toBuffer()

    const output = await optimizeCareerBanner(source)
    const metadata = await sharp(output).metadata()

    expect(metadata.format).toBe('webp')
    expect(metadata.width).toBe(2400)
    expect(metadata.height).toBe(1200)
    expect(output.length).toBeLessThanOrEqual(CAREER_BANNER_OUTPUT_MAX_BYTES)
  })

  it('does not enlarge a smaller banner', async () => {
    const source = await sharp({
      create: {
        width: 1200,
        height: 600,
        channels: 3,
        background: { r: 232, g: 91, b: 61 },
      },
    }).jpeg().toBuffer()

    const output = await optimizeCareerBanner(source)
    const metadata = await sharp(output).metadata()

    expect(metadata.width).toBe(1200)
    expect(metadata.height).toBe(600)
  })
})
