"""
RoadGuardAI — Dataset Preparation & Split Script
================================================
Ingests raw pothole image-label pairs (supporting Roboflow YOLOv8 downloads,
flat directories, and nested split layouts), performs sequence/video grouping
to prevent temporal data leakage, and generates a reproducible 70% Train / 20% Val / 10% Test
split formatted for Ultralytics YOLOv8.

Roboflow YOLOv8 Ingestion:
  - Robustly resolves label files across all common layouts:
    * Sibling labels: raw/train/images/*.jpg <-> raw/train/labels/*.txt
    * Parallel folders: raw/images/*.jpg <-> raw/labels/*.txt
    * Co-located: raw/*.jpg <-> raw/*.txt
    * Global stem index fallback
  - Preserves ground-truth bounding box coordinates and ensures single-class
    mapping (class 0: 'pothole').
  - Background (clean road) samples without annotations create valid empty .txt files.

Leakage prevention strategy:
  - Filenames are parsed for sequence/video group keys (e.g. 'road_seq01_frame001.jpg'
    -> group 'road_seq01').
  - Pattern 1: explicit '_frame<digits>' suffix (e.g. 'road_seq01_frame001.jpg' -> 'road_seq01')
  - Pattern 2: trailing digit block >= 2 digits without hyphens (e.g. 'road_seq0001.jpg' -> 'road_seq')
  - Pattern 3: UUID or non-sequence filenames remain individual atomic groups.
  - Entire groups are assigned atomically to exactly one split. No group crosses splits.

Duplicate detection & safety:
  - Exact duplicates: MD5 hash comparison.
  - Near duplicates: 8x8 difference hash (dHash, Hamming distance <= 10).
  - Safety guarantee: Never deletes raw dataset files from source-dir.
  - All exact and near-duplicates are documented in 'duplicates_report.json'.

Usage:
    python ml/scripts/prepare_dataset.py --source-dir ml/datasets/raw_pothole --output-dir ml/datasets/roadguard
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


# ── Exact duplicate detection via MD5 ─────────────────────────────────────────

def get_image_hash(image_path: Path) -> str:
    """Compute MD5 hash of image file for exact duplicate detection."""
    hasher = hashlib.md5()
    with open(image_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


# ── Near-duplicate detection via dHash ────────────────────────────────────────

def compute_dhash(image_path: Path, hash_size: int = 8) -> Optional[int]:
    """
    Compute an 8×8 difference hash (dHash) for near-duplicate detection.

    dHash encodes the direction of horizontal pixel intensity gradients.
    Two images with hamming distance <= 10 out of 64 bits are likely perceptually similar.
    Returns None if Pillow is unavailable or image cannot be decoded.
    """
    try:
        from PIL import Image

        with Image.open(image_path) as img:
            # Resize to (hash_size + 1) × hash_size in greyscale (L)
            img_small = img.convert("L").resize((hash_size + 1, hash_size), Image.LANCZOS)
            pixels = list(img_small.getdata())

        # Compute horizontal gradient: compare adjacent pixels in each row
        dhash_bits = 0
        for row in range(hash_size):
            for col in range(hash_size):
                left  = pixels[row * (hash_size + 1) + col]
                right = pixels[row * (hash_size + 1) + col + 1]
                dhash_bits = (dhash_bits << 1) | (1 if left < right else 0)

        return dhash_bits

    except ImportError:
        return None  # Pillow not installed; gracefully skip dHash
    except Exception:
        return None  # Image read error


def hamming_distance(a: int, b: int) -> int:
    """Count differing bits between two 64-bit integer hashes."""
    return bin(a ^ b).count("1")


# ── Sequence / group key extraction ──────────────────────────────────────────

def extract_group_key(filename: str) -> str:
    """
    Extract a sequence or video group key from a filename.

    Recognizes patterns:
      road_seq01_frame001.jpg -> 'road_seq01'
      IMG_20230410_0001.jpg   -> 'IMG_20230410_'
      road_seq0042.jpg        -> 'road_seq'

    UUIDs and random hashes (containing hyphens) are kept intact as individual groups
    to prevent spurious clustering.
    """
    stem = Path(filename).stem

    # Pattern 1: explicit _frame<digits> suffix
    match = re.match(r"^([a-zA-Z0-9_\-]+?)_frame\d+$", stem)
    if match and len(match.group(1)) > 2:
        return match.group(1)

    # Pattern 2: trailing digit block >= 2 digits, only when prefix has no hyphens
    # (hyphens indicate UUID-like random identifiers)
    match = re.match(r"^([a-zA-Z0-9_]+?)(\d{2,})$", stem)
    if match and len(match.group(1)) > 2 and '-' not in match.group(1):
        return match.group(1)

    # Default: each file is its own group
    return stem


# ── Split partitioning — group-atomic assignment ──────────────────────────────

def assign_groups_to_splits(
    groups: Dict[str, List[Path]],
    train_ratio: float,
    val_ratio: float,
    seed: int,
) -> Dict[str, List[Path]]:
    """
    Deterministically assign groups to train/val/test splits.

    Rules enforced:
    - Every image in a group goes to the same split (atomic group assignment).
    - Splits are assigned sequentially by shuffled group order until target
      image counts are reached; remainder goes to test.
    - No group is ever split across partitions.
    """
    import random
    random.seed(seed)

    group_keys = sorted(groups.keys())
    random.shuffle(group_keys)

    total_images = sum(len(g) for g in groups.values())
    target_train = int(total_images * train_ratio)
    target_val   = int(total_images * val_ratio)

    assignments: Dict[str, List[Path]] = {"train": [], "val": [], "test": []}
    n_train = 0
    n_val   = 0

    for key in group_keys:
        imgs = groups[key]
        if n_train < target_train:
            assignments["train"].extend(imgs)
            n_train += len(imgs)
        elif n_val < target_val:
            assignments["val"].extend(imgs)
            n_val += len(imgs)
        else:
            assignments["test"].extend(imgs)

    return assignments


# ── Pure-logic split helper for unit tests (no filesystem I/O) ────────────────

def split_groups_deterministic(
    groups: Dict[str, List[str]],
    train_ratio: float = 0.70,
    val_ratio:   float = 0.20,
    seed:        int   = 42,
) -> Dict[str, List[str]]:
    """
    Pure-logic group split helper used by automated unit tests.
    Returns dict mapping split -> list of group keys assigned to that split.
    """
    import random
    random.seed(seed)

    group_keys = sorted(groups.keys())
    random.shuffle(group_keys)

    total = sum(len(v) for v in groups.values())
    target_train = int(total * train_ratio)
    target_val   = int(total * val_ratio)

    result: Dict[str, List[str]] = {"train": [], "val": [], "test": []}
    n_train = 0
    n_val   = 0

    for key in group_keys:
        n_imgs = len(groups[key])
        if n_train < target_train:
            result["train"].append(key)
            n_train += n_imgs
        elif n_val < target_val:
            result["val"].append(key)
            n_val += n_imgs
        else:
            result["test"].append(key)

    return result


# ── Label file discovery helper ───────────────────────────────────────────────

def find_label_file(
    img_path: Path,
    source_path: Path,
    label_index: Dict[str, Path],
) -> Optional[Path]:
    """
    Find matching YOLO annotation .txt file for an image across standard layouts:
    1. Roboflow layout: <split>/images/xxx.jpg -> <split>/labels/xxx.txt
    2. Co-located layout: xxx.jpg -> xxx.txt (in same directory)
    3. Flat parallel layout: images/xxx.jpg -> labels/xxx.txt
    4. Global stem index across entire source_path
    """
    label_name = f"{img_path.stem}.txt"

    # Candidate 1: Roboflow sibling 'labels' directory replacing 'images'
    # e.g., raw/train/images/xxx.jpg -> raw/train/labels/xxx.txt
    if img_path.parent.name == "images":
        sibling = img_path.parent.parent / "labels" / label_name
        if sibling.exists():
            return sibling

    # Candidate 2: In same directory as image
    same_dir = img_path.parent / label_name
    if same_dir.exists():
        return same_dir

    # Candidate 3: source_path / labels / label_name
    candidate3 = source_path / "labels" / label_name
    if candidate3.exists():
        return candidate3

    # Candidate 4: Global label index fallback
    if img_path.stem in label_index:
        return label_index[img_path.stem]

    return None


# ── Main dataset preparation entry point ──────────────────────────────────────

def prepare_dataset(
    source_dir: str,
    output_dir: str,
    train_ratio: float = 0.70,
    val_ratio:   float = 0.20,
    test_ratio:  float = 0.10,
    seed:        int   = 42,
    dhash_threshold: int = 10,
) -> Dict[str, int]:
    """
    Organize raw images and labels into train/val/test splits.
    Returns dict mapping split name -> image count.
    """
    source_path = Path(source_dir).resolve()
    output_path = Path(output_dir).resolve()

    if not source_path.exists():
        raise FileNotFoundError(f"Source directory not found: {source_path}")

    print("=" * 70)
    print("RoadGuardAI — Dataset Ingestion & Group-Isolated Split")
    print("=" * 70)
    print(f"Source Directory: {source_path}")
    print(f"Output Directory: {output_path}")
    print(f"Split Ratios:     {int(train_ratio*100)}% Train / {int(val_ratio*100)}% Val / {int(test_ratio*100)}% Test")
    print(f"Random Seed:      {seed}")
    print("=" * 70)

    image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    all_images = sorted([p for p in source_path.rglob("*") if p.is_file() and p.suffix.lower() in image_exts])
    print(f"[INFO] Discovered {len(all_images)} images in source directory.")

    if not all_images:
        print("[WARN] No image files found to prepare.")
        return {"train": 0, "val": 0, "test": 0}

    # Build global index of all .txt files in source_dir for robust label resolution
    all_txt_files = [p for p in source_path.rglob("*.txt") if p.is_file() and not p.name.startswith("README")]
    label_index: Dict[str, Path] = {p.stem: p for p in all_txt_files}
    print(f"[INFO] Discovered {len(all_txt_files)} candidate label (.txt) files.")

    # ── Pass 1: exact duplicate detection via MD5 ────────────────────────────
    groups: Dict[str, List[Path]] = {}
    seen_hashes: Dict[str, Path]  = {}
    exact_duplicate_records: List[Dict[str, str]] = []

    for img_path in all_images:
        md5 = get_image_hash(img_path)
        if md5 in seen_hashes:
            orig = seen_hashes[md5]
            exact_duplicate_records.append({
                "duplicate": str(img_path),
                "original": str(orig),
                "md5": md5,
            })
            print(f"[EXACT-DUP] Duplicate image skipped in output: {img_path.name} (matches {orig.name})")
            continue
        seen_hashes[md5] = img_path
        grp = extract_group_key(img_path.name)
        groups.setdefault(grp, []).append(img_path)

    unique_images = [p for grp in groups.values() for p in grp]
    has_sequence_groups = any(len(v) > 1 for v in groups.values())

    print(f"\n[INFO] {len(groups)} distinct sequence groups identified.")
    print(f"[INFO] {len(unique_images)} unique images retained for partitioning.")
    print(f"[INFO] {len(exact_duplicate_records)} exact duplicates identified (raw files preserved on disk).")

    if not has_sequence_groups:
        print("[NOTE] No multi-frame sequence groups detected from filenames; images will be partitioned individually.")

    # ── Pass 2: near-duplicate scan via dHash (report only, no deletion) ─────
    dhashes: List[Tuple[Path, int]] = []
    dhash_available = False
    for img_path in unique_images:
        dh = compute_dhash(img_path)
        if dh is not None:
            dhash_available = True
            dhashes.append((img_path, dh))

    near_duplicate_records: List[Dict[str, Any]] = []
    if dhash_available and dhashes:
        print("\n[INFO] Scanning for near-duplicate images using 8x8 difference hash (dHash)...")
        for i in range(len(dhashes)):
            for j in range(i + 1, len(dhashes)):
                dist = hamming_distance(dhashes[i][1], dhashes[j][1])
                if dist <= dhash_threshold:
                    near_duplicate_records.append({
                        "image1": str(dhashes[i][0]),
                        "image2": str(dhashes[j][0]),
                        "hamming_distance": dist,
                    })
                    print(f"  [NEAR-DUP] Hamming={dist}/64: {dhashes[i][0].name} ≈ {dhashes[j][0].name}")

        if near_duplicate_records:
            print(f"[WARN] {len(near_duplicate_records)} potential near-duplicate pair(s) flagged for manual review.")
            print("       (These are NOT automatically deleted to prevent accidental loss of valid data).")
        else:
            print("[INFO] Zero near-duplicates found under threshold.")
    else:
        print("[INFO] Near-duplicate scan skipped (Pillow not installed or non-decodeable images).")

    # ── Pass 3: group-atomic split partitioning ──────────────────────────────
    assignments = assign_groups_to_splits(groups, train_ratio, val_ratio, seed)

    # ── Pass 4: write organized output dataset ───────────────────────────────
    for split in ["train", "val", "test"]:
        (output_path / "images" / split).mkdir(parents=True, exist_ok=True)
        (output_path / "labels" / split).mkdir(parents=True, exist_ok=True)

    stats: Dict[str, int] = {}
    copied_labels_count = 0
    clean_background_count = 0

    for split, img_list in assignments.items():
        stats[split] = len(img_list)
        for img_path in img_list:
            # Copy image
            dest_img = output_path / "images" / split / img_path.name
            shutil.copy2(img_path, dest_img)

            # Locate and copy/remap label
            found_label = find_label_file(img_path, source_path, label_index)
            dest_label = output_path / "labels" / split / f"{img_path.stem}.txt"

            if found_label and found_label.exists():
                with open(found_label, "r", encoding="utf-8", errors="ignore") as f:
                    lines = [l.strip() for l in f if l.strip()]

                if lines:
                    # Validate and ensure class ID 0 for single-class pothole model
                    remapped_lines = []
                    for line in lines:
                        parts = line.split()
                        if len(parts) >= 5:
                            # Force class 0 for pothole
                            parts[0] = "0"
                            remapped_lines.append(" ".join(parts) + "\n")

                    with open(dest_label, "w", encoding="utf-8") as f:
                        f.writelines(remapped_lines)
                    copied_labels_count += 1
                else:
                    dest_label.touch()
                    clean_background_count += 1
            else:
                # Background / negative sample (clean road without potholes)
                dest_label.touch()
                clean_background_count += 1

    # ── Pass 5: generate dataset.yaml ─────────────────────────────────────────
    dataset_yaml = output_path / "dataset.yaml"
    with open(dataset_yaml, "w", encoding="utf-8") as f:
        f.write("# RoadGuardAI — Ultralytics YOLOv8 Dataset Specification\n")
        f.write(f"path: {output_path.as_posix()}\n")
        f.write("train: images/train\n")
        f.write("val: images/val\n")
        f.write("test: images/test\n\n")
        f.write("names:\n")
        f.write("  0: pothole\n")

    # ── Pass 6: generate duplicates_report.json ──────────────────────────────
    dup_report_path = output_path / "duplicates_report.json"
    with open(dup_report_path, "w", encoding="utf-8") as f:
        json.dump({
            "source_dir": str(source_path),
            "output_dir": str(output_path),
            "total_raw_images": len(all_images),
            "unique_images": len(unique_images),
            "exact_duplicates": exact_duplicate_records,
            "near_duplicates": near_duplicate_records,
        }, f, indent=2)

    print("\n" + "=" * 70)
    print("Dataset Preparation Completed Successfully")
    print("=" * 70)
    print(f"  Train:        {stats['train']:4d} images")
    print(f"  Val:          {stats['val']:4d} images")
    print(f"  Test:         {stats['test']:4d} images")
    print(f"  Annotated:    {copied_labels_count:4d} images with bounding boxes")
    print(f"  Background:   {clean_background_count:4d} images without damage (clean road)")
    print(f"  Dataset Spec: {dataset_yaml}")
    print(f"  Audit Report: {dup_report_path}")
    print("=" * 70)

    return stats


def main():
    parser = argparse.ArgumentParser(description="Prepare and split RoadGuard dataset with group isolation")
    parser.add_argument("--source-dir", required=True, help="Path to raw image/label directory")
    parser.add_argument("--output-dir", default="ml/datasets/roadguard", help="Output YOLO dataset path")
    parser.add_argument("--train-ratio", type=float, default=0.70, help="Train split ratio (default: 0.70)")
    parser.add_argument("--val-ratio", type=float, default=0.20, help="Val split ratio (default: 0.20)")
    parser.add_argument("--test-ratio", type=float, default=0.10, help="Test split ratio (default: 0.10)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for deterministic split")
    parser.add_argument("--dhash-threshold", type=int, default=10,
                        help="Hamming distance threshold for near-duplicate flagging (default: 10/64)")
    args = parser.parse_args()

    prepare_dataset(
        source_dir=args.source_dir,
        output_dir=args.output_dir,
        train_ratio=args.train_ratio,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        seed=args.seed,
        dhash_threshold=args.dhash_threshold,
    )


if __name__ == "__main__":
    main()
