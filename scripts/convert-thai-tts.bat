@echo off
echo ============================================================
echo Converting Facebook MMS-TTS Thai to ONNX for transformers.js
echo ============================================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.10+
    pause
    exit /b 1
)

echo Installing/updating dependencies...
pip install --upgrade transformers torch onnx onnxruntime
pip install git+https://github.com/huggingface/optimum.git

echo.
echo Starting conversion...
python -m optimum.exporters.onnx --model facebook/mms-tts-tha --task text-to-audio ./mms-tts-tha-onnx

if errorlevel 1 (
    echo.
    echo Conversion failed. Check the error messages above.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo Conversion successful!
echo ============================================================
echo.
echo Output files are in: %cd%\mms-tts-tha-onnx
echo.
echo Next steps:
echo 1. Copy to client/public/models/mms-tts-tha/
echo 2. Or upload to Hugging Face Hub
echo.
pause
