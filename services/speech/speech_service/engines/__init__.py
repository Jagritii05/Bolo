try:
    from .base import SpeechEngine
except ImportError:
    from speech_service.engines.base import SpeechEngine

__all__ = ["SpeechEngine"]
