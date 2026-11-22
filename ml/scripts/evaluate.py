"""
RoadGuardAI — Standalone Model Evaluation Script
================================================
Evaluates a trained YOLOv8 model checkpoint on a specific dataset split
(typically the held-out 'test' split) and generates a structured evaluation report.

Key metrics reported:
- Precision (P)
- Recall (R)
- mAP@0.5
- mAP@0.5:0.95
- Per-class metrics
- Inference speed (preprocess, inference, postprocess latency)

Usage:
    # Evaluate best.pt on held-out test split
    python ml/scripts/evaluate.py --weights ml/models/best.pt --data ml/datasets/roadguard/dataset.yaml --split test

    # Evaluate with specific batch size and device
    python ml/scripts/evaluate.py --weights ml/models/best.pt --split test --device 0 --batch 16
"""

import argparse
import datetime
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def evaluate(
    weights: str,
    data: str,
    split: str = "test",
    imgsz: int = 320,
    batch: int = 8,
    device: str = "cpu",
    output_dir: str = "ml/runs/eval_test",
) -> Dict[str, Any]:
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERROR] ultralytics not installed. Run: pip install ultralytics")
        sys.exit(1)

    weights_path = Path(weights)
    if not weights_path.exists():
        print(f"[ERROR] Weights file not found: {weights_path}")
        sys.exit(1)

    data_path = Path(data)
    if not data_path.exists():
        print(f"[ERROR] Dataset configuration file not found: {data_path}")
        sys.exit(1)

    print("=" * 80)
    print("RoadGuardAI — Model Evaluation")
    print("=" * 80)
    print(f"Weights:      {weights_path}")
    print(f"Dataset:      {data_path}")
    print(f"Split:        {split}")
    print(f"Image Size:   {imgsz}x{imgsz}")
    print(f"Device:       {device}")
    print(f"Output:       {output_dir}")
    print("=" * 80)

    model = YOLO(str(weights_path))

    results = model.val(
        data=str(data_path),
        split=split,
        imgsz=imgsz,
        batch=batch,
        device=device,
        plots=True,
        project=str(Path(output_dir).parent),
        name=Path(output_dir).name,
        exist_ok=True,
    )

    precision = float(getattr(results.box, "mp", 0.0))
    recall = float(getattr(results.box, "mr", 0.0))
    map50 = float(getattr(results.box, "map50", 0.0))
    map50_95 = float(getattr(results.box, "map", 0.0))
    fitness = float(getattr(results, "fitness", 0.0))
    speed = getattr(results, "speed", {})

    total_latency_ms = sum(speed.values()) if speed else 0.0
    fps = 1000.0 / total_latency_ms if total_latency_ms > 0 else 0.0

    print("\n" + "=" * 80)
    print(f"RoadGuardAI — {split.upper()} Evaluation Results")
    print("=" * 80)
    print(f"  Precision (P):       {precision:.4f} ({precision * 100:.1f}%)")
    print(f"  Recall (R):          {recall:.4f} ({recall * 100:.1f}%)")
    print(f"  mAP@0.5:             {map50:.4f} ({map50 * 100:.1f}%)")
    print(f"  mAP@0.5:0.95:        {map50_95:.4f} ({map50_95 * 100:.1f}%)")
    print(f"  Overall Fitness:     {fitness:.4f}")
    if speed:
        print("\nSpeed Benchmarks (per image):")
        print(f"  Pre-process:         {speed.get('preprocess', 0.0):.2f} ms")
        print(f"  Inference:           {speed.get('inference', 0.0):.2f} ms")
        print(f"  Post-process:        {speed.get('postprocess', 0.0):.2f} ms")
        print(f"  Total Latency:       {total_latency_ms:.2f} ms (~{fps:.1f} FPS)")
    print("=" * 80)

    report: Dict[str, Any] = {
        "timestamp_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "weights": str(weights_path),
        "data_yaml": str(data_path),
        "split": split,
        "imgsz": imgsz,
        "batch": batch,
        "device": device,
        "metrics": {
            "precision": precision,
            "recall": recall,
            "map50": map50,
            "map50_95": map50_95,
            "fitness": fitness,
        },
        "speed_ms": speed,
        "total_latency_ms": round(total_latency_ms, 2),
        "estimated_fps": round(fps, 1),
    }

    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    report_file = out_path / "evaluation_report.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"[OK] Structured evaluation report written to: {report_file}")
    return report


def main():
    parser = argparse.ArgumentParser(description="Evaluate YOLOv8 pothole detection model")
    parser.add_argument("--weights", default="ml/models/best.pt", help="Path to model weights (.pt)")
    parser.add_argument("--data", default="ml/datasets/roadguard/dataset.yaml", help="Path to dataset YAML")
    parser.add_argument("--split", default="test", choices=["train", "val", "test"], help="Dataset split")
    parser.add_argument("--imgsz", type=int, default=320, help="Input image dimension (default: 320)")
    parser.add_argument("--batch", type=int, default=8, help="Batch size (default: 8)")
    parser.add_argument("--device", default="cpu", help="Device ('cpu', '0', 'cuda:0')")
    parser.add_argument("--output-dir", default="ml/runs/eval_test", help="Report output directory")

    args = parser.parse_args()
    evaluate(
        weights=args.weights,
        data=args.data,
        split=args.split,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        output_dir=args.output_dir,
    )


if __name__ == "__main__":
    main()
