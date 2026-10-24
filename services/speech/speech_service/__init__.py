"""
LocalPill Speech Service Package
"""
from .registry import registry
from .audio_prep import convert_to_wav, validate_audio_file
from .errors import (
    ModelNotReadyException,
    InvalidAudioException,
    AudioTooLongException,
    EngineUnavailableException,
    TranscriptionFailedException,
    PathNotAllowedException,
)

__all__ = [
    "registry",
    "convert_to_wav",
    "validate_audio_file",
    "ModelNotReadyException",
    "InvalidAudioException",
    "AudioTooLongException",
    "EngineUnavailableException",
    "TranscriptionFailedException",
    "PathNotAllowedException",
]
