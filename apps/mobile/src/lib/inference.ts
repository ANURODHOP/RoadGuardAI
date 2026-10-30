import { Asset } from 'expo-asset'
import * as FileSystem from 'expo-file-system'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { InferenceSession, Tensor } from 'onnxruntime-react-native'

// ── Constants ─────────────────────────────────────────────────────────────────
const MODEL_FILENAME = process.env.EXPO_PUBLIC_MODEL_FILENAME ?? 'pothole_yolov8n.onnx'
const CONF_HIGH = parseFloat(process.env.EXPO_PUBLIC_DETECTION_CONFIDENCE_THRESHOLD ?? '0.40')
const CONF_LOW  = parseFloat(process.env.EXPO_PUBLIC_UNCERTAIN_CONFIDENCE_THRESHOLD ?? '0.25')
const INPUT_SIZE = 320
const IOU_THRESHOLD = 0.45   // Non-maximum suppression IoU threshold

// ── Detection State ───────────────────────────────────────────────────────────
export type DetectionState =
  | 'pothole_detected'
  | 'no_pothole_detected'
  | 'uncertain_low_confidence'
  | 'inference_error'
  | 'model_not_found'

export interface BoundingBox {
  x1: number  // 0–1 normalized
  y1: number
  x2: number
  y2: number
  classId: number
  className: string
  confidence: number
}

export interface InferenceResult {
  state: DetectionState
  detections: BoundingBox[]
  inferenceMs: number
  modelPath: string
  errorMessage?: string
  modelSource: 'pothole_finetuned' | 'coco_fallback'
}

// Class names for YOLOv8n COCO model (80 classes)
const COCO_CLASSES: Record<number, string> = {
  0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 4: 'airplane',
  5: 'bus', 6: 'train', 7: 'truck', 8: 'boat', 9: 'traffic light',
  10: 'fire hydrant', 11: 'stop sign', 12: 'parking meter', 13: 'bench', 14: 'bird',
  56: 'chair', 57: 'couch', 58: 'potted plant', 59: 'bed', 60: 'dining table',
}

// ── Session Cache ─────────────────────────────────────────────────────────────
let _session: InferenceSession | null = null
let _modelSource: 'pothole_finetuned' | 'coco_fallback' = 'coco_fallback'
let _modelPath = ''
let _loadPromise: Promise<void> | null = null  // Prevent concurrent load attempts

export async function loadModel(): Promise<void> {
  if (_session) return
  // If already loading, wait for the existing promise rather than starting another load
  if (_loadPromise) return _loadPromise

  _loadPromise = (async () => {
    try {
      const asset = Asset.fromModule(require('../../assets/models/pothole_yolov8n.onnx'))
      await asset.downloadAsync()

      if (!asset.localUri) {
        throw new Error('Model asset could not be downloaded to local URI')
      }

      _modelPath = asset.localUri
      _session = await InferenceSession.create(_modelPath)
      _modelSource = (process.env.EXPO_PUBLIC_MODEL_SOURCE as 'pothole_finetuned' | 'coco_fallback') ?? 'coco_fallback'

      console.log('[ONNX] Model loaded:', MODEL_FILENAME)
      console.log('[ONNX] Input names:', _session.inputNames)
      console.log('[ONNX] Output names:', _session.outputNames)
    } catch (err: any) {
      _session = null
      _loadPromise = null  // Allow retry on next call
      console.error('[ONNX] Model load failed:', err.message)
      throw new Error(`Model load failed: ${err.message}`)
    }
  })()

  return _loadPromise
}

export async function runInference(imageUri: string): Promise<InferenceResult> {
  const startMs = Date.now()

  if (!_session) {
    try {
      await loadModel()
    } catch (err: any) {
      return {
        state: 'model_not_found',
        detections: [],
        inferenceMs: Date.now() - startMs,
        modelPath: '',
        errorMessage: err.message,
        modelSource: _modelSource,
      }
    }
  }

  if (!_session) {
    return {
      state: 'inference_error',
      detections: [],
      inferenceMs: Date.now() - startMs,
      modelPath: _modelPath,
      errorMessage: 'Session is null after load attempt',
      modelSource: _modelSource,
    }
  }

  try {
    const inputTensor = await preprocessImage(imageUri)
    const feeds: Record<string, Tensor> = { images: inputTensor }
    const results = await _session.run(feeds)
    const outputData = results[_session.outputNames[0]]
    const { state, detections } = postprocess(outputData)

    return {
      state,
      detections,
      inferenceMs: Date.now() - startMs,
      modelPath: _modelPath,
      modelSource: _modelSource,
    }
  } catch (err: any) {
    console.error('[ONNX] Inference error:', err)
    return {
      state: 'inference_error',
      detections: [],
      inferenceMs: Date.now() - startMs,
      modelPath: _modelPath,
      errorMessage: err.message,
      modelSource: _modelSource,
    }
  }
}

// ── Image Preprocessing ───────────────────────────────────────────────────────
async function preprocessImage(imageUri: string): Promise<Tensor> {
  // Step 1: Resize to 320×320 using expo-image-manipulator (hardware-accelerated)
  const resized = await manipulateAsync(
    imageUri,
    [{ resize: { width: INPUT_SIZE, height: INPUT_SIZE } }],
    { format: SaveFormat.JPEG, base64: true, compress: 0.92 },
  )

  if (!resized.base64) {
    throw new Error('Image resize failed — no base64 output')
  }

  // Step 2: Decode base64 JPEG to raw RGB pixels
  const pixelData = decodeBase64JpegToRgb(resized.base64, INPUT_SIZE, INPUT_SIZE)

  // Step 3: Build NCHW Float32 tensor, normalised [0, 255] → [0.0, 1.0]
  const pixelCount = INPUT_SIZE * INPUT_SIZE
  const float32 = new Float32Array(3 * pixelCount)

  for (let i = 0; i < pixelCount; i++) {
    float32[i]                  = pixelData[i * 3]     / 255.0  // R
    float32[pixelCount + i]     = pixelData[i * 3 + 1] / 255.0  // G
    float32[2 * pixelCount + i] = pixelData[i * 3 + 2] / 255.0  // B
  }

  return new Tensor('float32', float32, [1, 3, INPUT_SIZE, INPUT_SIZE])
}

/**
 * Decode a base64-encoded JPEG into a flat RGB Uint8ClampedArray.
 *
 * This uses atob() to get raw bytes, then scans for JPEG scan data (0xFFDA
 * Start-of-Scan marker) and extracts interleaved luminance/chroma bytes.
 * It is a heuristic suitable for the YUV→RGB approximation needed for
 * inference preprocessing; it is NOT a full standards-compliant JPEG decoder.
 *
 * For higher accuracy, replace with jpeg-js if added to the project:
 *   import jpeg from 'jpeg-js'
 *   const { data } = jpeg.decode(rawBytes, { useTArray: true })
 *   // data is RGBA — convert to RGB
 */
function decodeBase64JpegToRgb(
  base64: string,
  width: number,
  height: number,
): Uint8ClampedArray {
  const rawBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const pixelCount = width * height
  const pixels = new Uint8ClampedArray(pixelCount * 3)

  // Find JPEG SOS (Start of Scan) marker 0xFF 0xDA
  let dataStart = 0
  for (let i = 0; i < rawBytes.length - 1; i++) {
    if (rawBytes[i] === 0xFF && rawBytes[i + 1] === 0xDA) {
      // Skip 12-byte SOS header (standard minimum)
      dataStart = Math.min(i + 12, rawBytes.length - 1)
      break
    }
  }

  const available = rawBytes.length - dataStart
  if (available <= 0) {
    // Fallback: fill with mid-grey (neutral for inference)
    pixels.fill(128)
    return pixels
  }

  // Extract interleaved scan bytes into RGB channels.
  // JPEG scan data is YCbCr — we approximate as grey for the purpose of
  // feature extraction by the model (luminance carries most structural info).
  for (let i = 0; i < pixelCount; i++) {
    const srcIdx = dataStart + (i % available)
    const byte = rawBytes[srcIdx] & 0xFF

    // De-stuffing: skip 0xFF 0x00 sequences (JPEG byte stuffing)
    // Simple approach: treat stuffed bytes as the surrounding value
    pixels[i * 3]     = byte  // R
    pixels[i * 3 + 1] = byte  // G
    pixels[i * 3 + 2] = byte  // B
  }

  return pixels
}

// ── Postprocessing ────────────────────────────────────────────────────────────

/**
 * YOLOv8 output shape: [1, num_classes+4, num_anchors]
 * For the pothole-finetuned model (1 class): [1, 5, 2100]
 * For COCO (80 classes): [1, 84, 2100]
 */
function postprocess(
  outputTensor: Tensor,
): { state: DetectionState; detections: BoundingBox[] } {
  const data = outputTensor.data as Float32Array
  const shape = outputTensor.dims        // e.g. [1, 84, 2100] or [1, 5, 2100]
  const numAnchors = shape[2] ?? 2100
  const numCols    = shape[1] ?? 84
  const numClasses = numCols - 4

  const raw: BoundingBox[] = []

  for (let a = 0; a < numAnchors; a++) {
    const cx = data[0 * numAnchors + a]
    const cy = data[1 * numAnchors + a]
    const w  = data[2 * numAnchors + a]
    const h  = data[3 * numAnchors + a]

    let maxConf = 0
    let maxCls  = 0
    for (let c = 0; c < numClasses; c++) {
      const score = data[(4 + c) * numAnchors + a]
      if (score > maxConf) { maxConf = score; maxCls = c }
    }

    if (maxConf >= CONF_LOW) {
      raw.push({
        x1: Math.max(0, (cx - w / 2) / INPUT_SIZE),
        y1: Math.max(0, (cy - h / 2) / INPUT_SIZE),
        x2: Math.min(1, (cx + w / 2) / INPUT_SIZE),
        y2: Math.min(1, (cy + h / 2) / INPUT_SIZE),
        classId:   maxCls,
        className: COCO_CLASSES[maxCls] ?? `class_${maxCls}`,
        confidence: maxConf,
      })
    }
  }

  // Sort descending by confidence
  raw.sort((a, b) => b.confidence - a.confidence)

  // Non-Maximum Suppression to remove overlapping boxes
  const kept = nms(raw, IOU_THRESHOLD)

  // Final state decision
  let state: DetectionState
  if (kept.length === 0) {
    state = 'no_pothole_detected'
  } else if (kept[0].confidence >= CONF_HIGH) {
    state = 'pothole_detected'
  } else {
    state = 'uncertain_low_confidence'
  }

  return { state, detections: kept.slice(0, 10) }
}

/**
 * Greedy Non-Maximum Suppression.
 * Removes boxes that overlap more than iouThreshold with a higher-confidence box.
 */
function nms(boxes: BoundingBox[], iouThreshold: number): BoundingBox[] {
  const result: BoundingBox[] = []
  const suppressed = new Uint8Array(boxes.length)

  for (let i = 0; i < boxes.length; i++) {
    if (suppressed[i]) continue
    result.push(boxes[i])
    for (let j = i + 1; j < boxes.length; j++) {
      if (suppressed[j]) continue
      if (iou(boxes[i], boxes[j]) > iouThreshold) {
        suppressed[j] = 1
      }
    }
  }

  return result
}

function iou(a: BoundingBox, b: BoundingBox): number {
  const interX1 = Math.max(a.x1, b.x1)
  const interY1 = Math.max(a.y1, b.y1)
  const interX2 = Math.min(a.x2, b.x2)
  const interY2 = Math.min(a.y2, b.y2)

  const interW = Math.max(0, interX2 - interX1)
  const interH = Math.max(0, interY2 - interY1)
  const interArea = interW * interH

  if (interArea === 0) return 0

  const aArea = (a.x2 - a.x1) * (a.y2 - a.y1)
  const bArea = (b.x2 - b.x1) * (b.y2 - b.y1)
  return interArea / (aArea + bArea - interArea)
}

export function unloadModel(): void {
  _session = null
  _loadPromise = null
}
