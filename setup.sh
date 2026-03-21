#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔧 Setting up Granite Pill environment..."

# Prefer Python 3.11+ from Homebrew
PYTHON_BIN=""
for p in /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.11 /usr/local/bin/python3.12 /usr/local/bin/python3.11 python3.12 python3.11; do
  if command -v "$p" &>/dev/null; then
    PYTHON_BIN="$p"
    break
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  echo "❌ Python 3.11+ not found. Install with: brew install python@3.11"
  exit 1
fi

echo "✅ Using Python: $PYTHON_BIN ($($PYTHON_BIN --version))"

# ── Python venv ───────────────────────────────────────────────────────────────
if [ ! -d ".venv" ]; then
    echo "📦 Creating Python virtual environment..."
    "$PYTHON_BIN" -m venv .venv
fi

source .venv/bin/activate

echo "📦 Installing mlx-audio (from git)..."
pip install --quiet --upgrade pip
pip install --quiet "git+https://github.com/Blaizzy/mlx-audio.git" --pre

echo "📦 Installing flask..."
pip install --quiet flask

echo "📦 Installing huggingface_hub CLI..."
pip install --quiet "huggingface_hub[cli]"

# ── Download model ────────────────────────────────────────────────────────────
MODEL_DIR="$SCRIPT_DIR/models/granite-4.0-1b-speech-8bit"
if [ ! -d "$MODEL_DIR" ]; then
    echo "⬇️  Downloading granite-4.0-1b-speech-8bit (~2-3 GB)..."
    mkdir -p "$SCRIPT_DIR/models"
    huggingface-cli download mlx-community/granite-4.0-1b-speech-8bit \
        --local-dir "$MODEL_DIR"
    echo "✅ Model downloaded to $MODEL_DIR"
else
    echo "✅ Model already exists at $MODEL_DIR"
fi

echo ""
echo "✅ Setup complete! Run 'npm start' to launch the app."
