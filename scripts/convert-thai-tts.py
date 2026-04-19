#!/usr/bin/env python3
"""
Convert Facebook MMS-TTS Thai model to ONNX format for transformers.js

Prerequisites:
1. Python 3.10+
2. Install dependencies:
   pip install torch transformers optimum onnx onnxruntime

3. Install Optimum with VITS support:
   pip install git+https://github.com/huggingface/optimum.git

Usage:
   python convert-thai-tts.py

This will create the ONNX model in ./mms-tts-tha-onnx/
You can then either:
1. Upload to Hugging Face Hub
2. Host on your own server
3. Include in your project's public folder
"""

import os
import sys
import subprocess
from pathlib import Path

def main():
    # Output directory
    output_dir = Path("./mms-tts-tha-onnx")
    output_dir.mkdir(exist_ok=True)

    print("=" * 60)
    print("Converting Facebook MMS-TTS Thai to ONNX")
    print("=" * 60)

    # Check if optimum is installed
    try:
        import optimum
        print("[OK] Optimum is installed")
    except ImportError:
        print("[!] Optimum not found. Installing...")
        subprocess.check_call([
            sys.executable, "-m", "pip", "install",
            "git+https://github.com/huggingface/optimum.git"
        ])

    # Check if transformers is installed
    try:
        import transformers
        print("[OK] Transformers is installed")
    except ImportError:
        print("[!] Transformers not found. Installing...")
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "transformers"
        ])

    print("\nStarting conversion...")
    print("Model: facebook/mms-tts-tha")
    print(f"Output: {output_dir.absolute()}")
    print("-" * 60)

    # Run the conversion using optimum-cli
    # Note: Validation may fail due to dynamic output shapes in VITS models,
    # but the model file is still valid and usable
    cmd = [
        sys.executable, "-m", "optimum.exporters.onnx",
        "--model", "facebook/mms-tts-tha",
        "--task", "text-to-audio",
        str(output_dir)
    ]

    print(f"\nRunning: {' '.join(cmd)}\n")

    try:
        subprocess.check_call(cmd)
        print("\n" + "=" * 60)
        print("[SUCCESS] Conversion successful!")
        print("=" * 60)
        print(f"\nOutput files in: {output_dir.absolute()}")
        print("\nNext steps:")
        print("1. Upload to Hugging Face Hub:")
        print("   huggingface-cli upload your-username/mms-tts-tha-onnx ./mms-tts-tha-onnx")
        print("\n2. Or copy to your project's public folder:")
        print("   cp -r ./mms-tts-tha-onnx ../client/public/models/")
        print("\n3. Update the worker to use your model path")
    except subprocess.CalledProcessError as e:
        print(f"\n[FAILED] Conversion failed with error code {e.returncode}")
        print("\nTroubleshooting:")
        print("1. Make sure you have the latest transformers and optimum:")
        print("   pip install --upgrade transformers")
        print("   pip install git+https://github.com/huggingface/optimum.git")
        print("\n2. Try with --skip_validation flag if validation fails")
        print("\n3. Check GitHub issues for known issues:")
        print("   https://github.com/huggingface/transformers.js/issues/626")
        sys.exit(1)


if __name__ == "__main__":
    main()
