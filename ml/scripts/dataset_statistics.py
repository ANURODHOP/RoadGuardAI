"""
RoadGuardAI — Dataset Statistics Generator
==========================================
Generates detailed quantitative statistics from a YOLO detection dataset:
- Image count and bounding box counts per split (train, val, test).
- Clean road (background) samples vs damaged road samples.
- Bounding-box scale distribution (small, medium, large according to COCO definitions).
- Bounding-box aspect ratio distribution (wide, square, tall).
- Bounding-box density distribution per image (0, 1, 2, 3, 4+ potholes).
- Exports structured 'dataset_statistics.json' for reproducible research reporting.

Usage:
    python ml/scripts/dataset_statistics.py --dataset-dir ml/datasets/roadguard
"""

import argparse
import json
import math
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def generate_statistics(dataset_dir: str, target_imgsz: int = 320, save_json: bool = True) -> Dict[str, Any]:
    root = Path(dataset_dir).resolve()
    if not root.exists():
        print(f"[ERROR] Directory not found: {root}")
        return {}

    splits = ["train", "val", "test"]
    image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

    split_stats: Dict[str, Dict[str, Any]] = {}
    total_images = 0
    total_boxes = 0
    total_clean_images = 0
    total_damaged_images = 0

    overall_box_scales = {
        "small (< 32^2 px)": 0,
        "medium (32^2 - 96^2 px)": 0,
        "large (> 96^2 px)": 0,
    }
    overall_box_aspects = {
        "wide (w/h > 1.2)": 0,
        "square (0.8 <= w/h <= 1.2)": 0,
        "tall (w/h < 0.8)": 0,
    }
    overall_boxes_per_image = Counter()

    for split in splits:
        img_dir = root / "images" / split
        lbl_dir = root / "labels" / split

        if not img_dir.exists():
            continue

        images = [p for p in img_dir.iterdir() if p.is_file() and p.suffix.lower() in image_exts]
        n_images = len(images)
        total_images += n_images

        split_boxes = 0
        split_clean = 0
        split_damaged = 0
        split_scales = {"small": 0, "medium": 0, "large": 0}

        for img in images:
            lbl_file = lbl_dir / f"{img.stem}.txt"
            if not lbl_file.exists():
                split_clean += 1
                overall_boxes_per_image[0] += 1
                continue

            with open(lbl_file, "r", encoding="utf-8", errors="ignore") as f:
                lines = [l.strip() for l in f if l.strip()]

            n_boxes = len(lines)
            overall_boxes_per_image[n_boxes] += 1
            split_boxes += n_boxes
            total_boxes += n_boxes

            if n_boxes == 0:
                split_clean += 1
            else:
                split_damaged += 1

            for line in lines:
                parts = line.split()
                if len(parts) >= 5:
                    try:
                        w_norm = float(parts[3])
                        h_norm = float(parts[4])
                        w_px = w_norm * target_imgsz
                        h_px = h_norm * target_imgsz
                        area = w_px * h_px

                        # Scale classification (COCO standard relative to target_imgsz)
                        if area < 32 * 32:
                            overall_box_scales["small (< 32^2 px)"] += 1
                            split_scales["small"] += 1
                        elif area <= 96 * 96:
                            overall_box_scales["medium (32^2 - 96^2 px)"] += 1
                            split_scales["medium"] += 1
                        else:
                            overall_box_scales["large (> 96^2 px)"] += 1
                            split_scales["large"] += 1

                        # Aspect ratio classification
                        if h_px > 0:
                            ratio = w_px / h_px
                            if ratio > 1.2:
                                overall_box_aspects["wide (w/h > 1.2)"] += 1
                            elif ratio >= 0.8:
                                overall_box_aspects["square (0.8 <= w/h <= 1.2)"] += 1
                            else:
                                overall_box_aspects["tall (w/h < 0.8)"] += 1
                    except ValueError:
                        pass

        total_clean_images += split_clean
        total_damaged_images += split_damaged

        split_stats[split] = {
            "images": n_images,
            "boxes": split_boxes,
            "clean_images": split_clean,
            "damaged_images": split_damaged,
            "avg_boxes_per_image": round(split_boxes / max(n_images, 1), 2),
            "scale_distribution": split_scales,
        }

    # Print report
    print("=" * 70)
    print(f"RoadGuardAI — Dataset Quantitative Statistics (Normalized to {target_imgsz}x{target_imgsz})")
    print("=" * 70)
    print(f"Dataset Root:             {root}")
    print(f"Total Images Analyzed:    {total_images}")
    print(f"Total Bounding Boxes:     {total_boxes}")
    if total_images > 0:
        print(f"Average Boxes / Image:    {total_boxes / total_images:.2f}")
        print(f"Annotated Damaged Images: {total_damaged_images} ({total_damaged_images / total_images * 100:.1f}%)")
        print(f"Clean Background Images:  {total_clean_images} ({total_clean_images / total_images * 100:.1f}%)")

    print("\n--- Split-by-Split Breakdown ---")
    for s, data in split_stats.items():
        print(f"  {s.upper():5s}: {data['images']:4d} images | {data['boxes']:4d} boxes | "
              f"avg {data['avg_boxes_per_image']:.2f} boxes/img (Damaged: {data['damaged_images']}, Clean: {data['clean_images']})")

    print("\n--- Bounding Box Scale Distribution (COCO Metric) ---")
    for size_cat, count in overall_box_scales.items():
        pct = (count / total_boxes * 100) if total_boxes > 0 else 0.0
        print(f"  {size_cat:26s}: {count:5d} ({pct:5.1f}%)")

    print("\n--- Bounding Box Geometry (Aspect Ratio) ---")
    for aspect_cat, count in overall_box_aspects.items():
        pct = (count / total_boxes * 100) if total_boxes > 0 else 0.0
        print(f"  {aspect_cat:26s}: {count:5d} ({pct:5.1f}%)")

    print("\n--- Potholes Density Frequency (Per Image) ---")
    for count, img_count in sorted(overall_boxes_per_image.items()):
        pct = (img_count / total_images * 100) if total_images > 0 else 0.0
        label = "clean road" if count == 0 else f"{count} pothole(s)"
        print(f"  {label:18s}: {img_count:4d} images ({pct:5.1f}%)")
    print("=" * 70)

    report_dict: Dict[str, Any] = {
        "dataset_dir": str(root),
        "target_imgsz": target_imgsz,
        "total_images": total_images,
        "total_boxes": total_boxes,
        "damaged_images": total_damaged_images,
        "clean_images": total_clean_images,
        "avg_boxes_per_image": round(total_boxes / max(total_images, 1), 2) if total_images else 0,
        "splits": split_stats,
        "scale_distribution": overall_box_scales,
        "aspect_distribution": overall_box_aspects,
        "density_distribution": {str(k): v for k, v in sorted(overall_boxes_per_image.items())},
    }

    if save_json:
        out_file = root / "dataset_statistics.json"
        try:
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(report_dict, f, indent=2)
            print(f"[OK] Structured statistics written to: {out_file}")
        except Exception as e:
            print(f"[WARN] Failed to write statistics JSON: {e}")

    return report_dict


def main():
    parser = argparse.ArgumentParser(description="Generate quantitative YOLO dataset metrics")
    parser.add_argument("--dataset-dir", default="ml/datasets/roadguard", help="Dataset root directory")
    parser.add_argument("--imgsz", type=int, default=320, help="Target model input size (default: 320)")
    parser.add_argument("--no-json", action="store_true", help="Do not save dataset_statistics.json")
    args = parser.parse_args()

    generate_statistics(args.dataset_dir, target_imgsz=args.imgsz, save_json=not args.no_json)


if __name__ == "__main__":
    main()
