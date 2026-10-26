import os
import gc
import wave
from typing import Dict, Any, Optional
import numpy as np

# Patch PyAV 14+ compatibility where metadata_errors was removed from av.open
try:
    import av
    _orig_av_open = av.open
    def _safe_av_open(*args, **kwargs):
        kwargs.pop("metadata_errors", None)
        return _orig_av_open(*args, **kwargs)
    av.open = _safe_av_open
    try:
        import faster_whisper.audio
        faster_whisper.audio.av.open = _safe_av_open
    except Exception:
        pass
except Exception:
    pass

from .base import SpeechEngine
from ..errors import ModelNotReadyException, TranscriptionFailedException
from ..config import MODELS_DIR

class FasterWhisperEngine(SpeechEngine):
    """
    Local speech-to-text powered by faster-whisper (CTranslate2).
    Supports whisper-tiny, whisper-base, and whisper-small models.
    """
    def __init__(self, model_size: str = "base"):
        self.model_size = model_size
        self.id = f"whisper-{model_size}"
        self.label = f"Local Whisper ({model_size})"
        self.is_local = True
        self._model = None
        self._device = "cpu"
        self._compute_type = "int8"
        self._detect_hardware()

    def _detect_hardware(self) -> None:
        try:
            import ctranslate2
            import ctypes
            cuda_count = ctranslate2.get_cuda_device_count()
            if cuda_count > 0:
                # Ensure CUDA DLLs are present before selecting CUDA device
                ctypes.CDLL("cublas64_12.dll")
                self._device = "cuda"
                self._compute_type = "float16"
                return
        except Exception:
            pass

        self._device = "cpu"
        self._compute_type = "int8"

    def is_available(self) -> bool:
        return True

    def is_downloaded(self) -> bool:
        """Check if model files already exist locally in MODELS_DIR."""
        if not os.path.exists(MODELS_DIR):
            return False
        for item in os.listdir(MODELS_DIR):
            if f"faster-whisper-{self.model_size}" in item:
                return True
        return False

    def load(self) -> None:
        if self._model is not None:
            return

        from faster_whisper import WhisperModel
        os.makedirs(MODELS_DIR, exist_ok=True)

        if self._device == "cuda":
            try:
                candidate = WhisperModel(
                    self.model_size,
                    device="cuda",
                    compute_type=self._compute_type,
                    download_root=MODELS_DIR
                )
                # Dry-run test to ensure CUDA runtime libraries (cublas64_12.dll) exist
                list(candidate.transcribe(np.zeros(1600, dtype=np.float32))[0])
                self._model = candidate
                return
            except Exception as cuda_err:
                # Fall back to CPU if CUDA runtime DLLs are missing
                self._device = "cpu"
                self._compute_type = "int8"
                del candidate
                gc.collect()

        try:
            self._model = WhisperModel(
                self.model_size,
                device="cpu",
                compute_type="int8",
                download_root=MODELS_DIR
            )
        except Exception as e:
            raise ModelNotReadyException(f"Failed to load WhisperModel ({self.model_size}): {e}") from e

    def unload(self) -> None:
        if self._model is not None:
            del self._model
            self._model = None
            gc.collect()

    def transcribe(self, wav_path: str, prompt: str = "") -> Dict[str, Any]:
        if self._model is None:
            self.load()

        if not os.path.exists(wav_path):
            raise FileNotFoundError(f"Audio file not found: {wav_path}")

        try:
            # Read 16kHz mono WAV directly into float32 numpy array for maximum speed & stability
            audio_data = None
            try:
                with wave.open(wav_path, "rb") as wf:
                    if wf.getnchannels() == 1 and wf.getsampwidth() == 2 and wf.getframerate() == 16000:
                        raw = wf.readframes(wf.getnframes())
                        audio_data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
            except Exception:
                audio_data = None

            audio_input = audio_data if audio_data is not None else wav_path

            segments, info = self._model.transcribe(
                audio_input,
                initial_prompt=prompt if prompt else None,
                word_timestamps=True,
                beam_size=5
            )

            text_pieces = []
            words = []
            for segment in segments:
                text_pieces.append(segment.text.strip())
                if segment.words:
                    for w in segment.words:
                        words.append({
                            "word": w.word.strip(),
                            "start": round(float(w.start), 3),
                            "end": round(float(w.end), 3),
                            "prob": round(float(w.probability), 3)
                        })

            full_text = " ".join(text_pieces).strip()
            return {
                "text": full_text,
                "language": info.language if hasattr(info, "language") else "en",
                "duration": round(float(info.duration), 3) if hasattr(info, "duration") else 0.0,
                "words": words
            }
        except Exception as e:
            if isinstance(e, (ModelNotReadyException, TranscriptionFailedException)):
                raise
            raise TranscriptionFailedException(f"Transcription execution error: {e}") from e
