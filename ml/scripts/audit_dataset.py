"""
RoadGuardAI — Dataset Audit & Integrity Verification Script
===========================================================
Performs an exhaustive audit on a YOLO detection dataset:
1. Validates image readability, format headers, and corrupt files.
2. Checks image-label parity (flags missing labels and orphan label files).
3. Validates YOLO label syntax, coordinate bounds [0.0, 1.0], and class IDs.
4. Detects exact duplicates within splits (via MD5 hashing).
5. Detects cross-split data leakage between train, val, and test splits.
6. Reports class distributions, box counts, and background sample counts.
7. Emits structured 'audit_report.json' for automated pipeline gates.

Usage:
    python ml/scripts/audit_dataset.py --dataset-dir ml/datasets/roadguard
"""

import argparse
import hashlib
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


class DatasetAuditor:
    def __init__(self, dataset_dir: str, num_classes: int = 1):
        self.root = Path(dataset_dir).resolve()
        self.num_classes = num_classes
        self.image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

        # Audit findings
        self.splits = ["train", "val", "test"]
        self.image_counts: Dict[str, int] = defaultdict(int)
        self.label_counts: Dict[str, int] = defaultdict(int)
        self.missing_labels: Dict[str, List[str]] = defaultdict(list)
        self.orphan_labels: Dict[str, List[str]] = defaultdict(list)
        self.corrupt_images: Dict[str, List[str]] = defaultdict(list)
        self.empty_annotations: Dict[str, int] = defaultdict(int)
        self.invalid_annotations: Dict[str, List[Tuple[str, str]]] = defaultdict(list)
        self.class_counts: Dict[str, Counter] = defaultdict(Counter)
        self.box_counts: Dict[str, int] = defaultdict(int)

        # Hash tracking for leakage & duplicates
        self.image_hashes: Dict[str, Dict[str, Path]] = {s: {} for s in self.splits}
        self.exact_duplicates_within_split: Dict[str, List[Tuple[str, str]]] = defaultdict(list)
        self.leakage_between_splits: List[Tuple[str, str, str, str]] = []

    def compute_file_hash(self, path: Path) -> str:
        """Compute MD5 hash of an image for integrity and duplicate tracking."""
        hasher = hashlib.md5()
        with open(path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        return hasher.hexdigest()

    def check_image_readable(self, path: Path) -> bool:
        """Verify image header integrity and basic readability."""
        try:
            if not path.exists() or path.stat().st_size == 0:
                return False

            with open(path, "rb") as f:
                header = f.read(32)

            if len(header) < 4:
                return False

            suffix = path.suffix.lower()
            # JPEG magic bytes: FF D8
            if suffix in [".jpg", ".jpeg"] and not header.startswith(b"\xff\xd8"):
                return False
            # PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
            if suffix == ".png" and not header.startswith(b"\x89PNG\r\n\x1a\n"):
                return False
            # BMP magic bytes: BM
            if suffix == ".bmp" and not header.startswith(b"BM"):
                return False
            # WebP magic bytes: RIFF....WEBP
            if suffix == ".webp" and not (header.startswith(b"RIFF") and b"WEBP" in header[:16]):
                return False

            return True
        except Exception:
            return False

    def validate_annotation_line(self, line: str, file_name: str) -> Optional[Tuple[int, float, float, float, float]]:
        """
        Validate single YOLO annotation line format:
        <class_id> <center_x> <center_y> <width> <height>
        """
        parts = line.strip().split()
        if len(parts) != 5:
            return None

        try:
            cls_id = int(parts[0])
            cx = float(parts[1])
            cy = float(parts[2])
            w = float(parts[3])
            h = float(parts[4])
        except ValueError:
            return None

        # Validate class ID in range [0, num_classes)
        if not (0 <= cls_id < self.num_classes):
            return None

        # Validate normalized coordinate bounds
        if not (0.0 <= cx <= 1.0 and 0.0 <= cy <= 1.0 and 0.0 < w <= 1.0 and 0.0 < h <= 1.0):
            return None

        # Validate box corners with slight tolerance for edges
        x1 = cx - w / 2.0
        y1 = cy - h / 2.0
        x2 = cx + w / 2.0
        y2 = cy + h / 2.0

        if x1 < -0.05 or y1 < -0.05 or x2 > 1.05 or y2 > 1.05:
            return None

        return (cls_id, cx, cy, w, h)

    def run_audit(self) -> bool:
        print("=" * 70)
        print(f"RoadGuardAI — Comprehensive Dataset Integrity Audit")
        print("=" * 70)
        print(f"Dataset Root:    {self.root}")
        print(f"Target Classes:  {self.num_classes} (0: 'pothole')")
        print("=" * 70)

        if not self.root.exists():
            print(f"[ERROR] Dataset directory not found: {self.root}")
            return False

        has_any_data = False

        for split in self.splits:
            img_dir = self.root / "images" / split
            lbl_dir = self.root / "labels" / split

            if not img_dir.exists():
                print(f"[WARN] Split directory missing: images/{split}")
                continue

            has_any_data = True
            images = [p for p in img_dir.iterdir() if p.is_file() and p.suffix.lower() in self.image_exts]
            labels = [p for p in lbl_dir.iterdir() if p.is_file() and p.suffix.lower() == ".txt"] if lbl_dir.exists() else []

            self.image_counts[split] = len(images)
            self.label_counts[split] = len(labels)

            lbl_stem_map = {lbl.stem: lbl for lbl in labels}
            img_stem_map = {img.stem: img for img in images}

            # 1. Inspect all images in this split
            for img_path in images:
                if not self.check_image_readable(img_path):
                    self.corrupt_images[split].append(img_path.name)
                    continue

                # Check duplicate within split
                file_hash = self.compute_file_hash(img_path)
                if file_hash in self.image_hashes[split]:
                    prev_file = self.image_hashes[split][file_hash]
                    self.exact_duplicates_within_split[split].append((img_path.name, prev_file.name))
                else:
                    self.image_hashes[split][file_hash] = img_path

                # 2. Check image-label parity
                if img_path.stem not in lbl_stem_map:
                    self.missing_labels[split].append(img_path.name)
                else:
                    lbl_file = lbl_stem_map[img_path.stem]
                    with open(lbl_file, "r", encoding="utf-8", errors="ignore") as f:
                        lines = [l.strip() for l in f if l.strip()]

                    if not lines:
                        self.empty_annotations[split] += 1
                    else:
                        for line in lines:
                            parsed = self.validate_annotation_line(line, lbl_file.name)
                            if parsed is None:
                                self.invalid_annotations[split].append((lbl_file.name, line))
                            else:
                                cls_id, cx, cy, w, h = parsed
                                self.class_counts[split][cls_id] += 1
                                self.box_counts[split] += 1

            # 3. Check for orphan labels without corresponding image
            for lbl_path in labels:
                if lbl_path.stem not in img_stem_map:
                    self.orphan_labels[split].append(lbl_path.name)

        if not has_any_data:
            print("[FAIL] No valid split directories (images/train, images/val, images/test) found.")
            return False

        # 4. Check cross-split data leakage (MD5 matches between different splits)
        for i, s1 in enumerate(self.splits):
            for s2 in self.splits[i + 1:]:
                for h, p1 in self.image_hashes[s1].items():
                    if h in self.image_hashes[s2]:
                        p2 = self.image_hashes[s2][h]
                        self.leakage_between_splits.append((s1, p1.name, s2, p2.name))

        self.print_report()
        self.save_report()
        return self.is_healthy()

    def print_report(self):
        print("\n" + "-" * 70)
        print("DATASET AUDIT REPORT")
        print("-" * 70)

        total_images = sum(self.image_counts.values())
        total_boxes  = sum(self.box_counts.values())
        print(f"Total Images:            {total_images}")
        print(f"Total Bounding Boxes:    {total_boxes}")

        for split in self.splits:
            count       = self.image_counts[split]
            boxes       = self.box_counts[split]
            empty       = self.empty_annotations[split]
            corrupt     = len(self.corrupt_images[split])
            missing_lbl = len(self.missing_labels[split])
            orphan_lbl  = len(self.orphan_labels[split])
            invalid     = len(self.invalid_annotations[split])
            dups        = len(self.exact_duplicates_within_split[split])

            print(f"\n--- Split: {split.upper()} ---")
            print(f"  Images Count:          {count}")
            print(f"  Bounding Boxes:        {boxes}")
            print(f"  Clean / Background:    {empty} (valid 0-box samples)")
            print(f"  Corrupt Images:        {corrupt}")
            print(f"  Missing Labels:        {missing_lbl}")
            print(f"  Orphan Labels:         {orphan_lbl}")
            print(f"  Invalid Annotations:   {invalid}")
            print(f"  Internal Duplicates:   {dups}")
            print(f"  Class Breakdown:       {dict(self.class_counts[split])}")

        print("\n--- Cross-Split Data Leakage Audit ---")
        if self.leakage_between_splits:
            print(f"  [CRITICAL RISK] Detected {len(self.leakage_between_splits)} image(s) shared across splits:")
            for s1, f1, s2, f2 in self.leakage_between_splits[:10]:
                print(f"    * {s1}/{f1} == {s2}/{f2}")
        else:
            print("  [OK] Zero cross-split image leakage detected across train, val, and test.")

        print("-" * 70)

    def is_healthy(self) -> bool:
        total_corrupt = sum(len(c) for c in self.corrupt_images.values())
        total_missing = sum(len(m) for m in self.missing_labels.values())
        total_orphan  = sum(len(o) for o in self.orphan_labels.values())
        total_invalid = sum(len(inv) for inv in self.invalid_annotations.values())
        has_leakage   = len(self.leakage_between_splits) > 0

        # Check split presence
        missing_splits = [s for s in self.splits if self.image_counts[s] == 0]
        if missing_splits:
            print(f"[FAIL] Incomplete splits: missing data in {missing_splits}.")
            return False

        if total_corrupt > 0:
            print(f"[FAIL] Found {total_corrupt} corrupt image file(s).")
            return False

        if total_missing > 0:
            print(f"[FAIL] Found {total_missing} image(s) with missing label files.")
            return False

        if total_orphan > 0:
            print(f"[FAIL] Found {total_orphan} orphan label file(s) with no image.")
            return False

        if total_invalid > 0:
            print(f"[FAIL] Found {total_invalid} invalid annotation lines (syntax/bounds).")
            return False

        if has_leakage:
            print(f"[FAIL] Found cross-split data leakage ({len(self.leakage_between_splits)} pair(s)).")
            return False

        print("[PASS] Dataset integrity audit passed with 0 defects.")
        return True

    def save_report(self):
        report_data: Dict[str, Any] = {
            "dataset_dir": str(self.root),
            "num_classes": self.num_classes,
            "total_images": sum(self.image_counts.values()),
            "total_boxes": sum(self.box_counts.values()),
            "splits": {
                s: {
                    "images": self.image_counts[s],
                    "labels": self.label_counts[s],
                    "boxes": self.box_counts[s],
                    "background_images": self.empty_annotations[s],
                    "corrupt_images": self.corrupt_images[s],
                    "missing_labels": self.missing_labels[s],
                    "orphan_labels": self.orphan_labels[s],
                    "invalid_annotations": [f"{fn}: {line}" for fn, line in self.invalid_annotations[s]],
                    "duplicates": [f"{d1} == {d2}" for d1, d2 in self.exact_duplicates_within_split[s]],
                    "class_distribution": dict(self.class_counts[s]),
                }
                for s in self.splits
            },
            "leakage_pairs": [
                {"split1": s1, "file1": f1, "split2": s2, "file2": f2}
                for s1, f1, s2, f2 in self.leakage_between_splits
            ],
            "audit_passed": (
                sum(len(c) for c in self.corrupt_images.values()) == 0
                and sum(len(m) for m in self.missing_labels.values()) == 0
                and sum(len(o) for o in self.orphan_labels.values()) == 0
                and sum(len(inv) for inv in self.invalid_annotations.values()) == 0
                and len(self.leakage_between_splits) == 0
                and all(self.image_counts[s] > 0 for s in self.splits)
            ),
        }

        report_file = self.root / "audit_report.json"
        try:
            with open(report_file, "w", encoding="utf-8") as f:
                json.dump(report_data, f, indent=2)
            print(f"[OK] Audit report written to: {report_file}")
        except Exception as e:
            print(f"[WARN] Failed to write audit report: {e}")


def main():
    parser = argparse.ArgumentParser(description="Audit YOLO dataset integrity and data leakage")
    parser.add_argument("--dataset-dir", default="ml/datasets/roadguard", help="Path to dataset root")
    parser.add_argument("--num-classes", type=int, default=1, help="Expected number of classes (default: 1)")
    args = parser.parse_args()

    auditor = DatasetAuditor(args.dataset_dir, num_classes=args.num_classes)
    success = auditor.run_audit()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
