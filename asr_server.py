#!/usr/bin/env python3
"""
ASR Server for Granite Pill App
Uses IBM granite-4.0-1b-speech-8bit via mlx-audio
Listens on localhost:7777
"""

import os
import sys
import tempfile
import threading
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

# ── Model state ──────────────────────────────────────────────────────────────
model = None
model_ready = False
model_error = None

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "granite-4.0-1b-speech-8bit")


def load_model():
    global model, model_ready, model_error
    try:
        print("[ASR] Loading granite-4.0-1b-speech-8bit...", flush=True)
        from mlx_audio.stt import load as stt_load
        model = stt_load(MODEL_PATH)
        model_ready = True
        print("[ASR] Model ready ✓", flush=True)
    except Exception as e:
        model_error = str(e)
        print(f"[ASR] ERROR loading model: {e}", flush=True)


# ── HTTP Handler ──────────────────────────────────────────────────────────────
class ASRHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress default HTTP logging, we handle our own
        pass

    def _send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {
                "ready": model_ready,
                "error": model_error
            })
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path == "/transcribe":
            if not model_ready:
                self._send_json(503, {
                    "error": "Model not ready yet. Please wait.",
                    "ready": False
                })
                return

            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self._send_json(400, {"error": "No audio data received"})
                return

            audio_data = self.rfile.read(content_length)

            # Write to temp raw file
            tmp = tempfile.NamedTemporaryFile(suffix=".webm", delete=False)
            tmp.write(audio_data)
            tmp.flush()
            tmp.close()

            ffmpeg_path = os.environ.get("FFMPEG_PATH", "ffmpeg")
            tmp_wav = tmp.name + ".wav"

            try:
                print(f"[ASR] Transcribing {len(audio_data)} bytes using ffmpeg...", flush=True)
                import subprocess
                subprocess.run([
                    ffmpeg_path, "-y", "-i", tmp.name,
                    "-ar", "16000", "-ac", "1", tmp_wav
                ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

                result = model.generate(tmp_wav)
                text = result.text.strip() if hasattr(result, "text") else str(result).strip()
                print(f"[ASR] Result: {text}", flush=True)
                self._send_json(200, {"text": text, "ready": True})
            except Exception as e:
                print(f"[ASR] Transcription error: {e}", flush=True)
                self._send_json(500, {"error": str(e)})
            finally:
                if os.path.exists(tmp.name):
                    os.unlink(tmp.name)
                if os.path.exists(tmp_wav):
                    os.unlink(tmp_wav)
        else:
            self._send_json(404, {"error": "Not found"})


# ── Entry ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("ASR_PORT", 7777))

    # Load model in background thread so server starts immediately
    t = threading.Thread(target=load_model, daemon=True)
    t.start()

    server = HTTPServer(("127.0.0.1", port), ASRHandler)
    print(f"[ASR] Server listening on http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[ASR] Shutting down.", flush=True)
        server.server_close()
