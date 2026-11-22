/**
 * RoadGuardAI — Cross-Platform Dataset Audit & Integrity Verification Tool (Node.js ESM)
 * ======================================================================================
 * Verifies YOLO detection dataset integrity across environments:
 * 1. Checks magic headers for image corruption.
 * 2. Checks image-label parity (missing/orphan pairs).
 * 3. Validates YOLO syntax, normalized coordinates [0.0, 1.0], and class IDs.
 * 4. Detects exact duplicates via MD5 hashing.
 * 5. Detects cross-split data leakage between train/val/test.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// ── Near-duplicate detection via 8×8 difference hash (dHash) ─────────────────
// Pure Node.js implementation; works without Pillow or native image libs.
// Only usable when JPEG pixel data is available via jpeg-js; otherwise skipped.

/**
 * Compute an 8×8 dHash from a decoded RGBA pixel buffer.
 * Returns a 64-bit integer (BigInt) representing the hash, or null on failure.
 *
 * The hash encodes horizontal pixel intensity gradients in a 9×8 greyscale
 * downsampled version of the image. Two images with hamming distance ≤ 10
 * out of 64 bits are likely perceptually similar.
 *
 * @param {Uint8Array} rgbaData - Decoded RGBA pixels (4 bytes per pixel)
 * @param {number} srcWidth - Source image width
 * @param {number} srcHeight - Source image height
 * @param {number} hashSize - Hash dimension (default 8 → 64-bit hash)
 * @returns {bigint|null} 64-bit dHash or null
 */
export function computeDHash(rgbaData, srcWidth, srcHeight, hashSize = 8) {
  if (!rgbaData || srcWidth === 0 || srcHeight === 0) return null

  const tW = hashSize + 1  // 9
  const tH = hashSize      // 8

  // Nearest-neighbour scale + greyscale (luminance = 0.299R + 0.587G + 0.114B)
  const small = new Float32Array(tW * tH)
  for (let y = 0; y < tH; y++) {
    const srcY = Math.min(Math.floor(y * srcHeight / tH), srcHeight - 1)
    for (let x = 0; x < tW; x++) {
      const srcX = Math.min(Math.floor(x * srcWidth / tW), srcWidth - 1)
      const off = (srcY * srcWidth + srcX) * 4
      small[y * tW + x] = 0.299 * rgbaData[off] + 0.587 * rgbaData[off + 1] + 0.114 * rgbaData[off + 2]
    }
  }

  // Horizontal gradient encoding
  let hash = 0n
  for (let y = 0; y < tH; y++) {
    for (let x = 0; x < hashSize; x++) {
      hash = (hash << 1n) | (small[y * tW + x] < small[y * tW + x + 1] ? 1n : 0n)
    }
  }
  return hash
}

/**
 * Count differing bits between two BigInt hashes.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {number}
 */
export function hammingDistance(a, b) {
  let diff = a ^ b
  let count = 0
  while (diff > 0n) {
    count += Number(diff & 1n)
    diff >>= 1n
  }
  return count
}

export class DatasetAuditor {
  constructor(datasetDir, numClasses = 1) {
    this.root = path.resolve(datasetDir)
    this.numClasses = numClasses
    this.imageExts = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp'])
    this.splits = ['train', 'val', 'test']

    this.imageCounts = { train: 0, val: 0, test: 0 }
    this.labelCounts = { train: 0, val: 0, test: 0 }
    this.missingLabels = { train: [], val: [], test: [] }
    this.orphanLabels = { train: [], val: [], test: [] }
    this.corruptImages = { train: [], val: [], test: [] }
    this.emptyAnnotations = { train: 0, val: 0, test: 0 }
    this.invalidAnnotations = { train: [], val: [], test: [] }
    this.classCounts = { train: {}, val: {}, test: {} }
    this.boxCounts = { train: 0, val: 0, test: 0 }

    this.imageHashes = { train: new Map(), val: new Map(), test: new Map() }
    this.exactDuplicates = { train: [], val: [], test: [] }
    this.splitLeakage = []
    this.nearDuplicates = []  // Pairs flagged for review (not auto-deleted)
  }

  computeHash(filePath) {
    const buffer = fs.readFileSync(filePath)
    return crypto.createHash('md5').update(buffer).digest('hex')
  }

  checkImageReadable(filePath) {
    try {
      const buffer = fs.readFileSync(filePath)
      if (buffer.length < 4) return false
      const ext = path.extname(filePath).toLowerCase()
      if ((ext === '.jpg' || ext === '.jpeg') && (buffer[0] !== 0xff || buffer[1] !== 0xd8)) {
        return false
      }
      if (ext === '.png' && (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47)) {
        return false
      }
      return true
    } catch {
      return false
    }
  }

  validateAnnotationLine(line) {
    const parts = line.trim().split(/\s+/)
    if (parts.length !== 5) return null

    const clsId = Number(parts[0])
    const cx = Number(parts[1])
    const cy = Number(parts[2])
    const w = Number(parts[3])
    const h = Number(parts[4])

    if (!Number.isInteger(clsId) || isNaN(cx) || isNaN(cy) || isNaN(w) || isNaN(h)) return null
    if (clsId < 0 || clsId >= this.numClasses) return null
    if (cx < 0.0 || cx > 1.0 || cy < 0.0 || cy > 1.0 || w <= 0.0 || w > 1.0 || h <= 0.0 || h > 1.0) return null

    const x1 = cx - w / 2.0
    const y1 = cy - h / 2.0
    const x2 = cx + w / 2.0
    const y2 = cy + h / 2.0

    if (x1 < -0.05 || y1 < -0.05 || x2 > 1.05 || y2 > 1.05) return null
    return { clsId, cx, cy, w, h }
  }

  runAudit(quiet = false) {
    if (!fs.existsSync(this.root)) {
      if (!quiet) console.error(`[ERROR] Dataset root does not exist: ${this.root}`)
      return { success: false, reason: 'DIRECTORY_NOT_FOUND' }
    }

    let hasAnyData = false

    for (const split of this.splits) {
      const imgDir = path.join(this.root, 'images', split)
      const lblDir = path.join(this.root, 'labels', split)

      if (!fs.existsSync(imgDir)) continue
      hasAnyData = true

      const images = fs.readdirSync(imgDir).filter(f => this.imageExts.has(path.extname(f).toLowerCase()))
      const labels = fs.existsSync(lblDir) ? fs.readdirSync(lblDir).filter(f => path.extname(f).toLowerCase() === '.txt') : []

      this.imageCounts[split] = images.length
      this.labelCounts[split] = labels.length

      const lblMap = new Set(labels.map(f => path.parse(f).name))
      const imgMap = new Set(images.map(f => path.parse(f).name))

      for (const imgFile of images) {
        const imgPath = path.join(imgDir, imgFile)
        const stem = path.parse(imgFile).name

        // 1. Check readability
        if (!this.checkImageReadable(imgPath)) {
          this.corruptImages[split].push(imgFile)
          continue
        }

        // 2. Hash & duplicate detection
        const hash = this.computeHash(imgPath)
        if (this.imageHashes[split].has(hash)) {
          this.exactDuplicates[split].push([imgFile, this.imageHashes[split].get(hash)])
        } else {
          this.imageHashes[split].set(hash, imgFile)
        }

        // 3. Label parity
        if (!lblMap.has(stem)) {
          this.missingLabels[split].push(imgFile)
        } else {
          const lblPath = path.join(lblDir, `${stem}.txt`)
          const content = fs.readFileSync(lblPath, 'utf8')
          const lines = content.split('\n').map(l => l.trim()).filter(Boolean)

          if (lines.length === 0) {
            this.emptyAnnotations[split]++
          } else {
            for (const line of lines) {
              const parsed = this.validateAnnotationLine(line)
              if (!parsed) {
                this.invalidAnnotations[split].push({ file: `${stem}.txt`, line })
              } else {
                this.classCounts[split][parsed.clsId] = (this.classCounts[split][parsed.clsId] || 0) + 1
                this.boxCounts[split]++
              }
            }
          }
        }
      }

      // Check orphan labels
      for (const lblFile of labels) {
        const stem = path.parse(lblFile).name
        if (!imgMap.has(stem)) {
          this.orphanLabels[split].push(lblFile)
        }
      }
    }

    if (!hasAnyData) {
      if (!quiet) console.warn('[WARN] No split directories found to audit.')
      return { success: false, reason: 'NO_DATA_FOUND' }
    }

    // Cross-split leakage
    for (let i = 0; i < this.splits.length; i++) {
      for (let j = i + 1; j < this.splits.length; j++) {
        const s1 = this.splits[i]
        const s2 = this.splits[j]
        for (const [hash, file1] of this.imageHashes[s1].entries()) {
          if (this.imageHashes[s2].has(hash)) {
            const file2 = this.imageHashes[s2].get(hash)
            this.splitLeakage.push({ s1, file1, s2, file2 })
          }
        }
      }
    }

    const totalCorrupt = Object.values(this.corruptImages).reduce((a, b) => a + b.length, 0)
    const totalInvalid = Object.values(this.invalidAnnotations).reduce((a, b) => a + b.length, 0)
    const hasLeakage = this.splitLeakage.length > 0

    const isHealthy = totalCorrupt === 0 && totalInvalid === 0 && !hasLeakage

    if (!quiet) {
      console.log('--- Dataset Audit Summary ---')
      console.log(`Healthy: ${isHealthy}`)
      console.log(`Corrupt images: ${totalCorrupt}`)
      console.log(`Invalid annotations: ${totalInvalid}`)
      console.log(`Cross-split leakage: ${this.splitLeakage.length}`)
    }

    return {
      success: isHealthy,
      totalCorrupt,
      totalInvalid,
      splitLeakage: this.splitLeakage,
      exactDuplicates: this.exactDuplicates,
      nearDuplicates: this.nearDuplicates,
      missingLabels: this.missingLabels,
      orphanLabels: this.orphanLabels,
      imageCounts: this.imageCounts,
      boxCounts: this.boxCounts,
    }
  }
}
