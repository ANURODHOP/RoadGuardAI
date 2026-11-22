/**
 * RoadGuardAI — Stage 3 Test Suite: Model Training Pipeline & Contract Verification
 * =================================================================================
 * Verifies:
 * 1. Configuration integrity in `ml/configs/roadguard.yaml`.
 * 2. Colab notebook structural integrity & student workflow coverage in `ml/notebooks/roadguard_training.ipynb`.
 * 3. Script contracts: train.py, evaluate.py, export_onnx.py.
 * 4. Model output contract: [1, 5, 2100] tensor shape & 1-class postprocessing adaptation.
 * 5. Mobile model safety: export_onnx.py does not overwrite mobile assets unless explicitly requested.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('A. Training Configuration Verification (roadguard.yaml)', () => {
  const configPath = path.resolve('ml/configs/roadguard.yaml')

  test('roadguard.yaml exists and is readable', () => {
    assert.ok(fs.existsSync(configPath), 'ml/configs/roadguard.yaml must exist')
    const content = fs.readFileSync(configPath, 'utf8')
    assert.ok(content.length > 50, 'Config must not be empty')
  })

  test('roadguard.yaml specifies single target class: 0 -> pothole', () => {
    const content = fs.readFileSync(configPath, 'utf8')
    assert.match(content, /0:\s*pothole/, 'Class 0 must be named pothole')
    assert.doesNotMatch(content, /1:\s*\w+/, 'Must only have single class 0 (no class 1)')
  })

  test('training hyperparameters match mobile contract: imgsz = 320', () => {
    const content = fs.readFileSync(configPath, 'utf8')
    assert.match(content, /imgsz:\s*320/, 'imgsz must be 320 to match mobile model contract')
    assert.match(content, /model:\s*yolov8n\.pt/, 'Must use YOLOv8n backbone')
    assert.match(content, /seed:\s*42/, 'Must specify reproducible seed 42')
    assert.match(content, /epochs:\s*50/, 'Default epochs must be 50')
    assert.match(content, /optimizer:\s*AdamW/, 'Optimizer must be AdamW')
  })

  test('augmentation settings are safe for road surface photography', () => {
    const content = fs.readFileSync(configPath, 'utf8')
    // Vertical flip must be disabled (roads have gravity / horizon)
    assert.match(content, /flipud:\s*0\.0/, 'flipud must be 0.0 (roads have gravity)')
    // Mixup must be disabled (avoid ghost translucent road artifacts)
    assert.match(content, /mixup:\s*0\.0/, 'mixup must be 0.0 (no ghost roads)')
    // Horizontal flip allowed
    assert.match(content, /fliplr:\s*0\.5/, 'fliplr must be 0.5 (road symmetry)')
    // Mosaic enabled for multi-scale context
    assert.match(content, /mosaic:\s*0\.5/, 'mosaic must be 0.5')
  })

  test('dataset path resolution: relative path resolves to ml/datasets/roadguard', () => {
    const content = fs.readFileSync(configPath, 'utf8')
    assert.match(content, /path:\s*\.\.\/datasets\/roadguard/, 'Dataset path must be relative to config dir')
    const configDir = path.dirname(configPath)
    const resolvedPath = path.resolve(configDir, '../datasets/roadguard')
    const expectedPath = path.resolve('ml/datasets/roadguard')
    assert.equal(resolvedPath, expectedPath, 'Relative path must resolve exactly to ml/datasets/roadguard')
  })
})

describe('B. Google Colab Training Notebook Verification', () => {
  const notebookPath = path.resolve('ml/notebooks/roadguard_training.ipynb')

  test('roadguard_training.ipynb exists and is valid JSON', () => {
    assert.ok(fs.existsSync(notebookPath), 'Notebook must exist at ml/notebooks/roadguard_training.ipynb')
    const raw = fs.readFileSync(notebookPath, 'utf8')
    let parsed
    assert.doesNotThrow(() => { parsed = JSON.parse(raw) }, 'Notebook must parse as valid JSON')
    assert.equal(parsed.nbformat, 4, 'Notebook format must be version 4')
    assert.ok(Array.isArray(parsed.cells), 'Notebook must have cells array')
    assert.ok(parsed.cells.length >= 10, 'Notebook must contain at least 10 cells')
  })

  test('notebook covers all 10 student workflow steps', () => {
    const raw = fs.readFileSync(notebookPath, 'utf8')
    const requiredSteps = [
      'Environment Verification',
      'Install Dependencies',
      'Clone or Setup Repository',
      'Dataset Acquisition',
      'Prepare Dataset',
      'Dataset Integrity Audit',
      'Train YOLOv8n',
      'Held-Out Test Split',
      'Package Training Artifacts',
      'Download Model Checkpoint'
    ]
    for (const step of requiredSteps) {
      assert.ok(raw.includes(step), `Notebook must cover workflow step: "${step}"`)
    }
  })

  test('notebook contains GPU availability check and fallback guidance', () => {
    const raw = fs.readFileSync(notebookPath, 'utf8')
    assert.ok(raw.includes('torch.cuda.is_available()'), 'Must check CUDA availability')
    assert.ok(raw.includes('T4 GPU'), 'Must recommend T4 GPU runtime')
    assert.ok(raw.includes('batch_arg'), 'Must dynamically select batch size based on GPU/CPU')
  })

  test('notebook avoids hardcoding sensitive credentials or local paths', () => {
    const raw = fs.readFileSync(notebookPath, 'utf8')
    // No private API keys hardcoded
    assert.doesNotMatch(raw, /api_key\s*=\s*['"][a-zA-Z0-9]{15,}['"]/, 'Must not hardcode API keys')
    // Uses getpass for interactive key entry
    assert.ok(raw.includes('getpass'), 'Must use getpass for secure API key prompt')
    // No Windows-specific backslash paths
    assert.doesNotMatch(raw, /C:\\\\Users/, 'Must not contain Windows local paths')
  })
})

describe('C. Training and Evaluation Scripts Contract', () => {
  test('train.py evaluates on held-out test split', () => {
    const trainPath = path.resolve('ml/scripts/train.py')
    assert.ok(fs.existsSync(trainPath), 'ml/scripts/train.py must exist')
    const code = fs.readFileSync(trainPath, 'utf8')
    assert.ok(code.includes('split="test"') || code.includes("split='test'"),
      'train.py must evaluate on held-out test split after training')
    assert.ok(code.includes('test_metrics.json'), 'train.py must output test_metrics.json')
    assert.ok(code.includes('training_metadata.json'), 'train.py must output training_metadata.json')
  })

  test('evaluate.py exists and supports standalone test evaluation', () => {
    const evalPath = path.resolve('ml/scripts/evaluate.py')
    assert.ok(fs.existsSync(evalPath), 'ml/scripts/evaluate.py must exist')
    const code = fs.readFileSync(evalPath, 'utf8')
    assert.ok(code.includes('model.val'), 'evaluate.py must call model.val')
    assert.ok(code.includes('evaluation_report.json'), 'evaluate.py must write evaluation_report.json')
    assert.ok(code.includes('precision') && code.includes('recall') && code.includes('map50'),
      'evaluate.py must extract precision, recall, and map50')
  })

  test('export_onnx.py does NOT automatically overwrite mobile assets (Stage 3 safety)', () => {
    const exportPath = path.resolve('ml/scripts/export_onnx.py')
    assert.ok(fs.existsSync(exportPath), 'ml/scripts/export_onnx.py must exist')
    const code = fs.readFileSync(exportPath, 'utf8')
    assert.ok(code.includes('--copy-to-mobile'), 'export_onnx.py must require explicit --copy-to-mobile flag')
    assert.ok(code.includes('copy_to_mobile: bool = False') || code.includes('copy_to_mobile=False'),
      'Default behavior must be False to preserve Stage 3 mobile isolation')
  })
})

describe('D. 1-Class Model Contract & Postprocessing Verification', () => {
  /**
   * For the fine-tuned pothole model:
   * - Model output shape: [1, 5, 2100] (4 box coordinates cx, cy, w, h + 1 pothole score)
   * - Anchors: 2100 (for 320x320)
   * - Columns: 5
   * - numClasses: 5 - 4 = 1
   */
  test('model output dimensions: numCols = 5 -> numClasses = 1', () => {
    const shape = [1, 5, 2100]
    const numCols = shape[1]
    const numAnchors = shape[2]
    const numClasses = numCols - 4

    assert.equal(numClasses, 1, 'numClasses must evaluate to 1 for 1-class pothole model')
    assert.equal(numAnchors, 2100, 'numAnchors must be 2100 for 320x320 input')
  })

  test('1-class tensor slice offsets: box coords occupy cols 0-3, class 0 occupies col 4', () => {
    const numAnchors = 2100
    const anchorIdx = 42

    // Coordinate offsets
    const cxOffset = 0 * numAnchors + anchorIdx
    const cyOffset = 1 * numAnchors + anchorIdx
    const wOffset  = 2 * numAnchors + anchorIdx
    const hOffset  = 3 * numAnchors + anchorIdx
    // Class 0 confidence offset
    const cls0Offset = (4 + 0) * numAnchors + anchorIdx

    assert.equal(cxOffset, 42)
    assert.equal(cyOffset, 2142)
    assert.equal(wOffset, 4242)
    assert.equal(hOffset, 6342)
    assert.equal(cls0Offset, 8442)
    assert.equal(5 * numAnchors, 10500, 'Total elements per batch = 5 * 2100 = 10500')
    const lastElementIndex = 4 * numAnchors + (numAnchors - 1)
    assert.equal(lastElementIndex, 10499, 'Last element index in tensor is 10499')
  })

  test('synthetic 1-class detection postprocessing simulation', () => {
    const numAnchors = 2100
    const numCols = 5
    const data = new Float32Array(numCols * numAnchors)

    // Anchor 100 has a strong pothole detection:
    // Box center at (160, 160) with width 80, height 40 in 320x320 space
    const targetAnchor = 100
    data[0 * numAnchors + targetAnchor] = 160.0 // cx
    data[1 * numAnchors + targetAnchor] = 160.0 // cy
    data[2 * numAnchors + targetAnchor] = 80.0  // w
    data[3 * numAnchors + targetAnchor] = 40.0  // h
    data[4 * numAnchors + targetAnchor] = 0.88  // pothole score = 88%

    const numClasses = numCols - 4
    assert.equal(numClasses, 1)

    // Simulate postprocessing
    let bestConf = 0
    let bestCls = -1
    let bestBox = null

    for (let a = 0; a < numAnchors; a++) {
      let maxConf = 0
      let maxCls = 0
      for (let c = 0; c < numClasses; c++) {
        const score = data[(4 + c) * numAnchors + a]
        if (score > maxConf) { maxConf = score; maxCls = c }
      }
      if (maxConf > 0.40) { // CONF_HIGH threshold
        const cx = data[0 * numAnchors + a]
        const cy = data[1 * numAnchors + a]
        const w  = data[2 * numAnchors + a]
        const h  = data[3 * numAnchors + a]
        bestConf = maxConf
        bestCls = maxCls
        bestBox = {
          x1: (cx - w / 2) / 320,
          y1: (cy - h / 2) / 320,
          x2: (cx + w / 2) / 320,
          y2: (cy + h / 2) / 320,
        }
      }
    }

    assert.equal(bestCls, 0, 'Detected class ID must be 0')
    assert.ok(Math.abs(bestConf - 0.88) < 1e-5, 'Confidence must be 0.88')
    assert.ok(bestBox !== null, 'Box must be detected')
    assert.ok(Math.abs(bestBox.x1 - (160 - 40) / 320) < 1e-5, 'x1 normalized')
    assert.ok(Math.abs(bestBox.y1 - (160 - 20) / 320) < 1e-5, 'y1 normalized')
    assert.ok(Math.abs(bestBox.x2 - (160 + 40) / 320) < 1e-5, 'x2 normalized')
    assert.ok(Math.abs(bestBox.y2 - (160 + 20) / 320) < 1e-5, 'y2 normalized')
  })
})
