/**
 * Preprocessing Pipeline Unit Tests
 *
 * Tests the JPEG decoding and RGBA→NCHW tensor conversion functions
 * that form the core of the image preprocessing pipeline.
 *
 * These tests use jpeg-js to both ENCODE and DECODE test images,
 * verifying the round-trip produces correct pixel data and tensor layout.
 *
 * Test categories:
 *   ✅ Pure JS — runs in Node.js, CI, or any JavaScript runtime
 *   ⚠️  Device-only — requires React Native runtime (ONNX, expo-image-manipulator)
 *
 * To run (from apps/mobile):
 *   npx jest src/lib/__tests__/preprocessing.test.ts
 *   — or —
 *   node --experimental-vm-modules node_modules/.bin/jest src/lib/__tests__/preprocessing.test.ts
 */

import { encode as jpegEncode, decode as jpegDecode } from 'jpeg-js'
import { decodeBase64JpegToRgba, rgbaToNchwFloat32 } from '../image-processing'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Create a synthetic RGBA image buffer filled with a single color.
 */
function createSolidRgbaImage(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): Uint8Array {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  }
  return data
}

/**
 * Encode RGBA pixels to a JPEG and return the base64 string.
 * Uses jpeg-js encoder with high quality to minimise compression artefacts.
 */
function encodeToBase64Jpeg(
  rgbaData: Uint8Array,
  width: number,
  height: number,
  quality = 100,
): string {
  const rawImageData = {
    data: Buffer.from(rgbaData),
    width,
    height,
  }
  const jpegBuffer = jpegEncode(rawImageData, quality)
  return Buffer.from(jpegBuffer.data).toString('base64')
}

/**
 * Create a gradient RGBA image (R varies by x, G varies by y, B constant).
 */
function createGradientRgbaImage(
  width: number,
  height: number,
): Uint8Array {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = Math.round((x / (width - 1)) * 255)       // R: 0→255 left to right
      data[i + 1] = Math.round((y / (height - 1)) * 255)   // G: 0→255 top to bottom
      data[i + 2] = 128                                      // B: constant mid-value
      data[i + 3] = 255                                      // A: opaque
    }
  }
  return data
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('decodeBase64JpegToRgba', () => {
  test('decodes a solid red 2×2 JPEG and returns correct RGBA pixels', () => {
    const width = 2
    const height = 2
    const sourceRgba = createSolidRgbaImage(width, height, 255, 0, 0)
    const base64 = encodeToBase64Jpeg(sourceRgba, width, height, 100)

    const result = decodeBase64JpegToRgba(base64)

    expect(result.width).toBe(width)
    expect(result.height).toBe(height)
    expect(result.data.length).toBe(width * height * 4)

    // JPEG is lossy, so allow tolerance of ±5
    for (let i = 0; i < width * height; i++) {
      expect(result.data[i * 4]).toBeGreaterThan(245)      // R ≈ 255
      expect(result.data[i * 4 + 1]).toBeLessThan(10)      // G ≈ 0
      expect(result.data[i * 4 + 2]).toBeLessThan(10)      // B ≈ 0
      expect(result.data[i * 4 + 3]).toBe(255)             // A = 255
    }
  })

  test('decodes a solid green 4×4 JPEG and returns correct RGBA pixels', () => {
    const width = 4
    const height = 4
    const sourceRgba = createSolidRgbaImage(width, height, 0, 255, 0)
    const base64 = encodeToBase64Jpeg(sourceRgba, width, height, 100)

    const result = decodeBase64JpegToRgba(base64)

    expect(result.width).toBe(width)
    expect(result.height).toBe(height)

    for (let i = 0; i < width * height; i++) {
      expect(result.data[i * 4]).toBeLessThan(10)           // R ≈ 0
      expect(result.data[i * 4 + 1]).toBeGreaterThan(245)   // G ≈ 255
      expect(result.data[i * 4 + 2]).toBeLessThan(10)       // B ≈ 0
    }
  })

  test('decodes a 320×320 JPEG to correct dimensions', () => {
    const width = 320
    const height = 320
    const sourceRgba = createSolidRgbaImage(width, height, 128, 128, 128)
    const base64 = encodeToBase64Jpeg(sourceRgba, width, height, 90)

    const result = decodeBase64JpegToRgba(base64)

    expect(result.width).toBe(320)
    expect(result.height).toBe(320)
    expect(result.data.length).toBe(320 * 320 * 4)
  })

  test('preserves colour variation in a gradient image', () => {
    const width = 16
    const height = 16
    const sourceRgba = createGradientRgbaImage(width, height)
    const base64 = encodeToBase64Jpeg(sourceRgba, width, height, 100)

    const result = decodeBase64JpegToRgba(base64)

    // Top-left pixel should be close to R=0, G=0, B=128
    expect(result.data[0]).toBeLessThan(20)       // R ≈ 0
    expect(result.data[1]).toBeLessThan(20)       // G ≈ 0
    expect(result.data[2]).toBeGreaterThan(100)   // B ≈ 128

    // Bottom-right pixel should be close to R=255, G=255, B=128
    const lastPixel = (width * height - 1) * 4
    expect(result.data[lastPixel]).toBeGreaterThan(230)       // R ≈ 255
    expect(result.data[lastPixel + 1]).toBeGreaterThan(230)   // G ≈ 255
    expect(result.data[lastPixel + 2]).toBeGreaterThan(100)   // B ≈ 128
  })

  test('throws on invalid base64 / corrupt JPEG data', () => {
    // Invalid base64 that doesn't form a valid JPEG
    expect(() => decodeBase64JpegToRgba('not-a-valid-jpeg-base64')).toThrow()
  })

  test('throws on empty string', () => {
    expect(() => decodeBase64JpegToRgba('')).toThrow()
  })
})

describe('rgbaToNchwFloat32', () => {
  test('converts a 2×2 solid red RGBA buffer to correct NCHW layout', () => {
    const width = 2
    const height = 2
    const rgba = createSolidRgbaImage(width, height, 255, 0, 0)

    const result = rgbaToNchwFloat32(rgba, width, height)
    const pixelCount = width * height

    expect(result.length).toBe(3 * pixelCount)

    // R plane: all ≈ 1.0
    for (let i = 0; i < pixelCount; i++) {
      expect(result[i]).toBeCloseTo(1.0, 2)
    }
    // G plane: all ≈ 0.0
    for (let i = 0; i < pixelCount; i++) {
      expect(result[pixelCount + i]).toBeCloseTo(0.0, 2)
    }
    // B plane: all ≈ 0.0
    for (let i = 0; i < pixelCount; i++) {
      expect(result[2 * pixelCount + i]).toBeCloseTo(0.0, 2)
    }
  })

  test('correctly separates channels for a multi-colour pixel', () => {
    // 1×1 image with R=100, G=150, B=200, A=255
    const rgba = new Uint8Array([100, 150, 200, 255])

    const result = rgbaToNchwFloat32(rgba, 1, 1)

    expect(result.length).toBe(3)
    expect(result[0]).toBeCloseTo(100 / 255, 5)  // R
    expect(result[1]).toBeCloseTo(150 / 255, 5)  // G
    expect(result[2]).toBeCloseTo(200 / 255, 5)  // B
  })

  test('produces values in [0, 1] range for 320×320', () => {
    const width = 320
    const height = 320
    const rgba = createGradientRgbaImage(width, height)

    const result = rgbaToNchwFloat32(rgba, width, height)

    expect(result.length).toBe(3 * width * height)

    // Every value should be in [0, 1]
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(0.0)
      expect(result[i]).toBeLessThanOrEqual(1.0)
    }
  })

  test('discards alpha channel', () => {
    // 1×1 image with high alpha but different RGB
    const rgba = new Uint8Array([50, 100, 200, 128])

    const result = rgbaToNchwFloat32(rgba, 1, 1)

    expect(result.length).toBe(3)  // Only 3 channels, no alpha
    expect(result[0]).toBeCloseTo(50 / 255, 5)
    expect(result[1]).toBeCloseTo(100 / 255, 5)
    expect(result[2]).toBeCloseTo(200 / 255, 5)
  })

  test('NCHW layout: pixel (1,0) in a 2×1 image is at correct offset', () => {
    // 2×1 image: pixel 0 = R=255,G=0,B=0; pixel 1 = R=0,G=255,B=0
    const rgba = new Uint8Array([
      255, 0, 0, 255,   // pixel (0,0): red
      0, 255, 0, 255,   // pixel (1,0): green
    ])

    const result = rgbaToNchwFloat32(rgba, 2, 1)
    // pixelCount = 2
    // R plane: [result[0]=255/255, result[1]=0/255]
    // G plane: [result[2]=0/255,   result[3]=255/255]
    // B plane: [result[4]=0/255,   result[5]=0/255]

    expect(result[0]).toBeCloseTo(1.0, 5)   // R plane, pixel 0
    expect(result[1]).toBeCloseTo(0.0, 5)   // R plane, pixel 1
    expect(result[2]).toBeCloseTo(0.0, 5)   // G plane, pixel 0
    expect(result[3]).toBeCloseTo(1.0, 5)   // G plane, pixel 1
    expect(result[4]).toBeCloseTo(0.0, 5)   // B plane, pixel 0
    expect(result[5]).toBeCloseTo(0.0, 5)   // B plane, pixel 1
  })

  test('throws on undersized RGBA buffer', () => {
    const shortRgba = new Uint8Array([255, 0, 0])  // Only 3 bytes for a 1×1 image (needs 4)
    expect(() => rgbaToNchwFloat32(shortRgba, 1, 1)).toThrow(/RGBA buffer too small/)
  })
})

describe('Full decode → tensor round-trip', () => {
  test('encode → base64 → decode → NCHW produces correct tensor shape for 320×320', () => {
    const width = 320
    const height = 320
    const sourceRgba = createSolidRgbaImage(width, height, 128, 64, 192)
    const base64 = encodeToBase64Jpeg(sourceRgba, width, height, 95)

    const decoded = decodeBase64JpegToRgba(base64)
    expect(decoded.width).toBe(320)
    expect(decoded.height).toBe(320)

    const tensor = rgbaToNchwFloat32(decoded.data, decoded.width, decoded.height)
    expect(tensor.length).toBe(3 * 320 * 320)  // = 307,200

    // All values in [0, 1]
    for (let i = 0; i < tensor.length; i++) {
      expect(tensor[i]).toBeGreaterThanOrEqual(0.0)
      expect(tensor[i]).toBeLessThanOrEqual(1.0)
    }
  })

  test('decoded pixels are actual colour data, not compressed JPEG bytes', () => {
    // This is the KEY test: verifies we get real pixels, not entropy-coded noise.
    // A solid blue image must produce R≈0, G≈0, B≈255 — not random Huffman bytes.
    const width = 8
    const height = 8
    const sourceRgba = createSolidRgbaImage(width, height, 0, 0, 255)
    const base64 = encodeToBase64Jpeg(sourceRgba, width, height, 100)

    const decoded = decodeBase64JpegToRgba(base64)
    const tensor = rgbaToNchwFloat32(decoded.data, decoded.width, decoded.height)

    const pixelCount = width * height

    // R plane should be ≈ 0
    for (let i = 0; i < pixelCount; i++) {
      expect(tensor[i]).toBeLessThan(0.05)
    }
    // G plane should be ≈ 0
    for (let i = 0; i < pixelCount; i++) {
      expect(tensor[pixelCount + i]).toBeLessThan(0.05)
    }
    // B plane should be ≈ 1.0
    for (let i = 0; i < pixelCount; i++) {
      expect(tensor[2 * pixelCount + i]).toBeGreaterThan(0.95)
    }
  })
})
