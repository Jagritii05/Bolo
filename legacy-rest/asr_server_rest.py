#!/usr/bin/env python3
"""
Legacy REST ASR Server for LocalPill Baseline Comparison.
Runs on Windows using speech_service engine abstractions.
Listens on 127.0.0.1:7777 (or ASR_PORT).
"""

import os
import sys
import tempfile
import threading
import json
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

# Add root directory to sys.path so speech_service can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "speech")))

from speech_service.registry import registry
from speech_service.audio_prep import convert_to_wav
from speech_service.errors import ModelNotReadyException

model_ready = False
model_error = None
last_load_ms = 0
last_device = "cpu"
last_compute_type = "int8"

def load_engine():
    global model_ready, model_error, last_load_ms, last_device, last_compute_type
    try:
        engine = registry.get_engine()
        print(f"[ASR-REST] Loading active engine: {engine.id} ({engine.label})...", flush=True)
        t0 = time.time()
        engine.load()
        last_load_ms = round((time.time() - t0) * 1000)
        last_device = getattr(engine, "_device", "cloud" if not engine.is_local else "cpu")
        last_compute_type = getattr(engine, "_compute_type", "n/a")
        model_ready = True
        model_error = None
        print(f"[ASR-REST] Engine {engine.id} ready in {last_load_ms}ms on {last_device} ({last_compute_type}) [OK]", flush=True)
    except Exception as e:
        model_error = str(e)
        model_ready = False
        print(f"[ASR-REST] ERROR loading engine: {e}", flush=True)

class ASRRestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress noisy HTTP request logging
        pass

    def _send_json(self, status: int, data: dict):
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
                "error": model_error,
                "engine": registry.active_engine_id,
                "load_ms": last_load_ms,
                "device": last_device,
                "compute_type": last_compute_type,
            })
        elif self.path == "/engines":
            self._send_json(200, {
                "engines": registry.list_engines(),
                "active": registry.active_engine_id,
                "device": last_device,
                "load_ms": last_load_ms,
            })
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        global model_ready, model_error, last_load_ms, last_device, last_compute_type
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

            prompt = self.headers.get("X-Prompt", "")
            
            remaining = content_length
            chunks = []
            while remaining > 0:
                chunk = self.rfile.read(min(remaining, 65536))
                if not chunk:
                    break
                chunks.append(chunk)
                remaining -= len(chunk)
            audio_data = b"".join(chunks)

            tmp_in = tempfile.NamedTemporaryFile(suffix=".webm", delete=False)
            tmp_in.write(audio_data)
            tmp_in.flush()
            tmp_in.close()

            wav_path = None
            try:
                wav_path, duration = convert_to_wav(tmp_in.name)
                engine = registry.get_engine()
                res = engine.transcribe(wav_path, prompt=prompt)
                self._send_json(200, {
                    "text": res.get("text", ""),
                    "language": res.get("language", "en"),
                    "duration": res.get("duration", duration),
                    "words": res.get("words", []),
                    "ready": True
                })
            except Exception as e:
                self._send_json(500, {"error": str(e), "ready": model_ready})
            finally:
                if os.path.exists(tmp_in.name):
                    try:
                        os.unlink(tmp_in.name)
                    except OSError:
                        pass
                if wav_path and os.path.exists(wav_path):
                    try:
                        os.unlink(wav_path)
                    except OSError:
                        pass
        elif self.path == "/engine":
            content_length = int(self.headers.get("Content-Length", 0))
            try:
                body = json.loads(self.rfile.read(content_length).decode("utf-8"))
                new_id = body.get("engine_id")
                print(f"[ASR-REST] Switching engine to: {new_id}...", flush=True)
                t0 = time.time()
                engine = registry.set_active_engine(new_id)
                engine.load()
                last_load_ms = round((time.time() - t0) * 1000)
                last_device = getattr(engine, "_device", "cloud" if not engine.is_local else "cpu")
                last_compute_type = getattr(engine, "_compute_type", "n/a")
                model_ready = True
                model_error = None
                print(f"[ASR-REST] Switched to {new_id} in {last_load_ms}ms on {last_device} [OK]", flush=True)
                self._send_json(200, {
                    "success": True,
                    "active": new_id,
                    "load_ms": last_load_ms,
                    "device": last_device,
                    "compute_type": last_compute_type,
                })
            except Exception as e:
                model_error = str(e)
                print(f"[ASR-REST] Error switching engine to {new_id}: {e}", flush=True)
                self._send_json(400, {"error": str(e)})
        else:
            self._send_json(404, {"error": "Not found"})

def run_server(port: int = 7777):
    t = threading.Thread(target=load_engine, daemon=True)
    t.start()

    server = HTTPServer(("127.0.0.1", port), ASRRestHandler)
    print(f"[ASR-REST] Server listening on http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[ASR-REST] Shutting down.", flush=True)
        server.server_close()

if __name__ == "__main__":
    port = int(os.environ.get("ASR_PORT", 7777))
    run_server(port)
