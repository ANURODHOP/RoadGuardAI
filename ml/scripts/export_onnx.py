"""
RoadGuardAI — Pothole Detection ONNX Export Script
==================================================
Exports a YOLOv8n PyTorch checkpoint (.pt) to ONNX format suitable for
onnxruntime-react-native.

Key specifications:
- Input shape: [1, 3, 320, 320] (fixed planar NCHW)
- Opset version: 12 (maximum compatibility with onnxruntime-react-native)
- Output shape: [1, 5, 2100] for single-class pothole detector
- Simplification: onnxslim / onnx-simplifier enabled

Usage:
    # Standard export of trained checkpoint
    python ml/scripts/export_onnx.py --weights ml/models/best.pt --output ml/models/pothole_yolov8n.onnx

    # Explicitly copy to mobile assets (Stage 4 integration only)
    python ml/scripts/export_onnx.py --weights ml/models/best.pt --copy-to-mobile
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


def export(
    weights: str,
    output: str,
    imgsz: int = 320,
    opset: int = 12,
    copy_to_mobile: bool = False,
) -> str:
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERROR] ultralytics not installed. Run: pip install ultralytics")
        sys.exit(1)

    weights_path = Path(weights)
    if not weights_path.exists():
        print(f"[ERROR] Weights file not found: {weights_path}")
        sys.exit(1)

    print(f"[INFO] Loading checkpoint from: {weights_path}")
    model = YOLO(str(weights_path))

    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"[INFO] Exporting to ONNX (opset={opset}, imgsz={imgsz}, simplify=True)...")
    exported = model.export(
        format="onnx",
        imgsz=imgsz,
        opset=opset,
        simplify=True,
        dynamic=False,
    )

    exported_path = Path(exported)
    if exported_path.resolve() != output_path.resolve():
        import shutil
        shutil.copy2(exported_path, output_path)
        print(f"[INFO] Copied exported ONNX to: {output_path}")

    size_mb = output_path.stat().st_size / 1_048_576
    print(f"[OK] ONNX model successfully saved: {output_path} ({size_mb:.2f} MB)")

    # Only copy to mobile assets if explicitly requested (Stage 4)
    if copy_to_mobile:
        mobile_models_dir = Path("apps/mobile/assets/models")
        mobile_models_dir.mkdir(parents=True, exist_ok=True)
        dest = mobile_models_dir / output_path.name
        import shutil
        shutil.copy2(output_path, dest)
        print(f"[OK] Model deployed to mobile assets: {dest}")
    else:
        print("[NOTE] Mobile model replacement skipped (preserves Stage 3 isolation).")
        print("       Pass --copy-to-mobile during Stage 4 to deploy into the mobile app.")

    return str(output_path)


def main():
    parser = argparse.ArgumentParser(description="Export YOLOv8 model to ONNX for mobile deployment")
    parser.add_argument("--weights", default="ml/models/best.pt", help="Path to .pt weights file")
    parser.add_argument("--output", default="ml/models/pothole_yolov8n.onnx", help="Output ONNX path")
    parser.add_argument("--imgsz", type=int, default=320, help="Input image dimension (default: 320)")
    parser.add_argument("--opset", type=int, default=12, help="ONNX opset version (default: 12)")
    parser.add_argument("--copy-to-mobile", action="store_true", default=False,
                        help="Deploy ONNX model directly to apps/mobile/assets/models (Stage 4 only)")
    args = parser.parse_args()

    export(
        weights=args.weights,
        output=args.output,
        imgsz=args.imgsz,
        opset=args.opset,
        copy_to_mobile=args.copy_to_mobile,
    )


if __name__ == "__main__":
    main()
