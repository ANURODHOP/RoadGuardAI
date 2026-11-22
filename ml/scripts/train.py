"""
RoadGuardAI — Pothole Detection Model Training Script
=====================================================
Fine-tunes YOLOv8n on the RoadGuard pothole detection dataset using
hyperparameters from `ml/configs/roadguard.yaml`.

Key features:
1. Environment diagnostics (Python, PyTorch, CUDA, GPU device, Ultralytics version).
2. Reads canonical hyperparameters from `ml/configs/roadguard.yaml` (with CLI overrides).
3. Executes fine-tuning with fixed seed for reproducibility.
4. Performs post-training evaluation strictly on the held-out TEST set.
5. Emits `test_metrics.json` and `training_metadata.json` for full provenance.
6. Saves best checkpoint to `ml/models/best.pt`.
7. Preserves mobile model isolation (does NOT overwrite apps/mobile assets in Stage 3).

Usage:
    # Train using canonical config (from repository root)
    python ml/scripts/train.py --config ml/configs/roadguard.yaml --data ml/datasets/roadguard/dataset.yaml

    # Quick test run on CPU (5 epochs)
    python ml/scripts/train.py --epochs 5 --device cpu

    # GPU execution on Google Colab / Linux
    python ml/scripts/train.py --config ml/configs/roadguard.yaml --device 0 --batch 16
"""

import argparse
import datetime
import json
import os
import shutil
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def get_environment_info() -> Dict[str, Any]:
    """Inspect and return runtime environment metadata."""
    info: Dict[str, Any] = {
        "python_version": sys.version,
        "platform": sys.platform,
        "pytorch_version": None,
        "cuda_available": False,
        "cuda_version": None,
        "gpu_name": None,
        "gpu_count": 0,
        "ultralytics_version": None,
    }

    try:
        import torch
        info["pytorch_version"] = torch.__version__
        info["cuda_available"] = torch.cuda.is_available()
        if torch.cuda.is_available():
            info["cuda_version"] = torch.version.cuda
            info["gpu_count"] = torch.cuda.device_count()
            info["gpu_name"] = torch.cuda.get_device_name(0)
    except ImportError:
        pass

    try:
        import ultralytics
        info["ultralytics_version"] = ultralytics.__version__
    except ImportError:
        pass

    return info


def load_config(config_path: Optional[str]) -> Dict[str, Any]:
    """Load canonical training and augmentation parameters from YAML config."""
    if not config_path:
        return {}

    cfg_file = Path(config_path)
    if not cfg_file.exists():
        print(f"[WARN] Config file not found: {cfg_file}. Using defaults.")
        return {}

    try:
        import yaml
        with open(cfg_file, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except ImportError:
        print("[WARN] pyyaml not installed. Falling back to default parameters.")
        return {}
    except Exception as e:
        print(f"[WARN] Failed to parse {cfg_file}: {e}. Using defaults.")
        return {}


def download_dataset(api_key: Optional[str], workspace: str, project: str, version: int, output_dir: str) -> str:
    """Download dataset from Roboflow Universe using Roboflow Python SDK."""
    try:
        from roboflow import Roboflow
    except ImportError:
        print("[ERROR] roboflow not installed. Run: pip install roboflow")
        sys.exit(1)

    print(f"[INFO] Connecting to Roboflow Universe (workspace='{workspace}', project='{project}', v{version})...")
    if api_key:
        rf = Roboflow(api_key=api_key)
    else:
        rf = Roboflow()

    project_obj = rf.workspace(workspace).project(project)
    dataset = project_obj.version(version).download("yolov8", location=output_dir)
    print(f"[OK] Dataset acquired at: {output_dir}")
    return dataset.location


def train(
    data_yaml: str,
    config: Dict[str, Any],
    cli_overrides: Dict[str, Any],
) -> Dict[str, Any]:
    """Execute YOLOv8n fine-tuning and test evaluation."""
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERROR] ultralytics not installed. Run: pip install ultralytics")
        sys.exit(1)

    env_info = get_environment_info()
    print("=" * 80)
    print("RoadGuardAI — YOLOv8n Training Pipeline")
    print("=" * 80)
    print(f"Python:      {env_info['python_version'].split()[0]}")
    print(f"PyTorch:     {env_info['pytorch_version']}")
    print(f"CUDA:        {env_info['cuda_available']} ({env_info['gpu_name'] or 'CPU only'})")
    print(f"Ultralytics: {env_info['ultralytics_version']}")
    print("=" * 80)

    # Merge configuration: defaults -> config file -> CLI overrides
    train_cfg = config.get("training", {})
    aug_cfg = config.get("augmentation", {})

    epochs = cli_overrides.get("epochs") or train_cfg.get("epochs", 50)
    imgsz = cli_overrides.get("imgsz") or train_cfg.get("imgsz", 320)
    batch = cli_overrides.get("batch") or train_cfg.get("batch", 8)
    device = cli_overrides.get("device") or train_cfg.get("device", "cpu")
    model_name = cli_overrides.get("model") or train_cfg.get("model", "yolov8n.pt")
    seed = cli_overrides.get("seed") or train_cfg.get("seed", 42)
    output_name = cli_overrides.get("name") or "pothole_yolov8n"
    project_dir = cli_overrides.get("project") or "ml/runs"

    # Validate device selection
    if device != "cpu" and not env_info["cuda_available"]:
        print(f"[WARN] CUDA requested ('{device}') but CUDA is not available. Falling back to CPU.")
        device = "cpu"

    print(f"[INFO] Model Backbone:  {model_name}")
    print(f"[INFO] Dataset YAML:    {data_yaml}")
    print(f"[INFO] Image Size:      {imgsz}x{imgsz}")
    print(f"[INFO] Batch Size:      {batch}")
    print(f"[INFO] Epochs:          {epochs}")
    print(f"[INFO] Device:          {device}")
    print(f"[INFO] Seed:            {seed}")
    print(f"[INFO] Output Folder:   {project_dir}/{output_name}")

    start_time = time.time()
    train_start_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    model = YOLO(model_name)

    # Hyperparameters passed to Ultralytics YOLOv8
    train_kwargs: Dict[str, Any] = {
        "data": str(data_yaml),
        "epochs": int(epochs),
        "imgsz": int(imgsz),
        "batch": int(batch),
        "device": device,
        "name": output_name,
        "project": project_dir,
        "exist_ok": True,
        "verbose": True,
        "save": True,
        "save_period": train_cfg.get("save_period", 10),
        "patience": train_cfg.get("patience", 15),
        "optimizer": train_cfg.get("optimizer", "AdamW"),
        "lr0": train_cfg.get("lr0", 0.001),
        "lrf": train_cfg.get("lrf", 0.01),
        "warmup_epochs": train_cfg.get("warmup_epochs", 3),
        "seed": int(seed),
        "deterministic": True,
        # Augmentation parameters
        "hsv_h": aug_cfg.get("hsv_h", 0.015),
        "hsv_s": aug_cfg.get("hsv_s", 0.7),
        "hsv_v": aug_cfg.get("hsv_v", 0.4),
        "degrees": aug_cfg.get("degrees", 5.0),
        "translate": aug_cfg.get("translate", 0.1),
        "scale": aug_cfg.get("scale", 0.3),
        "fliplr": aug_cfg.get("fliplr", 0.5),
        "flipud": aug_cfg.get("flipud", 0.0),
        "mosaic": aug_cfg.get("mosaic", 0.5),
        "mixup": aug_cfg.get("mixup", 0.0),
        "cache": False,
    }

    results = model.train(**train_kwargs)
    training_duration_sec = round(time.time() - start_time, 2)
    print(f"[OK] Training complete in {training_duration_sec}s ({training_duration_sec / 60:.2f} min)")

    # Locate best.pt
    run_dir = Path(project_dir) / output_name
    best_pt = run_dir / "weights" / "best.pt"
    if not best_pt.exists():
        # Fallback to last.pt if best.pt not found
        best_pt = run_dir / "weights" / "last.pt"

    # Copy best checkpoint to ml/models/best.pt
    models_dir = Path("ml/models")
    models_dir.mkdir(parents=True, exist_ok=True)
    saved_best = models_dir / "best.pt"
    if best_pt.exists():
        shutil.copy2(best_pt, saved_best)
        print(f"[OK] Best model checkpoint saved to: {saved_best}")
    else:
        print(f"[WARN] Checkpoint not found at {best_pt}")

    # ── Evaluation on Held-Out TEST Split ──────────────────────────────────────
    print("\n" + "=" * 80)
    print("Evaluating Best Model on Held-Out TEST Split")
    print("=" * 80)

    best_model = YOLO(str(saved_best if saved_best.exists() else best_pt))
    test_results = best_model.val(
        data=str(data_yaml),
        split="test",
        imgsz=int(imgsz),
        batch=int(batch),
        device=device,
        plots=True,
    )

    test_metrics: Dict[str, Any] = {
        "precision": float(getattr(test_results.box, "mp", 0.0)),
        "recall": float(getattr(test_results.box, "mr", 0.0)),
        "map50": float(getattr(test_results.box, "map50", 0.0)),
        "map50_95": float(getattr(test_results.box, "map", 0.0)),
        "fitness": float(getattr(test_results, "fitness", 0.0)),
        "speed_ms": getattr(test_results, "speed", {}),
    }

    print("-" * 80)
    print(f"Test Precision (P):       {test_metrics['precision']:.4f}")
    print(f"Test Recall (R):          {test_metrics['recall']:.4f}")
    print(f"Test mAP@0.5:             {test_metrics['map50']:.4f}")
    print(f"Test mAP@0.5:0.95:        {test_metrics['map50_95']:.4f}")
    if test_metrics["speed_ms"]:
        total_latency = sum(test_metrics["speed_ms"].values())
        print(f"Inference Latency:        {total_latency:.2f} ms/image (~{1000 / max(total_latency, 0.01):.1f} FPS)")
    print("-" * 80)

    # ── Save Provenance & Metadata ────────────────────────────────────────────
    metadata: Dict[str, Any] = {
        "project": "RoadGuardAI",
        "stage": 3,
        "model_architecture": "YOLOv8n",
        "dataset_yaml": str(data_yaml),
        "target_class": "pothole",
        "num_classes": 1,
        "input_imgsz": int(imgsz),
        "epochs_trained": int(epochs),
        "batch_size": int(batch),
        "device": device,
        "seed": int(seed),
        "timestamp_utc": train_start_iso,
        "training_duration_sec": training_duration_sec,
        "environment": env_info,
        "hyperparameters": train_kwargs,
        "test_metrics": test_metrics,
        "checkpoint_path": str(saved_best),
    }

    # Save metadata files
    with open(run_dir / "test_metrics.json", "w", encoding="utf-8") as f:
        json.dump(test_metrics, f, indent=2)

    with open(run_dir / "training_metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    with open(models_dir / "training_metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"[OK] Evaluation metrics saved: {run_dir / 'test_metrics.json'}")
    print(f"[OK] Training metadata saved:   {models_dir / 'training_metadata.json'}")

    return metadata


def main():
    parser = argparse.ArgumentParser(description="Train and evaluate YOLOv8n pothole detection model")
    parser.add_argument("--config", default="ml/configs/roadguard.yaml", help="Path to roadguard.yaml")
    parser.add_argument("--data", default=None, help="Path to dataset.yaml (overrides config)")
    parser.add_argument("--epochs", type=int, default=None, help="Number of training epochs")
    parser.add_argument("--imgsz", type=int, default=None, help="Input image dimension (default: 320)")
    parser.add_argument("--batch", type=int, default=None, help="Batch size (default: 8)")
    parser.add_argument("--device", default=None, help="Device ('cpu', '0', 'cuda:0')")
    parser.add_argument("--model", default=None, help="Backbone model (default: yolov8n.pt)")
    parser.add_argument("--seed", type=int, default=None, help="Reproducible seed (default: 42)")
    parser.add_argument("--name", default="pothole_yolov8n", help="Run name")
    parser.add_argument("--project", default="ml/runs", help="Output project directory")

    # Roboflow acquisition options
    parser.add_argument("--download", action="store_true", help="Download dataset from Roboflow Universe")
    parser.add_argument("--api-key", default=None, help="Roboflow API key")
    parser.add_argument("--workspace", default="roboflow-100", help="Roboflow workspace")
    parser.add_argument("--project-slug", default="pothole-detection-gwyag", help="Roboflow project slug")
    parser.add_argument("--version", type=int, default=2, help="Roboflow version")
    parser.add_argument("--dataset-dir", default="ml/datasets/raw_pothole", help="Raw dataset destination")

    args = parser.parse_args()

    # Handle dataset download if requested
    if args.download:
        data_dir = download_dataset(
            args.api_key,
            args.workspace,
            args.project_slug,
            args.version,
            args.dataset_dir,
        )
        data_yaml = str(Path(data_dir) / "data.yaml")
    else:
        # Determine dataset YAML path
        if args.data:
            data_yaml = args.data
        else:
            # Check default locations
            default_prep = Path("ml/datasets/roadguard/dataset.yaml")
            default_raw = Path("ml/datasets/pothole/data.yaml")
            if default_prep.exists():
                data_yaml = str(default_prep)
            elif default_raw.exists():
                data_yaml = str(default_raw)
            else:
                data_yaml = "ml/configs/roadguard.yaml"

    config = load_config(args.config)

    cli_overrides = {
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "batch": args.batch,
        "device": args.device,
        "model": args.model,
        "seed": args.seed,
        "name": args.name,
        "project": args.project,
    }

    train(data_yaml=data_yaml, config=config, cli_overrides=cli_overrides)


if __name__ == "__main__":
    main()
