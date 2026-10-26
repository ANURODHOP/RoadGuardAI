"""
RoadGuard — ONNX Export Validation Script
==========================================
Compares YOLOv8 PyTorch predictions against ONNX Runtime predictions
to verify numerical consistency after export.

Usage:
    python ml/scripts/validate_export.py --pt ml/models/best.pt --onnx ml/models/pothole_yolov8n.onnx --test-image path/to/test.jpg
"""

import argparse
import sys
import time
import numpy as np
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def preprocess_image(image_path: str, imgsz: int = 320):
    """Preprocess an image for YOLOv8 inference (BGR → RGB, resize, normalize)."""
    try:
        import cv2
    except ImportError:
        print("[ERROR] opencv-python not installed. Run: pip install opencv-python")
        sys.exit(1)

    img = cv2.imread(str(image_path))
    if img is None:
        print(f"[ERROR] Could not read image: {image_path}")
        sys.exit(1)

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img_resized = cv2.resize(img_rgb, (imgsz, imgsz))
    img_float = img_resized.astype(np.float32) / 255.0
    img_chw = np.transpose(img_float, (2, 0, 1))  # HWC → CHW
    img_bchw = np.expand_dims(img_chw, axis=0)    # CHW → BCHW
    return img_bchw


def run_pytorch(pt_path: str, image_path: str, imgsz: int = 320):
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERROR] ultralytics not installed.")
        sys.exit(1)

    model = YOLO(str(pt_path))
    start = time.perf_counter()
    results = model(str(image_path), imgsz=imgsz, verbose=False)
    elapsed = time.perf_counter() - start

    detections = []
    for result in results:
        for box in result.boxes:
            detections.append({
                "class": int(box.cls.item()),
                "conf": float(box.conf.item()),
                "xyxy": box.xyxy.cpu().numpy().tolist(),
            })

    return detections, elapsed


def run_onnx(onnx_path: str, image_path: str, imgsz: int = 320, conf_threshold: float = 0.25):
    try:
        import onnxruntime as ort
    except ImportError:
        print("[ERROR] onnxruntime not installed. Run: pip install onnxruntime")
        sys.exit(1)

    img = preprocess_image(image_path, imgsz)

    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name

    start = time.perf_counter()
    outputs = session.run(None, {input_name: img})
    elapsed = time.perf_counter() - start

    # YOLOv8 ONNX output: (1, 84, 2100) for COCO / (1, 5+nc, anchors) for custom
    output = outputs[0]  # (1, num_classes+4, num_anchors)
    output = output.squeeze(0).T  # (num_anchors, num_classes+4)

    detections = []
    num_classes = output.shape[1] - 4
    for row in output:
        x, y, w, h = row[:4]
        class_scores = row[4:]
        conf = float(class_scores.max())
        cls = int(class_scores.argmax())
        if conf >= conf_threshold:
            x1 = float(x - w / 2) * imgsz
            y1 = float(y - h / 2) * imgsz
            x2 = float(x + w / 2) * imgsz
            y2 = float(y + h / 2) * imgsz
            detections.append({
                "class": cls,
                "conf": conf,
                "xyxy": [[x1, y1, x2, y2]],
            })

    # Sort by confidence desc
    detections.sort(key=lambda d: d["conf"], reverse=True)
    return detections[:10], elapsed  # Top 10 detections


def compare_results(pt_detections, onnx_detections, iou_threshold: float = 0.5) -> bool:
    """Check if PyTorch and ONNX agree on the top detection."""
    if not pt_detections and not onnx_detections:
        print("[PASS] Both models: no detections. ✓")
        return True

    if bool(pt_detections) != bool(onnx_detections):
        print("[WARN] Models disagree on presence of detections.")
        return False

    pt_top = pt_detections[0] if pt_detections else None
    onnx_top = onnx_detections[0] if onnx_detections else None

    if pt_top and onnx_top:
        conf_diff = abs(pt_top["conf"] - onnx_top["conf"])
        cls_match = pt_top["class"] == onnx_top["class"]
        print(f"  PyTorch:  class={pt_top['class']}, conf={pt_top['conf']:.4f}")
        print(f"  ONNX:     class={onnx_top['class']}, conf={onnx_top['conf']:.4f}")
        print(f"  Conf diff: {conf_diff:.4f} | Class match: {cls_match}")

        if conf_diff < 0.05 and cls_match:
            print("[PASS] Models are consistent within tolerance. ✓")
            return True
        else:
            print("[WARN] Models differ by more than tolerance.")
            return False

    return False


def main():
    parser = argparse.ArgumentParser(description="Validate ONNX export against PyTorch")
    parser.add_argument("--pt", required=True, help="Path to .pt weights")
    parser.add_argument("--onnx", required=True, help="Path to .onnx model")
    parser.add_argument("--test-image", required=True, help="Path to test image")
    parser.add_argument("--imgsz", type=int, default=320)
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    args = parser.parse_args()

    for f in [args.pt, args.onnx, args.test_image]:
        if not Path(f).exists():
            print(f"[ERROR] File not found: {f}")
            sys.exit(1)

    print("=" * 60)
    print("RoadGuard — ONNX Export Validation")
    print("=" * 60)

    print("\n[PyTorch Inference]")
    pt_dets, pt_time = run_pytorch(args.pt, args.test_image, args.imgsz)
    print(f"  Detections: {len(pt_dets)}, Time: {pt_time*1000:.1f}ms")

    print("\n[ONNX Runtime Inference]")
    onnx_dets, onnx_time = run_onnx(args.onnx, args.test_image, args.imgsz, args.conf)
    print(f"  Detections: {len(onnx_dets)}, Time: {onnx_time*1000:.1f}ms")

    print("\n[Consistency Check]")
    consistent = compare_results(pt_dets, onnx_dets)

    print("\n[Summary]")
    print(f"  PyTorch inference:  {pt_time*1000:.1f} ms")
    print(f"  ONNX inference:     {onnx_time*1000:.1f} ms")
    speedup = pt_time / onnx_time if onnx_time > 0 else 0
    print(f"  ONNX speedup:       {speedup:.2f}x")
    print(f"  Validation: {'PASSED' if consistent else 'NEEDS REVIEW'}")

    sys.exit(0 if consistent else 1)


if __name__ == "__main__":
    main()
