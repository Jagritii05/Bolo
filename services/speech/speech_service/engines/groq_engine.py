import os
import requests
from typing import Dict, Any
from .base import SpeechEngine
from ..errors import EngineUnavailableException, TranscriptionFailedException
from ..config import GROQ_API_KEY

class GroqEngine(SpeechEngine):
    """
    Opt-in cloud transcription via Groq's high-speed Whisper API.
    """
    id = "groq-whisper"
    label = "Groq Whisper (Cloud: whisper-large-v3-turbo)"
    is_local = False

    def __init__(self, api_key: str = ""):
        self.api_key = api_key or os.environ.get("GROQ_API_KEY", GROQ_API_KEY)
        self.endpoint = "https://api.groq.com/openai/v1/audio/transcriptions"
        self.model_name = "whisper-large-v3-turbo"

    def is_available(self) -> bool:
        key = self.api_key or os.environ.get("GROQ_API_KEY", "")
        return bool(key and key.strip())

    def load(self) -> None:
        if not self.is_available():
            raise EngineUnavailableException("Groq API key not set. Set GROQ_API_KEY environment variable or in Settings.")

    def unload(self) -> None:
        pass

    def transcribe(self, wav_path: str, prompt: str = "") -> Dict[str, Any]:
        key = self.api_key or os.environ.get("GROQ_API_KEY", "")
        if not key:
            raise EngineUnavailableException("Groq API key not configured.")

        headers = {
            "Authorization": f"Bearer {key}"
        }

        try:
            with open(wav_path, "rb") as f:
                files = {
                    "file": (os.path.basename(wav_path), f, "audio/wav")
                }
                data = {
                    "model": self.model_name,
                    "response_format": "verbose_json"
                }
                if prompt:
                    data["prompt"] = prompt

                resp = requests.post(self.endpoint, headers=headers, files=files, data=data, timeout=30)

            if resp.status_code != 200:
                raise TranscriptionFailedException(f"Groq API error {resp.status_code}: {resp.text}")

            result = resp.json()
            words_raw = result.get("words", [])
            words = []
            for w in words_raw:
                words.append({
                    "word": w.get("word", "").strip(),
                    "start": float(w.get("start", 0.0)),
                    "end": float(w.get("end", 0.0)),
                    "prob": float(w.get("probability", 1.0))
                })

            return {
                "text": result.get("text", "").strip(),
                "language": result.get("language", "en"),
                "duration": float(result.get("duration", 0.0)),
                "words": words
            }
        except Exception as e:
            if isinstance(e, (EngineUnavailableException, TranscriptionFailedException)):
                raise
            raise TranscriptionFailedException(f"Groq transcription failed: {e}") from e
