"""
RoadGuard — Pothole Model Download Script
=========================================
Downloads the best available pothole-detection model weights from
Roboflow Universe for use in RoadGuard.

Dataset: "Pothole Detection" by Roboflow 100
License: CC BY 4.0
Source: https://universe.roboflow.com/roboflow-100/pothole-detection-gwyag

Usage:
    python ml/scripts/download_model.py

After running, execute:
    python ml/scripts/export_onnx.py --weights ml/models/best.pt --output ml/models/pothole_yolov8n.onnx
"""

import os
import sys
import shutil
from pathlib import Path


def download_and_train_minimal():
    """
    Download pothole dataset and train YOLOv8n for 30 epochs on CPU.
    This takes about 1-2 hours on CPU. For faster results, reduce epochs.
    """
    try:
        from roboflow import Roboflow
    except ImportError:
        print("[ERROR] roboflow not installed. Run: pip install roboflow")
        sys.exit(1)

    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERROR] ultralytics not installed.")
        sys.exit(1)

    output_dir = Path("ml/models")
    output_dir.mkdir(parents=True, exist_ok=True)
    dataset_dir = Path("ml/datasets/pothole")

    print("=" * 60)
    print("RoadGuard — Pothole Model Preparation")
    print("=" * 60)

    # Check if already have trained weights
    existing_pt = output_dir / "best.pt"
    if existing_pt.exists():
        print(f"[INFO] Found existing weights: {existing_pt}")
        print("[INFO] Skipping download and training. Delete ml/models/best.pt to retrain.")
        return str(existing_pt)

    print("\n[Step 1] Downloading pothole dataset from Roboflow...")
    print("  Dataset: Roboflow 100 - Pothole Detection (CC BY 4.0)")
    print("  URL: https://universe.roboflow.com/roboflow-100/pothole-detection-gwyag")

    # Roboflow public dataset - no API key needed for RF100
    try:
        rf = Roboflow(api_key=os.getenv("ROBOFLOW_API_KEY", ""))
        project = rf.workspace("roboflow-100").project("pothole-detection-gwyag")
        dataset = project.version(2).download("yolov8", location=str(dataset_dir))
        data_yaml = str(Path(dataset.location) / "data.yaml")
        print(f"[OK] Dataset at: {data_yaml}")
    except Exception as e:
        print(f"[WARN] Roboflow download failed: {e}")
        print("[INFO] Falling back to manual dataset preparation instructions...")
        print_manual_instructions()
        return use_coco_fallback(output_dir)

    print(f"\n[Step 2] Fine-tuning YOLOv8n on pothole dataset...")
    print("  Epochs: 30 (CPU-optimized, ~1-2 hours)")
    print("  Image size: 320x320")
    print("  This gives better pothole accuracy than COCO-pretrained yolov8n")

    model = YOLO("yolov8n.pt")
    results = model.train(
        data=data_yaml,
        epochs=30,
        imgsz=320,
        batch=8,
        device="cpu",
        name="pothole_yolov8n",
        project="ml/runs",
        exist_ok=True,
        patience=10,
        optimizer="AdamW",
        lr0=0.001,
        cos_lr=True,
        augment=True,
        degrees=5.0,
        fliplr=0.5,
        mosaic=0.5,
        cache=False,
        verbose=False,  # Less output
    )

    best_pt = Path("ml/runs/pothole_yolov8n/weights/best.pt")
    if best_pt.exists():
        shutil.copy2(best_pt, output_dir / "best.pt")
        print(f"\n[OK] Training complete. Weights: {output_dir / 'best.pt'}")
        return str(output_dir / "best.pt")
    else:
        print("[WARN] Training completed but best.pt not found. Using last.pt")
        last_pt = Path("ml/runs/pothole_yolov8n/weights/last.pt")
        if last_pt.exists():
            shutil.copy2(last_pt, output_dir / "best.pt")
        return str(output_dir / "best.pt")


def use_coco_fallback(output_dir: Path) -> str:
    """
    Use COCO-pretrained yolov8n as fallback.
    This is less accurate for potholes but works immediately.
    The app will display a notice about this limitation.
    """
    from ultralytics import YOLO
    print("\n[FALLBACK] Using COCO-pretrained YOLOv8n")
    print("  Limitation: Not specifically trained for potholes.")
    print("  The app will clearly indicate this is a general road hazard detector.")

    model = YOLO("yolov8n.pt")
    source_pt = Path("yolov8n.pt")
    dest_pt = output_dir / "best.pt"
    shutil.copy2(source_pt, dest_pt)
    print(f"[OK] Using COCO weights: {dest_pt}")

    # Create a limitation marker
    marker = output_dir / "MODEL_SOURCE.txt"
    marker.write_text(
        "Model: YOLOv8n (COCO pretrained)\n"
        "Source: Ultralytics official weights\n"
        "License: AGPL-3.0\n"
        "Limitation: Not fine-tuned for potholes. Uses COCO class detection.\n"
        "Classes used: All 80 COCO classes (road hazards detected as general objects)\n"
        "Recommendation: Run train.py with a pothole dataset for better accuracy.\n"
    )
    return str(dest_pt)


def print_manual_instructions():
    print("""
Manual Dataset Setup Instructions:
===================================
1. Create a free Roboflow account at https://roboflow.com
2. Go to: https://universe.roboflow.com/roboflow-100/pothole-detection-gwyag
3. Click "Download Dataset" → YOLOv8 format
4. Extract to: ml/datasets/pothole/
5. Set ROBOFLOW_API_KEY environment variable
6. Re-run this script

Alternative datasets (also CC BY 4.0):
  - https://universe.roboflow.com/alex-hyZgB/pothole-detection-t4l6G
  - https://universe.roboflow.com/potholes-uarpo/pothole-detection-yolov8
    """)


def export_to_onnx(pt_path: str, output_dir: Path):
    """Export the trained model to ONNX for mobile deployment."""
    from ultralytics import YOLO
    import shutil

    model = YOLO(pt_path)
    print(f"\n[Step 3] Exporting to ONNX (opset 12, imgsz 320)...")
    exported = model.export(format="onnx", imgsz=320, opset=12, simplify=True, dynamic=False)

    onnx_dest = output_dir / "pothole_yolov8n.onnx"
    shutil.copy2(exported, onnx_dest)

    # Copy to mobile assets
    mobile_assets = Path("apps/mobile/assets/models")
    mobile_assets.mkdir(parents=True, exist_ok=True)
    shutil.copy2(onnx_dest, mobile_assets / "pothole_yolov8n.onnx")

    size_mb = onnx_dest.stat().st_size / 1_048_576
    print(f"[OK] ONNX model: {onnx_dest} ({size_mb:.1f} MB)")
    print(f"[OK] Copied to: {mobile_assets / 'pothole_yolov8n.onnx'}")

    return str(onnx_dest)


def main():
    output_dir = Path("ml/models")

    # Check if ONNX already exists in mobile assets
    mobile_onnx = Path("apps/mobile/assets/models/pothole_yolov8n.onnx")
    if mobile_onnx.exists():
        size_mb = mobile_onnx.stat().st_size / 1_048_576
        print(f"[INFO] Model already exists in mobile assets ({size_mb:.1f} MB)")
        print(f"  Path: {mobile_onnx}")
        print("[INFO] Delete the file to re-download/retrain.")
        return

    pt_path = download_and_train_minimal()
    onnx_path = export_to_onnx(pt_path, output_dir)

    print("\n" + "=" * 60)
    print("Model preparation complete!")
    print(f"  PyTorch weights: {pt_path}")
    print(f"  ONNX model:      {onnx_path}")
    print(f"  Mobile assets:   apps/mobile/assets/models/pothole_yolov8n.onnx")
    print("\nNext: Build the Android app with: cd apps/mobile && npx expo run:android")


if __name__ == "__main__":
    main()
