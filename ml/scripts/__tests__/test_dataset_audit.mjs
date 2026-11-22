import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatasetAuditor } from '../audit_dataset.mjs'

const TEST_DIR = path.resolve('ml/datasets/.tmp_test_audit')

// Helper to create a minimal valid JPEG file (1x1 pixel)
function createValidJpegBuffer() {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
    0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
    0x00, 0xbf, 0x00, 0xff, 0xd9
  ])
}

function setupSyntheticDataset() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  }

  for (const split of ['train', 'val', 'test']) {
    fs.mkdirSync(path.join(TEST_DIR, 'images', split), { recursive: true })
    fs.mkdirSync(path.join(TEST_DIR, 'labels', split), { recursive: true })
  }

  const validJpeg = createValidJpegBuffer()

  // 1. Valid sample in train (class 0, normalized coordinates)
  fs.writeFileSync(path.join(TEST_DIR, 'images/train/pothole_001.jpg'), validJpeg)
  fs.writeFileSync(path.join(TEST_DIR, 'labels/train/pothole_001.txt'), '0 0.500 0.500 0.250 0.150\n')

  // 2. Multi-box valid sample in train
  const img2 = Buffer.from(validJpeg)
  img2[img2.length - 10] = 0x42 // Make hash distinct
  fs.writeFileSync(path.join(TEST_DIR, 'images/train/pothole_002.jpg'), img2)
  fs.writeFileSync(path.join(TEST_DIR, 'labels/train/pothole_002.txt'), '0 0.200 0.300 0.100 0.100\n0 0.700 0.800 0.150 0.200\n')

  // 3. Negative / background sample (empty annotation)
  const img3 = Buffer.from(validJpeg)
  img3[img3.length - 10] = 0x55
  fs.writeFileSync(path.join(TEST_DIR, 'images/train/clean_road.jpg'), img3)
  fs.writeFileSync(path.join(TEST_DIR, 'labels/train/clean_road.txt'), '')

  // 4. Missing label file in train (image without .txt)
  const img4 = Buffer.from(validJpeg)
  img4[img4.length - 10] = 0x66
  fs.writeFileSync(path.join(TEST_DIR, 'images/train/missing_label.jpg'), img4)

  // 5. Orphan label file in train (label without image)
  fs.writeFileSync(path.join(TEST_DIR, 'labels/train/orphan_label.txt'), '0 0.5 0.5 0.2 0.2\n')

  // 6. Corrupt image file in train (not valid JPEG/PNG)
  fs.writeFileSync(path.join(TEST_DIR, 'images/train/corrupt_img.jpg'), Buffer.from('NOT_A_JPEG_FILE_DATA'))
  fs.writeFileSync(path.join(TEST_DIR, 'labels/train/corrupt_img.txt'), '0 0.5 0.5 0.2 0.2\n')

  // 7. Invalid annotations in val:
  //    Line 1: Out of bounds cx (1.800)
  //    Line 2: Negative width (-0.200)
  //    Line 3: Invalid class id (9 for 1-class model)
  //    Line 4: Non-numeric token ('pothole')
  //    Line 5: Incomplete line (only 3 tokens)
  const imgVal = Buffer.from(validJpeg)
  imgVal[imgVal.length - 10] = 0x77
  fs.writeFileSync(path.join(TEST_DIR, 'images/val/pothole_invalid.jpg'), imgVal)
  fs.writeFileSync(path.join(TEST_DIR, 'labels/val/pothole_invalid.txt'), [
    '0 1.800 0.500 0.200 0.200',
    '0 0.500 0.500 -0.200 0.200',
    '9 0.500 0.500 0.200 0.200',
    'pothole 0.500 0.500 0.200 0.200',
    '0 0.500 0.500',
  ].join('\n'))

  // 8. Internal duplicate in train: two identical files
  const dupImg = Buffer.from(validJpeg)
  dupImg[img2.length - 10] = 0x99
  fs.writeFileSync(path.join(TEST_DIR, 'images/train/dup_orig.jpg'), dupImg)
  fs.writeFileSync(path.join(TEST_DIR, 'labels/train/dup_orig.txt'), '0 0.5 0.5 0.2 0.2\n')
  fs.writeFileSync(path.join(TEST_DIR, 'images/train/dup_copy.jpg'), dupImg) // EXACT duplicate
  fs.writeFileSync(path.join(TEST_DIR, 'labels/train/dup_copy.txt'), '0 0.5 0.5 0.2 0.2\n')

  // 9. Cross-split data leakage: same image in train and test
  const leakImg = Buffer.from(validJpeg)
  leakImg[img2.length - 10] = 0xAA
  fs.writeFileSync(path.join(TEST_DIR, 'images/train/leak_train.jpg'), leakImg)
  fs.writeFileSync(path.join(TEST_DIR, 'labels/train/leak_train.txt'), '0 0.5 0.5 0.2 0.2\n')
  fs.writeFileSync(path.join(TEST_DIR, 'images/test/leak_test.jpg'), leakImg) // Leaked to test!
  fs.writeFileSync(path.join(TEST_DIR, 'labels/test/leak_test.txt'), '0 0.5 0.5 0.2 0.2\n')
}

describe('DatasetAuditor Verification Suite', () => {
  before(() => {
    setupSyntheticDataset()
  })

  after(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  test('detects corrupt images', () => {
    const auditor = new DatasetAuditor(TEST_DIR, 1)
    const result = auditor.runAudit(true)

    assert.equal(result.totalCorrupt, 1, 'Should detect exactly 1 corrupt image')
    assert.ok(auditor.corruptImages.train.includes('corrupt_img.jpg'))
  })

  test('detects missing labels for images without .txt', () => {
    const auditor = new DatasetAuditor(TEST_DIR, 1)
    auditor.runAudit(true)

    assert.ok(auditor.missingLabels.train.includes('missing_label.jpg'), 'missing_label.jpg should be flagged')
  })

  test('detects orphan label files without corresponding images', () => {
    const auditor = new DatasetAuditor(TEST_DIR, 1)
    auditor.runAudit(true)

    assert.ok(auditor.orphanLabels.train.includes('orphan_label.txt'), 'orphan_label.txt should be flagged')
  })

  test('detects and flags all 5 invalid annotation lines in val split', () => {
    const auditor = new DatasetAuditor(TEST_DIR, 1)
    const result = auditor.runAudit(true)

    assert.equal(result.totalInvalid, 5, 'Should detect exactly 5 invalid lines')
    const valInvalids = auditor.invalidAnnotations.val
    assert.equal(valInvalids.length, 5)
  })

  test('recognizes background / negative samples with zero annotations', () => {
    const auditor = new DatasetAuditor(TEST_DIR, 1)
    auditor.runAudit(true)

    assert.equal(auditor.emptyAnnotations.train, 1, 'Should record 1 empty annotation file')
  })

  test('detects exact duplicate image within the same split', () => {
    const auditor = new DatasetAuditor(TEST_DIR, 1)
    auditor.runAudit(true)

    assert.equal(auditor.exactDuplicates.train.length, 1, 'Should detect 1 internal duplicate pair')
  })

  test('detects cross-split data leakage between train and test', () => {
    const auditor = new DatasetAuditor(TEST_DIR, 1)
    const result = auditor.runAudit(true)

    assert.equal(result.splitLeakage.length, 1, 'Should detect 1 leaked image across splits')
    assert.equal(result.splitLeakage[0].s1, 'train')
    assert.equal(result.splitLeakage[0].s2, 'test')
  })

  test('fails overall audit when defects are present', () => {
    const auditor = new DatasetAuditor(TEST_DIR, 1)
    const result = auditor.runAudit(true)

    assert.equal(result.success, false, 'Audit must fail when data corruption, invalid labels, or leakage exist')
  })

  test('passes clean audit on fully valid dataset slice', () => {
    // Create a temporary clean dataset
    const cleanDir = path.resolve('ml/datasets/.tmp_clean_test')
    fs.mkdirSync(path.join(cleanDir, 'images/train'), { recursive: true })
    fs.mkdirSync(path.join(cleanDir, 'labels/train'), { recursive: true })

    const validJpeg = createValidJpegBuffer()
    fs.writeFileSync(path.join(cleanDir, 'images/train/pothole_ok.jpg'), validJpeg)
    fs.writeFileSync(path.join(cleanDir, 'labels/train/pothole_ok.txt'), '0 0.5 0.5 0.2 0.2\n')

    try {
      const auditor = new DatasetAuditor(cleanDir, 1)
      const result = auditor.runAudit(true)
      assert.equal(result.success, true, 'Clean dataset should pass audit')
      assert.equal(result.boxCounts.train, 1)
    } finally {
      fs.rmSync(cleanDir, { recursive: true, force: true })
    }
  })

  test('handles non-existent directory gracefully', () => {
    const auditor = new DatasetAuditor('ml/datasets/does_not_exist_at_all', 1)
    const result = auditor.runAudit(true)
    assert.equal(result.success, false)
    assert.equal(result.reason, 'DIRECTORY_NOT_FOUND')
  })
})
