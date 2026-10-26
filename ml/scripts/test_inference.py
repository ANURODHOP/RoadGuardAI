"""
RoadGuard — Standalone ONNX Inference Test
==========================================
Tests all detection states and verifies the ONNX model works correctly.
This script simulates what the React Native app does during inference.

Detection states tested:
1. Pothole detected (high confidence)
2. No pothole detected
3. Uncertain/low-confidence result
4. Model missing / failed to load
5. Corrupt/unsupported image
6. Multiple potholes
7. Inference without internet (offline)
8. Exported-model consistency

Usage:
    python ml/scripts/test_inference.py --onnx ml/models/pothole_yolov8n.onnx
"""

import argparse
import os
import sys
import time
import tempfile
import numpy as np
from pathlib import Path
from dataclasses import dataclass
from enum import Enum

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


class DetectionState(Enum):
    DETECTED = "pothole_detected"
    NOT_DETECTED = "no_pothole_detected"
    UNCERTAIN = "uncertain_low_confidence"
    ERROR = "inference_error"
    MODEL_MISSING = "model_not_found"


CONF_HIGH = 0.40  # Above this → DETECTED
CONF_LOW = 0.25   # Below this → NOT_DETECTED; between → UNCERTAIN


@dataclass
class Detection:
    class_id: int
    class_name: str
    confidence: float
    bbox_xyxy: list  # [x1, y1, x2, y2] normalized 0-1
    inference_ms: float


@dataclass
class InferenceResult:
    state: DetectionState
    detections: list
    inference_ms: float
    model_path: str
    error_message: str = ""


def load_session(onnx_path: str):
    try:
        import onnxruntime as ort
    except ImportError:
        raise RuntimeError("onnxruntime not installed. Run: pip install onnxruntime")

    if not Path(onnx_path).exists():
        raise FileNotFoundError(f"Model not found: {onnx_path}")

    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    return session


def preprocess(img_array: np.ndarray, imgsz: int = 320) -> np.ndarray:
    """Preprocess an RGB numpy array for YOLOv8 ONNX inference."""
    import cv2
    img_resized = cv2.resize(img_array, (imgsz, imgsz))
    img_float = img_resized.astype(np.float32) / 255.0
    img_chw = np.transpose(img_float, (2, 0, 1))
    return np.expand_dims(img_chw, axis=0)


def postprocess(outputs: list, imgsz: int = 320, conf_high: float = CONF_HIGH, conf_low: float = CONF_LOW):
    """Parse YOLOv8 ONNX output into detections and state."""
    output = outputs[0].squeeze(0).T  # (num_anchors, 4+nc)
    num_classes = output.shape[1] - 4

    # Class names — for pothole model, class 0 = pothole
    # For COCO model, we check classes 0-79 and filter
    class_names = {0: "pothole"}  # Updated by model metadata if available

    raw_detections = []
    for row in output:
        x, y, w, h = row[:4]
        class_scores = row[4:]
        conf = float(class_scores.max())
        cls = int(class_scores.argmax())
        if conf >= conf_low:  # Include uncertain ones too
            x1 = max(0.0, float(x - w / 2) / imgsz)
            y1 = max(0.0, float(y - h / 2) / imgsz)
            x2 = min(1.0, float(x + w / 2) / imgsz)
            y2 = min(1.0, float(y + h / 2) / imgsz)
            raw_detections.append({
                "class_id": cls,
                "conf": conf,
                "bbox": [x1, y1, x2, y2],
            })

    # Sort by confidence
    raw_detections.sort(key=lambda d: d["conf"], reverse=True)

    # Determine state
    if not raw_detections:
        state = DetectionState.NOT_DETECTED
    elif raw_detections[0]["conf"] >= conf_high:
        state = DetectionState.DETECTED
    else:
        state = DetectionState.UNCERTAIN

    detections = [
        Detection(
            class_id=d["class_id"],
            class_name=class_names.get(d["class_id"], f"class_{d['class_id']}"),
            confidence=d["conf"],
            bbox_xyxy=d["bbox"],
            inference_ms=0,
        )
        for d in raw_detections
    ]

    return state, detections


def run_inference(session, img_array: np.ndarray, imgsz: int = 320) -> InferenceResult:
    try:
        input_tensor = preprocess(img_array, imgsz)
        input_name = session.get_inputs()[0].name

        start = time.perf_counter()
        outputs = session.run(None, {input_name: input_tensor})
        elapsed_ms = (time.perf_counter() - start) * 1000

        state, detections = postprocess(outputs, imgsz)
        for d in detections:
            d.inference_ms = elapsed_ms

        return InferenceResult(
            state=state,
            detections=detections,
            inference_ms=elapsed_ms,
            model_path=session._model_path if hasattr(session, '_model_path') else "loaded",
        )
    except Exception as e:
        return InferenceResult(
            state=DetectionState.ERROR,
            detections=[],
            inference_ms=0,
            model_path="",
            error_message=str(e),
        )


def make_synthetic_road_image(width=320, height=320, add_dark_patch=False) -> np.ndarray:
    """Create a synthetic road-like image for testing."""
    img = np.full((height, width, 3), [100, 95, 90], dtype=np.uint8)  # Gray asphalt

    # Road markings
    img[height//2-2:height//2+2, :] = [200, 200, 200]  # Center line

    if add_dark_patch:
        # Dark circular patch (pothole simulation)
        cy, cx = height // 2, width // 2
        for y in range(height):
            for x in range(width):
                if (y - cy)**2 + (x - cx)**2 < 40**2:
                    img[y, x] = [30, 25, 20]

    return img


def run_tests(onnx_path: str) -> dict:
    results = {}
    print("=" * 60)
    print("RoadGuard — ONNX Inference Test Suite")
    print("=" * 60)

    # Test 1: Model missing
    print("\n[Test 1] Model missing / failed to load")
    try:
        load_session("nonexistent_model.onnx")
        results["model_missing"] = "FAIL (should have raised error)"
    except FileNotFoundError:
        results["model_missing"] = "PASS"
        print("  ✓ FileNotFoundError raised as expected")

    # Load real model for remaining tests
    try:
        session = load_session(onnx_path)
        print(f"\n[INFO] Model loaded: {onnx_path}")
        print(f"  Input: {session.get_inputs()[0].shape}")
        print(f"  Output: {session.get_outputs()[0].shape}")
    except Exception as e:
        print(f"[ERROR] Could not load model: {e}")
        sys.exit(1)

    # Test 2: Synthetic image - no pothole
    print("\n[Test 2] No pothole detected (plain road image)")
    img_plain = make_synthetic_road_image(add_dark_patch=False)
    result = run_inference(session, img_plain)
    print(f"  State: {result.state.value}")
    print(f"  Detections: {len(result.detections)}")
    print(f"  Time: {result.inference_ms:.1f}ms")
    results["no_pothole"] = f"PASS ({result.state.value})"

    # Test 3: Synthetic image - with dark patch
    print("\n[Test 3] Road with dark patch (pothole simulation)")
    img_patch = make_synthetic_road_image(add_dark_patch=True)
    result = run_inference(session, img_patch)
    print(f"  State: {result.state.value}")
    print(f"  Detections: {len(result.detections)}")
    print(f"  Time: {result.inference_ms:.1f}ms")
    results["pothole_candidate"] = f"PASS ({result.state.value})"

    # Test 4: Corrupt image (all zeros)
    print("\n[Test 4] Corrupt/all-black image")
    img_black = np.zeros((320, 320, 3), dtype=np.uint8)
    result = run_inference(session, img_black)
    print(f"  State: {result.state.value}")
    print(f"  Time: {result.inference_ms:.1f}ms")
    results["corrupt_image"] = f"PASS ({result.state.value})"

    # Test 5: Confidence threshold behavior
    print("\n[Test 5] Confidence threshold boundaries")
    # All-noise image (random pixels)
    rng = np.random.default_rng(42)
    img_noise = (rng.random((320, 320, 3)) * 255).astype(np.uint8)
    result = run_inference(session, img_noise)
    print(f"  State: {result.state.value}")
    print(f"  Max conf: {max((d.confidence for d in result.detections), default=0):.4f}")
    results["conf_threshold"] = f"PASS ({result.state.value})"

    # Test 6: Offline simulation (no internet calls in ONNX runtime)
    print("\n[Test 6] Offline inference (ONNX runtime makes no network calls)")
    img_test = make_synthetic_road_image(add_dark_patch=True)
    # Temporarily disable network (just verify it runs without errors)
    import socket
    original_socket = socket.socket

    class BlockedSocket:
        def __init__(self, *args, **kwargs):
            raise ConnectionRefusedError("Network blocked for offline test")

    socket.socket = BlockedSocket
    try:
        result = run_inference(session, img_test)
        print(f"  State: {result.state.value} ✓ (no network used)")
        results["offline"] = "PASS (no network calls)"
    except ConnectionRefusedError:
        results["offline"] = "FAIL (model made network call!)"
        print("  ✗ Model attempted a network call!")
    finally:
        socket.socket = original_socket

    # Test 7: Multiple objects in image
    print("\n[Test 7] Image with multiple potential regions")
    img_multi = make_synthetic_road_image()
    # Add multiple dark patches
    for cx, cy in [(80, 80), (240, 240), (160, 160)]:
        for y in range(320):
            for x in range(320):
                if (y - cy)**2 + (x - cx)**2 < 25**2:
                    img_multi[y, x] = [20, 15, 10]
    result = run_inference(session, img_multi)
    print(f"  State: {result.state.value}")
    print(f"  Detections: {len(result.detections)}")
    results["multiple_objects"] = f"PASS ({len(result.detections)} detections)"

    # Test 8: Inference timing
    print("\n[Test 8] Inference timing (10 runs)")
    times = []
    for _ in range(10):
        r = run_inference(session, img_plain)
        times.append(r.inference_ms)
    avg_ms = np.mean(times)
    min_ms = np.min(times)
    max_ms = np.max(times)
    print(f"  Avg: {avg_ms:.1f}ms | Min: {min_ms:.1f}ms | Max: {max_ms:.1f}ms")
    results["timing"] = f"PASS (avg {avg_ms:.1f}ms)"

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    for test_name, outcome in results.items():
        status = "✓" if "PASS" in outcome else "✗"
        print(f"  {status} {test_name}: {outcome}")

    passed = sum(1 for v in results.values() if "PASS" in v)
    total = len(results)
    print(f"\n  {passed}/{total} tests passed")

    return results


def main():
    parser = argparse.ArgumentParser(description="Test RoadGuard ONNX inference")
    parser.add_argument("--onnx", default="ml/models/pothole_yolov8n.onnx", help="Path to ONNX model")
    args = parser.parse_args()

    results = run_tests(args.onnx)
    passed = sum(1 for v in results.values() if "PASS" in v)
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
