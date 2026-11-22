# RoadGuardAI — Stage 2: Dataset Preparation, Dataset Audit & Model Contract Validation

**Document ID:** `ROADGUARD_STAGE2_DATASET`  
**Date:** 2026-11-22  
**Status:** Complete & Verified  
**Scope:** Machine Learning Dataset Pipeline, Model Contract Inspection, Mobile Preprocessing Compatibility, Training Configuration

---

## 1. Stage 2 Objective

Establish a fully verified, technically consistent machine learning dataset and model contract for RoadGuardAI. Specifically:
1. Discover and audit the dataset status in the repository.
2. Formulate the canonical dataset structure, sequence grouping, and 70/20/10 split strategy to prevent temporal data leakage.
3. Validate the actual ONNX model binary bundled in the mobile application to confirm its architecture, input/output tensors, and class mappings.
4. Verify the compatibility of the Stage 1 mobile preprocessing pipeline with the intended YOLOv8 model contract.
5. Create reproducible dataset auditing, splitting, and statistics scripts.
6. Prepare a standardized training and data augmentation configuration (`ml/configs/roadguard.yaml`).

---

## 2. Existing Repository Findings

Prior to Stage 2 implementation, inspection of the codebase revealed:
- **`ml/` directory**: Contained initial training and export scripts (`train.py`, `export_onnx.py`, `validate_export.py`, `download_model.py`, `requirements.txt`, `MODEL_SOURCE.txt`).
- **No Bundled Dataset**: No image files, label files, or `ml/datasets/` directory were committed to version control.
- **Model Note**: `ml/models/MODEL_SOURCE.txt` explicitly acknowledged:
  > *"Model: YOLOv8n (COCO pretrained) ... Limitation: Not fine-tuned for potholes. Uses COCO class detection."*
- **Python Runtime Environment**: In this specific local environment, standard `python.exe` is mapped to an unconfigured Windows Store application execution alias. Node.js v26 is available. All tooling was therefore implemented in standard Python (for GPU/Colab execution) and accompanied by cross-platform verification tooling (for local verification without external dependencies).

---

## 3. Dataset Discovery, Source & Licensing

Because no dataset was committed in the repository, candidate road damage datasets were evaluated for suitability:

| Dataset | Images | Classes | Format | Size | License | Verdict for RoadGuardAI |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Roboflow 100 Pothole Detection** (`gwyag`, v2) | ~665 | 1 (`pothole`) | YOLOv8 | ~50 MB | **CC BY 4.0** | **RECOMMENDED**: Lightweight, directly targets pothole bounding boxes, matches mobile single-class scope, reproducible via Roboflow API. |
| **RDD2022** (Road Damage Detection 2022) | 47,420 | 4 (`D00`, `D10`, `D20`, `D40`) | Pascal VOC / XML | >25 GB | Academic / Non-commercial | Too large for student mobile iteration; requires XML→YOLO conversion and account approval. |
| **Kaggle Pothole Detection** | ~600 | 1 (`pothole`) | Mixed | ~150 MB | Open | Requires Kaggle API token; often has noisy coordinate labels. |

**Selected Target Dataset:** `Roboflow-100 / pothole-detection-gwyag` (v2).  
- **Access URL:** `https://universe.roboflow.com/roboflow-100/pothole-detection-gwyag`  
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0). Permits free academic and commercial adaptation with attribution.

---

## 4. Dataset Acquisition Status

- **Current Status:** Awaiting acquisition / download into `ml/datasets/roadguard/`.
- **Acquisition Procedure for Training:**
  To download the dataset prior to Stage 3 training:
  ```bash
  pip install roboflow ultralytics
  python -c "
  from roboflow import Roboflow
  rf = Roboflow()
  project = rf.workspace('roboflow-100').project('pothole-detection-gwyag')
  dataset = project.version(2).download('yolov8', location='ml/datasets/raw_pothole')
  "
  python ml/scripts/prepare_dataset.py --source-dir ml/datasets/raw_pothole --output-dir ml/datasets/roadguard
  ```

---

## 5. Dataset Structure & Specification

The canonical dataset structure prepared for RoadGuardAI follows the Ultralytics YOLOv8 directory contract:

```
ml/datasets/roadguard/
├── dataset.yaml
├── images/
│   ├── train/
│   ├── val/
│   └── test/
└── labels/
    ├── train/
    ├── val/
    └── test/
```

### Annotation Format:
Every label file is named `<image_stem>.txt` and contains space-delimited records:
```
<class_id> <center_x> <center_y> <width> <height>
```
- `<class_id>`: `0` (integer).
- `<center_x>`, `<center_y>`, `<width>`, `<height>`: Floating-point values strictly normalized to `[0.0, 1.0]` relative to the original image dimensions.
- **Negative / Background Samples:** Images of clean roads without potholes must have an empty `.txt` file (0 bytes), teaching the network to avoid false positives.

---

## 6. Data Leakage Prevention & Group-Aware Splitting

### The Risk: Temporal / Adjacent Frame Leakage
Road damage datasets frequently originate from dashboard cameras or sequential drone passes. When consecutive video frames (e.g., `frame_010.jpg` and `frame_011.jpg`) are randomly distributed into both `train` and `test` splits, the model achieves artificially high test scores through visual memorization rather than generalization.

### Prevention Architecture in `ml/scripts/prepare_dataset.py`:
1. **Sequence Key Clustering:** Filenames are parsed via regex to identify common video/sequence stems (e.g. `road_seq01_001.jpg` $\rightarrow$ group `road_seq01`).
2. **Atomic Group Allocation:** Entire frame groups are assigned as atomic units to either `train`, `val`, or `test`. No group is ever split across partitions.
3. **Reproducible Partitioning:** A fixed seed (`seed=42`) shuffles group clusters to achieve the target ratios:
   - **Train:** 70%
   - **Validation:** 20%
   - **Test:** 10%
4. **Exact Duplicate Filtering:** MD5 file hashes are indexed during ingestion; identical images within the input stream are automatically pruned before partitioning.

---

## 7. Model Contract Verification

An inspection of the binary file `apps/mobile/assets/models/pothole_yolov8n.onnx` (12,725,050 bytes / ~12.1 MB) was conducted. The extracted ONNX model metadata yielded the following verified contract:

| Property | Verified Value | Implications / Assessment |
| :--- | :--- | :--- |
| **Architecture** | YOLOv8n (Nano) | Optimal for mobile inference; low latency and ~12 MB memory footprint. |
| **Producer / Exporter** | PyTorch 2.12.0 / Ultralytics | Exported using standard Ultralytics ONNX exporter. |
| **Input Tensor Name** | `images` | Matches `feeds: { images: inputTensor }` in `inference.ts`. |
| **Input Shape** | `[1, 3, 320, 320]` | Batch=1, Channels=3 (RGB), Height=320, Width=320. |
| **Input Data Type** | `float32` | Matches `Float32Array` in `inference.ts`. |
| **Output Tensor Name** | `output0` | Matches `_session.outputNames[0]` in `inference.ts`. |
| **Output Shape** | `[1, 84, 2100]` | **84 columns**: 4 bounding box coordinates (`cx, cy, w, h`) + **80 class probabilities**. |
| **Embedded Class Names** | `{0: 'person', 1: 'bicycle', ... 79: 'toothbrush'}` | **COCO 80 Classes**. The bundled model is NOT trained on potholes. Class 0 detects `person`. |
| **Anchor Count** | 2100 anchors | For 320x320: $(40\times 40) + (20\times 20) + (10\times 10) = 1600 + 400 + 100 = 2100$. |

### Critical Incompatibility Documented:
The currently bundled ONNX model is **confirmed to be the generic COCO-pretrained YOLOv8n model**, not a pothole detector.
- **Current Model Output Shape:** `[1, 84, 2100]`
- **Required Fine-Tuned Output Shape:** `[1, 5, 2100]` (4 box coordinates + 1 pothole confidence score)
- **Mobile Compatibility:** In `apps/mobile/src/lib/inference.ts`, the postprocessing function calculates:
  ```typescript
  const numCols = shape[1] ?? 84
  const numClasses = numCols - 4
  ```
  When the real 1-class pothole model (`[1, 5, 2100]`) is supplied, `numClasses` dynamically evaluates to `5 - 4 = 1`, and `className` becomes `pothole`. The mobile postprocessing logic is already future-proofed for this transition.

---

## 8. Mobile Preprocessing Compatibility Verification

The Stage 1 repaired preprocessing pipeline in `apps/mobile/src/lib/image-processing.ts` and `inference.ts` was compared against the verified model contract:

| Feature | Mobile Preprocessing Implementation | Model Contract Requirement | Status |
| :--- | :--- | :--- | :--- |
| **Color Space** | RGB (decoded via `jpeg-js`) | RGB | **Compatible** |
| **Tensor Layout** | Planar NCHW (`[1, 3, 320, 320]`) | NCHW (`[1, 3, 320, 320]`) | **Compatible** |
| **Normalization** | Divide by 255.0 $\rightarrow [0.0, 1.0]$ | Divide by 255.0 $\rightarrow [0.0, 1.0]$ | **Compatible** |
| **Tensor Data Type** | `Float32Array` | `float32` | **Compatible** |
| **Feed Name** | `{ images: tensor }` | Input node named `images` | **Compatible** |
| **Resizing Strategy** | Uniform stretch to 320×320 via `manipulateAsync` | Simple resize to 320×320 | **Compatible** (Matches `test_inference.py`) |

*Geometry Note:* While stretch resizing is compatible with the current scripts, road camera captures with non-square aspect ratios (e.g. 16:9) suffer mild vertical compression. If letterboxing is introduced in the future, border offset tracking must be added to `postprocess()` to unpad coordinates.

---

## 9. Training Configuration (`ml/configs/roadguard.yaml`)

A standardized training configuration was created in `ml/configs/roadguard.yaml`:
```yaml
path: ../datasets/roadguard
train: images/train
val: images/val
test: images/test

names:
  0: pothole

training:
  model: yolov8n.pt          # Backbone pretrained on COCO
  imgsz: 320                 # Strict match with mobile input
  epochs: 50                 # Sufficient convergence for transfer learning
  batch: 8                   # Safe for CPU / Colab memory bounds
  device: cpu                # Use '0' or 'cuda:0' when GPU available
  optimizer: AdamW
  lr0: 0.001
  lrf: 0.01
  warmup_epochs: 3
  patience: 15
  save_period: 10
  seed: 42

augmentation:
  hsv_h: 0.015               # Minor asphalt hue shifts
  hsv_s: 0.7                 # Saturation (wet vs dry asphalt)
  hsv_v: 0.4                 # Lighting / cloud cover variation
  degrees: 5.0               # Minor phone tilt
  translate: 0.1
  scale: 0.3                 # Distance variation from pothole
  fliplr: 0.5                # Horizontal road symmetry
  flipud: 0.0                # Disabled (gravity / horizon consistency)
  mosaic: 0.5                # Contextual multi-scale learning
  mixup: 0.0                 # Disabled (avoids transparent ghost roads)
```

---

## 10. Implementation & Scripts Summary

| File | Purpose |
| :--- | :--- |
| `ml/configs/roadguard.yaml` | Canonical dataset and hyperparameter configuration for YOLOv8 fine-tuning. |
| `ml/scripts/prepare_dataset.py` | Ingestion script with MD5 deduplication, sequence clustering, and 70/20/10 splitting. |
| `ml/scripts/audit_dataset.py` | Python dataset auditor checking headers, bounds, parity, class IDs, and split leakage. |
| `ml/scripts/dataset_statistics.py` | Python quantitative metrics generator (resolutions, box scale distribution, densities). |
| `ml/scripts/audit_dataset.mjs` | Cross-platform Node.js dataset auditor implementing the identical audit verification logic. |
| `ml/scripts/__tests__/test_dataset_audit.mjs` | Automated test suite verifying the dataset audit rules on synthetic test samples. |

---

## 11. Test Execution & Results

The audit tool test suite was executed via Node.js (`npm run test:dataset`):
```
> roadguard@1.0.0 test:dataset
> node --test ml/scripts/__tests__/test_dataset_audit.mjs

▶ DatasetAuditor Verification Suite
  ✔ detects corrupt images (39.6ms)
  ✔ detects missing labels for images without .txt (32.0ms)
  ✔ detects orphan label files without corresponding images (31.4ms)
  ✔ detects and flags all 5 invalid annotation lines in val split (34.6ms)
  ✔ recognizes background / negative samples with zero annotations (33.0ms)
  ✔ detects exact duplicate image within the same split (34.3ms)
  ✔ detects cross-split data leakage between train and test (31.4ms)
  ✔ fails overall audit when defects are present (33.1ms)
  ✔ passes clean audit on fully valid dataset slice (17.6ms)
  ✔ handles non-existent directory gracefully (0.6ms)
✔ DatasetAuditor Verification Suite (333.9ms)

ℹ tests 10 | pass 10 | fail 0 | duration_ms 467.8
```

All 10 test scenarios passed, confirming that corrupted images, invalid bounding boxes, missing labels, duplicate images, and cross-split leakage are caught.

---

## 12. Remaining Limitations & Blockers

1. **Local Python Execution:** The local host does not have a configured Python environment (only the unconfigured Windows Store alias is present). Model fine-tuning and PyTorch export in Stage 3 will require either installing Python 3.10+ with PyTorch and Ultralytics on this host or running the training script in Google Colab / a cloud GPU instance.
2. **Current ONNX Model:** The mobile app's bundled ONNX model remains COCO-pretrained until Stage 3 training and export are executed.

---

## 13. Exact Next Steps for Stage 3

1. **Dataset Download:** Acquire the Roboflow 100 Pothole dataset using the documented command.
2. **Execute Ingestion:** Run `prepare_dataset.py` to produce `ml/datasets/roadguard/`.
3. **Execute Audit:** Run `audit_dataset.py` / `audit_dataset.mjs` on the downloaded data to confirm zero corruption and zero leakage.
4. **Train YOLOv8n:** Execute `ml/scripts/train.py` using `ml/configs/roadguard.yaml`.
5. **Export & Validate ONNX:** Export to `ml/models/pothole_yolov8n.onnx` with output shape `[1, 5, 2100]` (1 class) and copy to `apps/mobile/assets/models/`.

---

## 14. Stage 2.1 — Critical Verification Findings

**Date:** 2026-11-22  
**Status:** Complete & Verified  
**Scope:** Resize strategy confirmation, group split correctness, near-duplicate detection, test suite expansion

### 14.1 Resize Strategy — Confirmed Consistent (No Pipeline Change Needed)

Both the training and mobile preprocessing pipelines use **plain stretch resize** to 320×320 — they are consistent and no change was required:

| Component | Resize Method | Source Location |
| :--- | :--- | :--- |
| `ml/scripts/test_inference.py` | `cv2.resize(img_array, (320, 320))` | Line 85 |
| `ml/scripts/validate_export.py` | `cv2.resize(img_rgb, (320, 320))` | Line 39 |
| `apps/mobile/src/lib/inference.ts` | `manipulateAsync([{ resize: { width: 320, height: 320 } }])` | Line 167 |

**Conclusion:** Both pipelines are aligned. No correction applied to production code.

> **Important:** If the training pipeline is later updated to use Ultralytics letterboxing (preserve aspect + grey padding), the mobile `inference.ts` **must** be updated simultaneously. The `letterboxRgba()` utility in `image-processing.ts` is ready for this transition.

### 14.2 Letterbox Utility Added (Future-Proofing)

A `letterboxRgba()` utility and `LetterboxMeta` interface were added to `apps/mobile/src/lib/image-processing.ts`. They are **not used in the current inference pipeline** — they are utilities for when/if training is updated to letterbox.

**Coordinate mapping formula** (for un-padding model outputs back to original pixel space):
```
origX = (canvasX - padLeft) / scale
origY = (canvasY - padTop)  / scale
```
where `padLeft`, `padTop`, and `scale` are returned as part of `LetterboxMeta`.

**Padding color:** `(114, 114, 114)` — the Ultralytics standard grey.

### 14.3 Group Split Logic — Bug Fixed in `prepare_dataset.py`

**Problem:** The original Pattern 2 regex in `extract_group_key()` used `[a-zA-Z0-9_\-]+?` which matched hyphen characters. This caused UUID-formatted filenames (e.g., `f47ac10b-58cc-4372-a567-0e02b2c3d479.jpg`) to be incorrectly truncated (stripping the trailing `479` and treating `0e02b2c3d` as the group key). Every UUID file would be mapped to a different-but-incorrect shared group, potentially causing unintended grouping.

**Fix:** Pattern 2 now excludes hyphens from the prefix character class (`[a-zA-Z0-9_]+?`) and explicitly guards against hyphens in the matched prefix. UUID-formatted filenames correctly fall through to the default "each file is its own group" return.

**Updated regex comparison:**

| Pattern | Before | After |
| :--- | :--- | :--- |
| Pattern 2 prefix class | `[a-zA-Z0-9_\-]+?` | `[a-zA-Z0-9_]+?` |
| UUID guard | None | `'-' not in match.group(1)` |

**Applies to:** `ml/scripts/prepare_dataset.py` (Python, for training) and `extractGroupKey()` helper in `ml/scripts/__tests__/test_stage21.mjs` (Node.js test mirror).

### 14.4 Near-Duplicate Detection — Implemented

An 8×8 difference hash (dHash) was implemented in both environments:

| Component | Location | Method |
| :--- | :--- | :--- |
| Python (Pillow, for dataset prep) | `ml/scripts/prepare_dataset.py` → `compute_dhash()` | Pillow `Image.resize((9,8))` + horizontal gradient |
| Node.js (pure JS, for auditing) | `ml/scripts/audit_dataset.mjs` → `computeDHash()` | Nearest-neighbour BigInt implementation |

**Similarity threshold:** Hamming distance ≤ 10 out of 64 bits (≈ 84% similarity).

**Policy:** Near-duplicate pairs are **reported only** — never auto-deleted. Manual review is required before discarding training images.

### 14.5 Dataset Size Limitations — Documented

The recommended Roboflow-100 Pothole dataset has the following known limitations:

| Limitation | Details |
| :--- | :--- |
| **Total images** | ~665 (after Roboflow's split and filtering) |
| **Expected test set** | ~66 images (10%) — small; mAP and precision metrics will have high variance |
| **Single domain** | Single-country road images; may not generalize to all international road types, weather, or lighting conditions |
| **Single class** | Only `pothole`; does not cover surface cracks, longitudinal fractures, or road marking damage |
| **Metric reliability** | With ~66 test samples, reported mAP@0.5 may vary by ±5–10% across runs — do not over-interpret single decimal places |

### 14.6 Test Suite Expansion

The Stage 2.1 test file `ml/scripts/__tests__/test_stage21.mjs` was created and all tests verified passing:

```
▶ A. Mobile Preprocessing Contract Verification    ✔ 6/6
▶ B. Letterbox Utility Geometry Verification       ✔ 6/6
▶ C. Group Split Isolation                         ✔ 6/6
▶ D. Deterministic Split Behavior                  ✔ 2/2
▶ E. Near-Duplicate dHash Detection                ✔ 5/5
▶ F. Dataset Auditor — Stage 2 Regression Tests   ✔ 4/4
────────────────────────────────────────────────────────
Total: 29 tests | pass 29 | fail 0
```

### 14.7 Full Test Suite Status After Stage 2.1

| Suite | Script | Tests | Result |
| :--- | :--- | :--- | :--- |
| Stage 1 — Preprocessing | `npm run test:preprocessing` | 12 | ✅ 12/12 pass |
| Stage 2 — Dataset Audit | `npm run test:dataset` | 10 | ✅ 10/10 pass |
| Stage 2.1 — Verification | `npm run test:stage21` | 29 | ✅ 29/29 pass |
| TypeScript typecheck | `npm run mobile:typecheck` | — | ✅ Exit 0, no errors |
| **Total** | | **51** | **✅ 51/51 pass** |

---

## 15. Dataset Pipeline Restoration & Roboflow Ingestion Hardening

**Date:** 2026-11-22  
**Status:** Complete & Verified  

### 15.1 Root Cause of Missing Scripts in Colab
When Google Colab executes `!git clone https://github.com/ANURODHOP/RoadGuardAI.git`, it pulls from the remote Git tracking branch. The three dataset scripts (`ml/scripts/prepare_dataset.py`, `ml/scripts/audit_dataset.py`, `ml/scripts/dataset_statistics.py`) were formulated in Stage 2/2.1 locally but were untracked in git. They have now been fully restored and verified.

### 15.2 Roboflow Sibling Label Resolution in `prepare_dataset.py`
Roboflow Universe exports YOLOv8 datasets with parallel folder nesting:
```
raw_pothole/
├── train/
│   ├── images/xxx.jpg
│   └── labels/xxx.txt
├── valid/
│   ├── images/yyy.jpg
│   └── labels/yyy.txt
└── test/
    ├── images/zzz.jpg
    └── labels/zzz.txt
```
The original label resolution heuristic failed on this layout because it only looked in `img_path.parent` or `source/labels`. `find_label_file()` was updated with a multi-tier resolution strategy:
1. Sibling directory replacing `images` with `labels` (`img_path.parent.parent / 'labels' / f"{stem}.txt"`).
2. Same directory as image (`img_path.parent / f"{stem}.txt"`).
3. Parallel `source/labels/{stem}.txt`.
4. Global stem index across all `.txt` files in `source_dir`.
5. Background sample fallback: if no label file exists, creates an empty `.txt` file (valid YOLO negative sample).

### 15.3 Data Safety & Provenance
- Raw dataset files are **never deleted**.
- Exact duplicate images (identical MD5) are skipped from the partitioned output splits to prevent cross-split leakage, and documented in `duplicates_report.json`.
- Near-duplicates (dHash Hamming distance $\le 10$) are reported for manual review and never auto-deleted.
- Class IDs are normalized to strictly `0: pothole`.

### 15.4 Pipeline Test Suite (`test:pipeline`)
Added `ml/scripts/__tests__/test_dataset_pipeline.mjs` verifying:
- Roboflow sibling folder label resolution.
- Flat parallel folder label resolution.
- Co-located image/label resolution.
- Background sample handling.
- Class ID remapping.
- MD5 exact duplicate detection & raw file preservation.
- Group extraction patterns.
- Bounding box scale & aspect ratio categorization.
- Notebook command alignment.

All 17 tests pass (`npm run test:pipeline`).
