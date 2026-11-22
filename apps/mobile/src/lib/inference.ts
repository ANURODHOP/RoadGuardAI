import './onnx-polyfill'
import { Asset } from 'expo-asset'
import * as FileSystem from 'expo-file-system'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { InferenceSession, Tensor } from 'onnxruntime-react-native'
import { decodeBase64JpegToRgba, rgbaToNchwFloat32 } from './image-processing'

export { decodeBase64JpegToRgba, rgbaToNchwFloat32 }

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
      console.warn('[Inference] Model load failed:', err?.message)
      const isMissing = err?.message?.toLowerCase().includes('not found') || err?.message?.toLowerCase().includes('download')
      return {
        state: isMissing ? 'model_not_found' : 'inference_error',
        detections: [],
        inferenceMs: Date.now() - startMs,
        modelPath: MODEL_FILENAME,
        errorMessage: err?.message ?? 'Model runtime unavailable on this build',
        modelSource: _modelSource,
      }
    }
  }

  if (!_session) {
    return {
      state: 'inference_error',
      detections: [],
      inferenceMs: Date.now() - startMs,
      modelPath: _modelPath || MODEL_FILENAME,
      errorMessage: 'Inference session could not be established',
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

/**
 * Full preprocessing pipeline: image URI → ONNX input tensor.
 *
 * Pipeline:
 * 1. Resize to 320×320 via expo-image-manipulator (hardware-accelerated, on-device)
 * 2. Decode the resulting JPEG with jpeg-js (proper DCT decompression via decodeBase64JpegToRgba)
 * 3. Convert RGBA pixels → planar RGB NCHW Float32, normalised [0,1] (via rgbaToNchwFloat32)
 * 4. Wrap in an ONNX Tensor [1, 3, 320, 320]
 *
 * Matches the Python reference preprocessing in ml/scripts/test_inference.py:
 *   resize 320×320 → float32 / 255.0 → HWC→CHW → expand batch dim
 */
async function preprocessImage(imageUri: string): Promise<Tensor> {
  // Step 1: Resize to 320×320 using expo-image-manipulator (hardware-accelerated)
  // Using high JPEG quality (0.95) to minimise compression artefacts before decoding
  const resized = await manipulateAsync(
    imageUri,
    [{ resize: { width: INPUT_SIZE, height: INPUT_SIZE } }],
    { format: SaveFormat.JPEG, base64: true, compress: 0.95 },
  )

  if (!resized.base64) {
    throw new Error('Image resize failed — no base64 output')
  }

  // Step 2: Decode JPEG to actual RGBA pixel data
  const decoded = decodeBase64JpegToRgba(resized.base64)

  // Verify dimensions match expectations
  if (decoded.width !== INPUT_SIZE || decoded.height !== INPUT_SIZE) {
    throw new Error(
      `Decoded image dimensions ${decoded.width}×${decoded.height} ` +
      `do not match expected ${INPUT_SIZE}×${INPUT_SIZE}`,
    )
  }

  // Step 3: Convert RGBA → planar RGB NCHW Float32, normalised [0, 1]
  const float32 = rgbaToNchwFloat32(decoded.data, INPUT_SIZE, INPUT_SIZE)

  // Step 4: Construct ONNX tensor [batch=1, channels=3, height=320, width=320]
  return new Tensor('float32', float32, [1, 3, INPUT_SIZE, INPUT_SIZE])
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
