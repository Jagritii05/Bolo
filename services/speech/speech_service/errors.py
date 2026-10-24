"""
Exact exception classes specified for LocalPill SpeechService.
"""

class ModelNotReadyException(Exception):
    pass

class InvalidAudioException(Exception):
    pass

class AudioTooLongException(Exception):
    pass

class EngineUnavailableException(Exception):
    pass

class TranscriptionFailedException(Exception):
    pass

class PathNotAllowedException(Exception):
    pass
