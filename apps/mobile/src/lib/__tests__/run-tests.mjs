import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import jpeg from 'jpeg-js'
import { decodeBase64JpegToRgba, rgbaToNchwFloat32 } from '../image-processing.ts'

// ── Helpers ───────────────────────────────────────────────────────────────────

function createSolidRgbaImage(width, height, r, g, b, a = 255) {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  }
  return data
}

function encodeToBase64Jpeg(rgbaData, width, height, quality = 100) {
  const rawImageData = {
    data: Buffer.from(rgbaData),
    width,
    height,
  }
  const jpegBuffer = jpeg.encode(rawImageData, quality)
  return Buffer.from(jpegBuffer.data).toString('base64')
}

function createGradientRgbaImage(width, height) {
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

describe('JPEG Decoding — decodeBase64JpegToRgba', () => {
  test('decodes a solid red 2x2 JPEG and returns correct RGBA pixels', () => {
    const width = 2
    const height = 2
    const sourceRgba = createSolidRgbaImage(width, height, 255, 0, 0)
    const base64 = encodeToBase64Jpeg(sourceRgba, width, height, 100)

    const result = decodeBase64JpegToRgba(base64)

    assert.equal(result.width, width, 'Width should match')
    assert.equal(result.height, height, 'Height should match')
    assert.equal(result.data.length, width * height * 4, 'Byte length should match RGBA')

    for (let i = 0; i < width * height; i++) {
      assert.ok(result.data[i * 4] >= 245, `Red channel should be >= 245, got ${result.data[i * 4]}`)
      assert.ok(result.data[i * 4 + 1] <= 10, `Green channel should be <= 10, got ${result.data[i * 4 + 1]}`)
      assert.ok(result.data[i * 4 + 2] <= 10, `Blue channel should be <= 10, got ${result.data[i * 4 + 2]}`)
      assert.equal(result.data[i * 4 + 3], 255, 'Alpha should be 255')
    }
  })

  test('decodes a solid green 4x4 JPEG and returns correct RGBA pixels', () => {
    const width = 4
    const height = 4
    const sourceRgba = createSolidRgbaImage(width, height, 0, 255, 0)
    const base64 = encodeToBase64Jpeg(sourceRgba, width, height, 100)

    const result = decodeBase64JpegToRgba(base64)

    assert.equal(result.width, width)
    assert.equal(result.height, height)

    for (let i = 0; i < width * height; i++) {
      assert.ok(result.data[i * 4] <= 10, 'Red channel should be near 0')
      assert.ok(result.data[i * 4 + 1] >= 245, 'Green channel should be near 255')
      assert.ok(result.data[i * 4 + 2] <= 10, 'Blue channel should be near 0')
    }
  })

  test('decodes a 320x320 JPEG to exact dimensions [320, 320]', () => {
    const width = 320
    const height = 320
    const sourceRgba = createSolidRgbaImage(width, height, 128, 128, 128)
    const base64 = encodeToBase64Jpeg(sourceRgba, width, height, 90)

    const result = decodeBase64JpegToRgba(base64)

    assert.equal(result.width, 320)
    assert.equal(result.height, 320)
    assert.equal(result.data.length, 320 * 320 * 4)
  })

  test('preserves spatial color gradient across the image', () => {
    const width = 16
    const height = 16
    const sourceRgba = createGradientRgbaImage(width, height)
    const base64 = encodeToBase64Jpeg(sourceRgba, width, height, 100)

    const result = decodeBase64JpegToRgba(base64)

    // Top-left pixel: R ≈ 0, G ≈ 0, B ≈ 128
    assert.ok(result.data[0] <= 20, `Top-left R should be <= 20, got ${result.data[0]}`)
    assert.ok(result.data[1] <= 20, `Top-left G should be <= 20, got ${result.data[1]}`)
    assert.ok(result.data[2] >= 100, `Top-left B should be >= 100, got ${result.data[2]}`)

    // Bottom-right pixel: R ≈ 255, G ≈ 255, B ≈ 128
    const last = (width * height - 1) * 4
    assert.ok(result.data[last] >= 230, `Bottom-right R should be >= 230, got ${result.data[last]}`)
    assert.ok(result.data[last + 1] >= 230, `Bottom-right G should be >= 230, got ${result.data[last + 1]}`)
    assert.ok(result.data[last + 2] >= 100, `Bottom-right B should be >= 100, got ${result.data[last + 2]}`)
  })

  test('throws meaningful error on empty or invalid base64 input', () => {
    assert.throws(() => decodeBase64JpegToRgba(''), /non-empty/)
    assert.throws(() => decodeBase64JpegToRgba('corrupt-not-valid-base64-jpeg'))
  })
})

describe('NCHW Tensor Conversion — rgbaToNchwFloat32', () => {
  test('converts 2x2 solid red RGBA to planar NCHW [1, 3, 2, 2]', () => {
    const width = 2
    const height = 2
    const rgba = createSolidRgbaImage(width, height, 255, 0, 0)

    const result = rgbaToNchwFloat32(rgba, width, height)
    const pixelCount = width * height

    assert.equal(result.length, 3 * pixelCount)

    // R plane: [0..3] all ≈ 1.0
    for (let i = 0; i < pixelCount; i++) {
      assert.ok(Math.abs(result[i] - 1.0) < 0.01, `R channel plane at ${i} should be 1.0, got ${result[i]}`)
    }
    // G plane: [4..7] all ≈ 0.0
    for (let i = 0; i < pixelCount; i++) {
      assert.ok(Math.abs(result[pixelCount + i] - 0.0) < 0.01, `G channel plane at ${i} should be 0.0`)
    }
    // B plane: [8..11] all ≈ 0.0
    for (let i = 0; i < pixelCount; i++) {
      assert.ok(Math.abs(result[2 * pixelCount + i] - 0.0) < 0.01, `B channel plane at ${i} should be 0.0`)
    }
  })

  test('correctly normalizes multi-color pixel to [0.0, 1.0]', () => {
    // 1x1 image: R=100, G=150, B=200, A=255
    const rgba = new Uint8Array([100, 150, 200, 255])
    const result = rgbaToNchwFloat32(rgba, 1, 1)

    assert.equal(result.length, 3)
    assert.ok(Math.abs(result[0] - 100 / 255.0) < 1e-5, 'Normalized R matches')
    assert.ok(Math.abs(result[1] - 150 / 255.0) < 1e-5, 'Normalized G matches')
    assert.ok(Math.abs(result[2] - 200 / 255.0) < 1e-5, 'Normalized B matches')
  })

  test('discards alpha channel completely', () => {
    const rgba = new Uint8Array([50, 100, 150, 0]) // Alpha is 0
    const result = rgbaToNchwFloat32(rgba, 1, 1)
    assert.equal(result.length, 3, 'Length must be exactly 3 floats, no alpha')
  })

  test('verifies planar channel layout offsets for 320x320', () => {
    const width = 320
    const height = 320
    const pixelCount = width * height
    const rgba = new Uint8Array(pixelCount * 4)

    // Set pixel (0,0) to R=255, G=0, B=0
    rgba[0] = 255
    rgba[1] = 0
    rgba[2] = 0
    rgba[3] = 255

    // Set pixel (319,319) to R=0, G=255, B=0
    const lastIdx = (pixelCount - 1) * 4
    rgba[lastIdx] = 0
    rgba[lastIdx + 1] = 255
    rgba[lastIdx + 2] = 0
    rgba[lastIdx + 3] = 255

    const float32 = rgbaToNchwFloat32(rgba, width, height)

    assert.equal(float32.length, 3 * pixelCount, 'Total floats must be 307200')
    // Pixel (0,0): R at index 0 is 1.0, G at index pixelCount is 0, B at 2*pixelCount is 0
    assert.equal(float32[0], 1.0)
    assert.equal(float32[pixelCount], 0.0)
    assert.equal(float32[2 * pixelCount], 0.0)

    // Pixel (319,319): R at index pixelCount - 1 is 0, G at 2*pixelCount - 1 is 1.0, B at 3*pixelCount - 1 is 0
    assert.equal(float32[pixelCount - 1], 0.0)
    assert.equal(float32[2 * pixelCount - 1], 1.0)
    assert.equal(float32[3 * pixelCount - 1], 0.0)
  })

  test('throws error when RGBA buffer is undersized', () => {
    const undersized = new Uint8Array([255, 0, 0])
    assert.throws(() => rgbaToNchwFloat32(undersized, 1, 1), /RGBA buffer too small/)
  })
})

describe('End-to-End Decoding and Tensor Pipeline Verification', () => {
  test('proves decoded data contains REAL pixel values, not JPEG bitstream entropy bytes', () => {
    // CRITICAL TEST:
    // In Stage 0, the buggy decodeBase64JpegToRgb took bytes directly after 0xFFDA.
    // Those were compressed DCT/Huffman bitstream bytes, causing random garbage in the tensor.
    // Here, we create a solid blue image (R=0, G=0, B=255).
    // The decoded output must reflect R≈0, G≈0, B≈1.0 throughout the entire image,
    // which is mathematically impossible from raw entropy bytes.
    const width = 8
    const height = 8
    const pixelCount = width * height
    const sourceRgba = createSolidRgbaImage(width, height, 0, 0, 255)
    const base64 = encodeToBase64Jpeg(sourceRgba, width, height, 100)

    const decoded = decodeBase64JpegToRgba(base64)
    const tensor = rgbaToNchwFloat32(decoded.data, decoded.width, decoded.height)

    assert.equal(tensor.length, 3 * pixelCount)

    for (let i = 0; i < pixelCount; i++) {
      assert.ok(tensor[i] < 0.05, `R plane should be near 0, got ${tensor[i]}`)
      assert.ok(tensor[pixelCount + i] < 0.05, `G plane should be near 0, got ${tensor[pixelCount + i]}`)
      assert.ok(tensor[2 * pixelCount + i] > 0.95, `B plane should be near 1.0, got ${tensor[2 * pixelCount + i]}`)
    }
  })

  test('round-trip 320x320 tensor output is fully normalized in [0.0, 1.0]', () => {
    const width = 320
    const height = 320
    const sourceRgba = createGradientRgbaImage(width, height)
    const base64 = encodeToBase64Jpeg(sourceRgba, width, height, 92)

    const decoded = decodeBase64JpegToRgba(base64)
    const tensor = rgbaToNchwFloat32(decoded.data, decoded.width, decoded.height)

    assert.equal(tensor.length, 3 * 320 * 320)
    for (let i = 0; i < tensor.length; i++) {
      assert.ok(tensor[i] >= 0.0 && tensor[i] <= 1.0, `Tensor value out of bounds: ${tensor[i]} at index ${i}`)
    }
  })
})
