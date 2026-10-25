"""
RoadGuard — Pothole Detection ONNX Export Script
=================================================
Exports a YOLOv8n model (either COCO-pretrained or fine-tuned) to ONNX
format suitable for onnxruntime-react-native.

Usage:
    python ml/scripts/export_onnx.py --weights ml/models/best.pt --output ml/models/pothole_yolov8n.onnx
    python ml/scripts/export_onnx.py --weights yolov8n.pt --output ml/models/pothole_yolov8n.onnx

Output image size is fixed at 320x320 to keep model size ~12 MB.
Opset 12 is required for onnxruntime-react-native compatibility.
"""

import argparse
import os
import sys
from pathlib import Path


def export(weights: str, output: str, imgsz: int = 320, opset: int = 12) -> None:
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERROR] ultralytics not installed. Run: pip install ultralytics")
        sys.exit(1)

    weights_path = Path(weights)
    if not weights_path.exists():
        print(f"[ERROR] Weights file not found: {weights_path}")
        sys.exit(1)

    print(f"[INFO] Loading model from: {weights_path}")
    model = YOLO(str(weights_path))

    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"[INFO] Exporting to ONNX (opset={opset}, imgsz={imgsz})...")
    exported = model.export(
        format="onnx",
        imgsz=imgsz,
        opset=opset,
        simplify=True,
        dynamic=False,
    )

    exported_path = Path(exported)
    if exported_path != output_path:
        import shutil
        shutil.copy2(exported_path, output_path)
        print(f"[INFO] Copied to: {output_path}")

    size_mb = output_path.stat().st_size / 1_048_576
    print(f"[OK] ONNX model saved: {output_path} ({size_mb:.1f} MB)")

    # Copy to mobile assets
    mobile_models_dir = Path("apps/mobile/assets/models")
    mobile_models_dir.mkdir(parents=True, exist_ok=True)
    dest = mobile_models_dir / output_path.name
    import shutil
    shutil.copy2(output_path, dest)
    print(f"[OK] Copied to mobile assets: {dest}")


def main():
    parser = argparse.ArgumentParser(description="Export YOLOv8 model to ONNX")
    parser.add_argument("--weights", default="ml/models/best.pt", help="Path to .pt weights file")
    parser.add_argument("--output", default="ml/models/pothole_yolov8n.onnx", help="Output ONNX path")
    parser.add_argument("--imgsz", type=int, default=320, help="Input image size (default: 320)")
    parser.add_argument("--opset", type=int, default=12, help="ONNX opset version (default: 12)")
    args = parser.parse_args()
    export(args.weights, args.output, args.imgsz, args.opset)


if __name__ == "__main__":
    main()
