"""
RoadGuard — Pothole Dataset Download & Fine-tune Script
=======================================================
Downloads a pothole dataset from Roboflow Universe (open license)
and fine-tunes YOLOv8n for pothole detection.

Dataset: "Pothole Detection" by Roboflow
License: CC BY 4.0
Source: https://universe.roboflow.com/roboflow-100/pothole-detection-gwyag

Usage:
    pip install roboflow
    python ml/scripts/train.py --epochs 50 --imgsz 320

On CPU this will take approximately 2-4 hours for 50 epochs.
For faster results, set --epochs 10 (about 30 minutes on CPU).

After training, run export_onnx.py to export the best.pt to ONNX.
"""

import argparse
import os
import sys
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def download_dataset(api_key: str | None, workspace: str, project: str, version: int, output_dir: str):
    try:
        from roboflow import Roboflow
    except ImportError:
        print("[ERROR] roboflow not installed. Run: pip install roboflow")
        sys.exit(1)

    if api_key:
        rf = Roboflow(api_key=api_key)
    else:
        rf = Roboflow()  # Uses cached credentials if available

    project_obj = rf.workspace(workspace).project(project)
    dataset = project_obj.version(version).download("yolov8", location=output_dir)
    print(f"[OK] Dataset downloaded to: {output_dir}")
    return dataset.location


def train(
    data_yaml: str,
    epochs: int = 50,
    imgsz: int = 320,
    batch: int = 8,
    device: str = "cpu",
    output_name: str = "pothole_yolov8n",
) -> str:
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERROR] ultralytics not installed. Run: pip install ultralytics")
        sys.exit(1)

    print(f"[INFO] Training YOLOv8n for {epochs} epochs on {device}")
    print(f"[INFO] Data: {data_yaml}")
    print(f"[INFO] Image size: {imgsz}x{imgsz}, Batch: {batch}")

    model = YOLO("yolov8n.pt")  # Start from COCO pretrained weights
    results = model.train(
        data=data_yaml,
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        device=device,
        name=output_name,
        project="ml/runs",
        exist_ok=True,
        verbose=True,
        save=True,
        save_period=10,
        patience=20,
        optimizer="AdamW",
        lr0=0.001,
        warmup_epochs=3,
        cos_lr=True,
        augment=True,
        degrees=5.0,
        fliplr=0.5,
        mosaic=0.5,
        mixup=0.0,
        cache=False,  # Disable cache for CPU to save memory
    )

    best_pt = Path(f"ml/runs/{output_name}/weights/best.pt")
    print(f"[OK] Training complete. Best weights: {best_pt}")

    # Copy best.pt to models directory
    models_dir = Path("ml/models")
    models_dir.mkdir(parents=True, exist_ok=True)
    import shutil
    dest = models_dir / "best.pt"
    shutil.copy2(best_pt, dest)
    print(f"[OK] Best weights copied to: {dest}")

    return str(dest)


def main():
    parser = argparse.ArgumentParser(description="Download dataset and fine-tune YOLOv8n for pothole detection")
    parser.add_argument("--api-key", default=None, help="Roboflow API key (optional if already authenticated)")
    parser.add_argument("--workspace", default="roboflow-100", help="Roboflow workspace")
    parser.add_argument("--project", default="pothole-detection-gwyag", help="Roboflow project slug")
    parser.add_argument("--version", type=int, default=2, help="Dataset version")
    parser.add_argument("--dataset-dir", default="ml/datasets/pothole", help="Where to save the dataset")
    parser.add_argument("--epochs", type=int, default=50, help="Training epochs (50 default, ~3h on CPU)")
    parser.add_argument("--imgsz", type=int, default=320, help="Image size")
    parser.add_argument("--batch", type=int, default=8, help="Batch size")
    parser.add_argument("--device", default="cpu", help="Device: cpu or 0 (CUDA GPU index)")
    parser.add_argument("--skip-download", action="store_true", help="Skip dataset download (dataset already present)")
    parser.add_argument("--data-yaml", default=None, help="Path to data.yaml (required with --skip-download)")
    args = parser.parse_args()

    if args.skip_download:
        if not args.data_yaml:
            print("[ERROR] --data-yaml required with --skip-download")
            sys.exit(1)
        data_yaml = args.data_yaml
    else:
        data_dir = download_dataset(
            args.api_key,
            args.workspace,
            args.project,
            args.version,
            args.dataset_dir,
        )
        data_yaml = str(Path(data_dir) / "data.yaml")

    best_pt = train(
        data_yaml=data_yaml,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
    )

    print(f"\n[NEXT STEP] Run ONNX export:")
    print(f"  python ml/scripts/export_onnx.py --weights {best_pt} --output ml/models/pothole_yolov8n.onnx")


if __name__ == "__main__":
    main()
