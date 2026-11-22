# RoadGuardAI — Stage 1: AI Image Preprocessing Pipeline Repair & Validation

**Document ID:** `ROADGUARD_STAGE1_PREPROCESSING`  
**Date:** 2026-11-22  
**Status:** Complete & Verified  
**Scope:** Mobile AI Preprocessing Pipeline (`apps/mobile/src/lib/inference.ts`, `apps/mobile/src/lib/image-processing.ts`)

---

## 1. Executive Summary & Problem Diagnosis

During the Stage 0 baseline audit, a critical failure was diagnosed in `apps/mobile/src/lib/inference.ts`:

### The Flaw in the Previous Implementation
The previous function `decodeBase64JpegToRgb()` attempted to extract pixel data from base64-encoded JPEG images via byte scanning:
```typescript
// PREVIOUS FLAWED CODE (inference.ts lines 196-225):
for (let i = 0; i < rawBytes.length - 1; i++) {
  if (rawBytes[i] === 0xFF && rawBytes[i + 1] === 0xDA) {
    dataStart = Math.min(i + 12, rawBytes.length - 1)
    break
  }
}
// Treated subsequent bytes as raw greyscale pixels:
for (let i = 0; i < pixelCount; i++) {
  const byte = rawBytes[srcIdx] & 0xFF
  pixels[i * 3]     = byte
  pixels[i * 3 + 1] = byte
  pixels[i * 3 + 2] = byte
}
```

### Why This Was Broken
1. **JPEG Bitstream Compression**: JPEG files do not contain uncompressed raster pixels immediately following the Start-of-Scan marker (`0xFF 0xDA`). The data following `0xFFDA` consists of variable-length Huffman-coded or arithmetic-coded DCT (Discrete Cosine Transform) frequency coefficients.
2. **Input Corruption**: Passing Huffman entropy bytes directly to the ONNX tensor fed the YOLOv8 neural network high-frequency pseudo-random noise rather than visual image content.
3. **Loss of Color & Structure**: Treating single compressed bytes as identical R, G, and B components stripped all chroma channels and structural edges, invalidating inference outputs.

---

## 2. Technical Architecture & Implementation

### 2.1 Solution Selection: `jpeg-js`
To decode JPEG images in an Expo React Native environment without adding native binary dependencies or altering Expo config plugins, `jpeg-js` (version `^0.4.4`) was selected:
- **Pure JavaScript**: Operates directly on standard TypedArrays (`Uint8Array`) in the JavaScript/Hermes engine.
- **Standards-Compliant Decompression**: Performs full Huffman decoding, Inverse Discrete Cosine Transform (IDCT), and YCbCr→RGB color space conversion.
- **Expo & Android Compatible**: No native code required; compatible with Expo Go, custom development builds, and standalone APK releases.
- **Clean Separation**: Decoupled from Expo/React Native native bindings, allowing headless testing in standard Node.js environments.

### 2.2 Modular Preprocessing Architecture
The preprocessing logic was structured into two layers:

1. **`apps/mobile/src/lib/image-processing.ts`** (Pure image processing library):
   - `decodeBase64JpegToRgba(base64: string)`:
     - Converts base64 string to `Uint8Array`.
     - Invokes `jpeg-js.decode()` with `{ useTArray: true, formatAsRGBA: true }`.
     - Returns `{ data: Uint8Array, width: number, height: number }`.
   - `rgbaToNchwFloat32(rgbaData: Uint8Array, width: number, height: number)`:
     - Converts interleaved HWC RGBA (`[R0, G0, B0, A0, R1, G1, B1, A1, ...]`) into planar NCHW Float32 layout (`[1, 3, H, W]`).
     - Normalizes integer byte values `[0, 255]` to floating-point range `[0.0, 1.0]` by dividing by `255.0`.
     - Discards the alpha channel (`A`).
     - Channel layout offsets:
       - Red plane: indices `0` to `H * W - 1`
       - Green plane: indices `H * W` to `2 * H * W - 1`
       - Blue plane: indices `2 * H * W` to `3 * H * W - 1`

2. **`apps/mobile/src/lib/inference.ts`** (Mobile ML inference orchestrator):
   - `preprocessImage(imageUri: string)`:
     - Uses `expo-image-manipulator` (`manipulateAsync`) to resize camera or gallery images to `320×320` JPEG (compress quality `0.95`).
     - Decodes base64 JPEG to RGBA via `decodeBase64JpegToRgba()`.
     - Converts to planar NCHW float32 via `rgbaToNchwFloat32()`.
     - Wraps the float32 array in an ONNX Runtime `Tensor('float32', float32, [1, 3, 320, 320])`.
     - Feeds `{ images: inputTensor }` to `InferenceSession.run()`.
   - Re-exports `decodeBase64JpegToRgba` and `rgbaToNchwFloat32` for backwards compatibility.

---

## 3. Specification Alignment: Model Input Contract

The implementation strictly mirrors the Python training and export preprocessing contract:

| Parameter | Python Reference (`ml/scripts/test_inference.py`) | Mobile Implementation (`inference.ts`) | Verified Alignment |
| :--- | :--- | :--- | :--- |
| **Input Name** | `images` | `images` (`feeds: { images: inputTensor }`) | Exact match |
| **Tensor Dimensions** | `[1, 3, 320, 320]` (BCHW) | `[1, 3, 320, 320]` | Exact match |
| **Data Type** | `float32` | `Float32Array` | Exact match |
| **Channel Order** | RGB (converted from BGR in Python) | RGB (planar Red, Green, Blue planes) | Exact match |
| **Normalization** | `img / 255.0` (`[0.0, 1.0]`) | `pixel / 255.0` (`[0.0, 1.0]`) | Exact match |
| **Resolution** | 320 × 320 | 320 × 320 (`INPUT_SIZE = 320`) | Exact match |

---

## 4. Image Resizing & Geometry Handling

- **Aspect Ratio Handling**: Currently, `expo-image-manipulator` resizes images to `320×320` using standard scaling.
- **Coordinate Mapping**: The model output bounding boxes (`cx, cy, w, h`) are normalized relative to `INPUT_SIZE (320)`:
  - `x1 = Math.max(0, (cx - w / 2) / INPUT_SIZE)`
  - `y1 = Math.max(0, (cy - h / 2) / INPUT_SIZE)`
  - `x2 = Math.min(1, (cx + w / 2) / INPUT_SIZE)`
  - `y2 = Math.min(1, (cy + h / 2) / INPUT_SIZE)`
  Because `x1, y1, x2, y2` are normalized `[0, 1]` fractions, the UI in `detection.tsx` maps them back to the rendered image container coordinates using container width and height.
- **Letterbox vs Stretch Note**: While uniform stretch is currently implemented (matching `test_inference.py`), if extreme aspect ratios introduce distortion, letterboxing with padding can be introduced in a future stage along with transform offset tracking.

---

## 5. Verification & Test Suite

An automated test suite was constructed and executed with zero failures.

### 5.1 Test Suites (`apps/mobile/src/lib/__tests__/run-tests.mjs`)

1. **JPEG Decoding (`decodeBase64JpegToRgba`)**:
   - `decodes a solid red 2x2 JPEG and returns correct RGBA pixels`: Confirms `R >= 245`, `G <= 10`, `B <= 10`, `A = 255`.
   - `decodes a solid green 4x4 JPEG and returns correct RGBA pixels`: Confirms `R <= 10`, `G >= 245`, `B <= 10`.
   - `decodes a 320x320 JPEG to exact dimensions [320, 320]`: Confirms output byte length equals `320 * 320 * 4 = 409,600`.
   - `preserves spatial color gradient across the image`: Verifies top-left vs bottom-right spatial gradient retention.
   - `throws meaningful error on empty or invalid base64 input`: Confirms robust input validation.

2. **NCHW Tensor Conversion (`rgbaToNchwFloat32`)**:
   - `converts 2x2 solid red RGBA to planar NCHW [1, 3, 2, 2]`: Confirms channel separation into contiguous R, G, B planes.
   - `correctly normalizes multi-color pixel to [0.0, 1.0]`: Confirms `100/255`, `150/255`, `200/255` float values.
   - `discards alpha channel completely`: Confirms alpha values are omitted from output tensor.
   - `verifies planar channel layout offsets for 320x320`: Tests boundary indices `0`, `102400`, `204800`, `307199`.
   - `throws error when RGBA buffer is undersized`: Prevents buffer underflow crashes.

3. **End-to-End Pipeline Verification**:
   - `proves decoded data contains REAL pixel values, not JPEG bitstream entropy bytes`: Tests that a solid blue image produces `R < 0.05`, `G < 0.05`, `B > 0.95` across every pixel in the tensor, confirming true raster decoding.
   - `round-trip 320x320 tensor output is fully normalized in [0.0, 1.0]`: Confirms all 307,200 elements fall within `[0.0, 1.0]`.

### 5.2 Test Execution Output
```
> roadguard@1.0.0 test:preprocessing
> npm --prefix apps/mobile test

▶ JPEG Decoding — decodeBase64JpegToRgba
  ✔ decodes a solid red 2x2 JPEG and returns correct RGBA pixels (24.1009ms)
  ✔ decodes a solid green 4x4 JPEG and returns correct RGBA pixels (8.6705ms)
  ✔ decodes a 320x320 JPEG to exact dimensions [320, 320] (53.0005ms)
  ✔ preserves spatial color gradient across the image (16.9413ms)
  ✔ throws meaningful error on empty or invalid base64 input (1.078ms)
✔ JPEG Decoding — decodeBase64JpegToRgba (105.4172ms)
▶ NCHW Tensor Conversion — rgbaToNchwFloat32
  ✔ converts 2x2 solid red RGBA to planar NCHW [1, 3, 2, 2] (0.573ms)
  ✔ correctly normalizes multi-color pixel to [0.0, 1.0] (0.2249ms)
  ✔ discards alpha channel completely (0.1991ms)
  ✔ verifies planar channel layout offsets for 320x320 (2.4982ms)
  ✔ throws error when RGBA buffer is undersized (0.4138ms)
✔ NCHW Tensor Conversion — rgbaToNchwFloat32 (4.4635ms)
▶ End-to-End Decoding and Tensor Pipeline Verification
  ✔ proves decoded data contains REAL pixel values, not JPEG bitstream entropy bytes (20.6562ms)
  ✔ round-trip 320x320 tensor output is fully normalized in [0.0, 1.0] (74.1606ms)
✔ End-to-End Decoding and Tensor Pipeline Verification (95.1087ms)
ℹ tests 12
ℹ suites 3
ℹ pass 12
ℹ fail 0
```

### 5.3 TypeScript Strict Typecheck
```
> roadguard@1.0.0 mobile:typecheck
> npm --prefix apps/mobile run typecheck
> mobile@1.0.0 typecheck
> tsc --noEmit
(Exit code 0 — zero errors)
```

---

## 6. Testing Boundaries: Headless vs Physical Device

| Component / Layer | Environment | Testing Status |
| :--- | :--- | :--- |
| **JPEG Base64 Decoding** (`decodeBase64JpegToRgba`) | Node.js / Headless CI / Device | Fully tested and verified |
| **RGBA → Planar NCHW Float32 Conversion** (`rgbaToNchwFloat32`) | Node.js / Headless CI / Device | Fully tested and verified |
| **`expo-image-manipulator` Resizing** | React Native Runtime (Android / iOS) | Requires physical device or emulator |
| **ONNX Runtime Native Session (`InferenceSession.run`)** | React Native Native Module (C++ binary) | Requires Android build / APK (`onnxruntime-react-native`) |

---

## 7. Known Limitations & Remaining Scope (Post-Stage 1)

1. **Model Weights (Stage 2)**: As established in Stage 0, the bundled `pothole_yolov8n.onnx` model has COCO 80-class weights rather than dedicated road-damage fine-tuned weights. The preprocessing pipeline now provides valid visual features to the model, but genuine road damage detection requires Stage 2 fine-tuning.
2. **Letterbox Padding Tracking**: Simple aspect-ratio resizing is used. If letterboxing is added to prevent distortion on non-square camera captures, bounding box coordinates must be unpadded before display.
3. **Database / Backend**: Supabase schema and RLS policies were not modified during this stage.

---

## 8. Stage 2.1 Update � Letterbox Utility Added

**Date:** 2026-11-22

As part of Stage 2.1, two new exports were added to `apps/mobile/src/lib/image-processing.ts`:

### `LetterboxMeta` (interface)
`	ypescript
export interface LetterboxMeta {
  scale: number      // uniform scale applied to source image
  padLeft: number    // left padding in model canvas (pixels)
  padTop: number     // top padding in model canvas (pixels)
  scaledW: number    // width of the scaled image region
  scaledH: number    // height of the scaled image region
}
`

### `letterboxRgba()` (function)
Resizes an RGBA buffer into a 320x320 canvas while preserving aspect ratio, padding with Ultralytics grey (114, 114, 114). Returns the padded canvas and `LetterboxMeta` for coordinate un-mapping.

> **[!IMPORTANT]** These are NOT used in the current production inference pipeline. The production pipeline continues to use plain stretch resize via `manipulateAsync`, which is consistent with the training scripts. The letterbox utility is available for future adoption if training is updated.

### Coordinate Un-mapping (if letterbox is adopted)
To convert model-output pixel coordinates back to original image space:
``r
origX = (canvasX - padLeft) / scale
origY = (canvasY - padTop)  / scale
`

### TypeScript Typecheck Status
After adding these exports, `npm run mobile:typecheck` exits with code 0 � no type errors.
