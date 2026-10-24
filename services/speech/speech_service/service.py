"""
SpeechService implementation for LocalPill.
Exposes clean, type-safe methods for Graftcode RPC and local consumers.
"""

import os
import json
import tempfile
from typing import Dict, Any, List

from .registry import registry
from .audio_prep import convert_to_wav
from .errors import (
    ModelNotReadyException,
    InvalidAudioException,
    AudioTooLongException,
    EngineUnavailableException,
    TranscriptionFailedException,
    PathNotAllowedException,
)
from .config import MCP_ALLOWED_DIR, TEMP_DIR

class SpeechService:
    """
    LocalPill Speech Service.
    Can be loaded directly as a Graftcode module or called via IPC bridge.
    """

    def __init__(self):
        self._registry = registry

    def is_ready(self) -> bool:
        """Check if active engine is loaded and ready."""
        try:
            eng = self._registry.get_engine()
            return eng.is_available()
        except Exception:
            return False

    def health(self) -> Dict[str, Any]:
        """Return engine readiness and status."""
        try:
            eng = self._registry.get_engine()
            return {
                "ready": True,
                "engine": eng.id,
                "label": eng.label,
                "is_local": eng.is_local,
                "error": None,
            }
        except Exception as e:
            return {
                "ready": False,
                "engine": self._registry.active_engine_id,
                "label": "Unavailable",
                "is_local": True,
                "error": str(e),
            }

    def health_json(self) -> str:
        """Health status serialized as JSON string."""
        return json.dumps(self.health())

    def list_engines(self) -> List[Dict[str, Any]]:
        """List all supported transcription engines."""
        return self._registry.list_engines()

    def list_engines_json(self) -> str:
        """List engines serialized as JSON string."""
        return json.dumps(self.list_engines())

    def switch_engine(self, engine_id: str) -> bool:
        """Switch active engine and load into memory."""
        engine = self._registry.set_active_engine(engine_id)
        engine.load()
        return True

    def transcribe_file(self, file_path: str, prompt: str = "") -> Dict[str, Any]:
        """
        Transcribe an existing audio file on disk.
        Converts to 16 kHz mono WAV and transcribes using the active engine.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        wav_path = None
        try:
            wav_path, duration = convert_to_wav(file_path)
            engine = self._registry.get_engine()
            result = engine.transcribe(wav_path, prompt=prompt)
            result["duration"] = result.get("duration") or duration
            return result
        finally:
            if wav_path and os.path.exists(wav_path) and wav_path != file_path:
                try:
                    os.remove(wav_path)
                except OSError:
                    pass

    def transcribe_file_json(self, file_path: str, prompt: str = "") -> str:
        """Transcribe file with JSON string return (safe for Graft wire serialization)."""
        res = self.transcribe_file(file_path, prompt=prompt)
        return json.dumps(res)

    def transcribe_bytes(self, audio_bytes: bytes, prompt: str = "") -> Dict[str, Any]:
        """
        Transcribe raw audio bytes (WebM, WAV, OGG, etc.) received over wire.
        """
        if not audio_bytes or len(audio_bytes) == 0:
            raise InvalidAudioException("Empty audio payload received (0 bytes).")

        os.makedirs(TEMP_DIR, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(suffix=".webm", dir=TEMP_DIR)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(audio_bytes)
            return self.transcribe_file(tmp_path, prompt=prompt)
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

    def transcribe_bytes_json(self, audio_bytes: bytes, prompt: str = "") -> str:
        """Transcribe raw audio bytes with JSON string return."""
        res = self.transcribe_bytes(audio_bytes, prompt=prompt)
        return json.dumps(res)

    # ── MCP Endpoint ─────────────────────────────────────────────────────────
    @staticmethod
    def TranscribeFileJson(filePath: str, prompt: str = "") -> str:
        """
        MCP Tool: Transcribes an audio file within the allowed recordings boundary.
        Path is restricted to MCP_ALLOWED_DIR to prevent arbitrary disk access.
        """
        norm_path = os.path.normpath(filePath)
        norm_allowed = os.path.normpath(MCP_ALLOWED_DIR)

        if not norm_path.startswith(norm_allowed):
            raise PathNotAllowedException(
                f"Access denied: Path '{filePath}' is outside allowed directory '{MCP_ALLOWED_DIR}'"
            )

        svc = SpeechService()
        return svc.transcribe_file_json(norm_path, prompt=prompt)


# Module-level instance
speech_service = SpeechService()
