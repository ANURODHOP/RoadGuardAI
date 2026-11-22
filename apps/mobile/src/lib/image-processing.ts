import { decode as jpegDecode } from 'jpeg-js'

/**
 * Decode a base64-encoded JPEG string into an RGBA Uint8Array using jpeg-js.
 *
 * This is a pure-JavaScript JPEG decoder that correctly decompresses DCT +
 * Huffman-coded image data into actual pixel values, unlike the previous
 * implementation which incorrectly treated compressed JPEG entropy bytes
 * as raw pixel data.
 *
 * @param base64 - Base64 encoded JPEG image data
 * @returns {{ data: Uint8Array; width: number; height: number }} RGBA pixel buffer
 */
export function decodeBase64JpegToRgba(base64: string): {
  data: Uint8Array
  width: number
  height: number
} {
  if (!base64 || typeof base64 !== 'string') {
    throw new Error('decodeBase64JpegToRgba: base64 string must be non-empty')
  }

  // Convert base64 string to raw bytes
  const binaryString = atob(base64)
  const jpegBytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    jpegBytes[i] = binaryString.charCodeAt(i)
  }

  // Decode JPEG → RGBA pixel buffer using jpeg-js
  const decoded = jpegDecode(jpegBytes, { useTArray: true, formatAsRGBA: true })

  return {
    data: decoded.data as Uint8Array,
    width: decoded.width,
    height: decoded.height,
  }
}

/**
 * Metadata describing the letterbox transform applied to an image.
 *
 * Required to map model output bounding boxes back to original image coordinates.
 *
 * The model receives a padded square canvas. To map a box (x1, y1, x2, y2)
 * in normalized model-output space back to the original image:
 *
 *   // 1. Convert from normalized [0,1] to pixel coords in the 320×320 canvas
 *   const px1 = x1 * modelSize
 *   const py1 = y1 * modelSize
 *   const px2 = x2 * modelSize
 *   const py2 = y2 * modelSize
 *
 *   // 2. Remove padding offset
 *   const ox1 = px1 - padLeft
 *   const oy1 = py1 - padTop
 *   const ox2 = px2 - padLeft
 *   const oy2 = py2 - padTop
 *
 *   // 3. Scale back to original image dimensions
 *   const origX1 = ox1 / scale
 *   const origY1 = oy1 / scale
 *   const origX2 = ox2 / scale
 *   const origY2 = oy2 / scale
 *
 * NOTE: The current production inference pipeline uses STRETCH resize (not letterbox).
 * This matches the training scripts (cv2.resize to 320×320 without padding).
 * Letterbox is provided here as a utility for future use if training is updated.
 */
export interface LetterboxMeta {
  /** Scale factor applied to both dimensions: scaledDim / originalDim */
  scale: number
  /** Left padding in pixels (in the 320×320 canvas) */
  padLeft: number
  /** Top padding in pixels (in the 320×320 canvas) */
  padTop: number
  /** Width of original image before letterboxing */
  originalWidth: number
  /** Height of original image before letterboxing */
  originalHeight: number
  /** Target canvas size (320 for RoadGuardAI) */
  modelSize: number
}

/**
 * Apply letterbox padding to an RGBA pixel buffer, producing a square
 * modelSize×modelSize canvas with grey (114, 114, 114, 255) padding.
 *
 * This preserves the original aspect ratio and avoids distortion of non-square
 * camera captures. The model receives a padded square image.
 *
 * IMPORTANT: If this function is used for inference, the training pipeline
 * MUST also apply the same letterbox preprocessing (Ultralytics default letterbox).
 * Currently, both training scripts and mobile use STRETCH resize. This function
 * is exported for future alignment if the training pipeline is updated.
 *
 * @param rgbaData     - Decoded RGBA pixels from decodeBase64JpegToRgba
 * @param srcWidth     - Source image width
 * @param srcHeight    - Source image height
 * @param modelSize    - Target square size (default 320)
 * @returns {{ canvas: Uint8Array, meta: LetterboxMeta }}
 */
export function letterboxRgba(
  rgbaData: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  modelSize: number = 320,
): { canvas: Uint8Array; meta: LetterboxMeta } {
  const scale = Math.min(modelSize / srcWidth, modelSize / srcHeight)
  const scaledW = Math.round(srcWidth * scale)
  const scaledH = Math.round(srcHeight * scale)

  // Integer pixel padding — distribute evenly, any remainder goes to right/bottom
  const padLeft = Math.floor((modelSize - scaledW) / 2)
  const padTop  = Math.floor((modelSize - scaledH) / 2)

  // Allocate output canvas filled with grey (114, 114, 114, 255) — Ultralytics default
  const canvas = new Uint8Array(modelSize * modelSize * 4)
  for (let i = 0; i < modelSize * modelSize; i++) {
    canvas[i * 4]     = 114
    canvas[i * 4 + 1] = 114
    canvas[i * 4 + 2] = 114
    canvas[i * 4 + 3] = 255
  }

  // Nearest-neighbor scale of source pixels into scaled area
  for (let y = 0; y < scaledH; y++) {
    const srcY = Math.min(Math.floor(y / scale), srcHeight - 1)
    for (let x = 0; x < scaledW; x++) {
      const srcX = Math.min(Math.floor(x / scale), srcWidth - 1)
      const srcOffset  = (srcY * srcWidth + srcX) * 4
      const destOffset = ((padTop + y) * modelSize + (padLeft + x)) * 4
      canvas[destOffset]     = rgbaData[srcOffset]
      canvas[destOffset + 1] = rgbaData[srcOffset + 1]
      canvas[destOffset + 2] = rgbaData[srcOffset + 2]
      canvas[destOffset + 3] = 255
    }
  }

  const meta: LetterboxMeta = {
    scale,
    padLeft,
    padTop,
    originalWidth: srcWidth,
    originalHeight: srcHeight,
    modelSize,
  }

  return { canvas, meta }
}

/**
 * Convert an RGBA Uint8Array to a planar NCHW Float32Array normalised to [0, 1].
 *
 * Channel order: RGB (R plane first, then G, then B). Alpha is discarded.
 * Layout: [1, 3, H, W] — NCHW, matching the YOLOv8 ONNX model input requirement.
 * Normalization: each channel byte [0, 255] is divided by 255.0 → [0.0, 1.0].
 *
 * This matches the Python training/inference preprocessing:
 *   img_float = img_rgb.astype(np.float32) / 255.0  → HWC
 *   img_chw   = np.transpose(img_float, (2, 0, 1))  → CHW (R, G, B planes)
 *   tensor    = np.expand_dims(img_chw, axis=0)      → BCHW [1, 3, H, W]
 *
 * @param rgbaData - Interleaved RGBA pixel data (4 bytes per pixel)
 * @param width    - Image width in pixels
 * @param height   - Image height in pixels
 * @returns Float32Array in NCHW layout [1, 3, height, width]
 */
export function rgbaToNchwFloat32(
  rgbaData: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const pixelCount = width * height
  const expectedLength = pixelCount * 4
  if (rgbaData.length < expectedLength) {
    throw new Error(
      `RGBA buffer too small: got ${rgbaData.length} bytes, expected ${expectedLength} for ${width}×${height}`,
    )
  }

  const float32 = new Float32Array(3 * pixelCount)

  for (let i = 0; i < pixelCount; i++) {
    const rgbaOffset = i * 4
    float32[i]                  = rgbaData[rgbaOffset]     / 255.0  // R plane
    float32[pixelCount + i]     = rgbaData[rgbaOffset + 1] / 255.0  // G plane
    float32[2 * pixelCount + i] = rgbaData[rgbaOffset + 2] / 255.0  // B plane
    // Alpha (rgbaOffset + 3) is discarded
  }

  return float32
}
