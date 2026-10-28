import os
import wave
import subprocess
import tempfile
from typing import Tuple
from .errors import InvalidAudioException, AudioTooLongException
from .config import MAX_AUDIO_SECONDS, MAX_AUDIO_MB, TEMP_DIR, FFMPEG_PATH

def validate_audio_file(file_path: str) -> int:
    """Validate that audio file exists and is within size limits."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file does not exist: {file_path}")

    size_bytes = os.path.getsize(file_path)
    if size_bytes == 0:
        raise InvalidAudioException(f"Audio file is empty (0 bytes): {file_path}")

    max_bytes = MAX_AUDIO_MB * 1024 * 1024
    if size_bytes > max_bytes:
        raise AudioTooLongException(
            f"Audio file size ({size_bytes / (1024*1024):.1f} MB) exceeds maximum allowed {MAX_AUDIO_MB} MB"
        )

    return size_bytes

def convert_to_wav(input_path: str, output_path: str = None) -> Tuple[str, float]:
    """
    Converts any supported audio format to 16 kHz 16-bit mono WAV.
    Uses PyAV for fast, in-process decoding; falls back to ffmpeg CLI if available.
    Returns (output_wav_path, duration_seconds).
    """
    validate_audio_file(input_path)

    if output_path is None:
        os.makedirs(TEMP_DIR, exist_ok=True)
        fd, output_path = tempfile.mkstemp(suffix=".wav", dir=TEMP_DIR)
        os.close(fd)

    # Try PyAV first (no external binary dependency required)
    converted = False
    duration = 0.0

    try:
        import av
        with av.open(input_path) as container:
            if not container.streams.audio:
                raise InvalidAudioException("No audio streams found in media file.")
            
            in_stream = container.streams.audio[0]
            # Resampler to 16000 Hz, mono, s16 format
            resampler = av.AudioResampler(format='s16', layout='mono', rate=16000)
            
            with wave.open(output_path, 'wb') as wav_out:
                wav_out.setnchannels(1)
                wav_out.setsampwidth(2)
                wav_out.setframerate(16000)
                
                total_frames = 0
                for packet in container.demux(in_stream):
                    for frame in packet.decode():
                        resampled_frames = resampler.resample(frame)
                        for rframe in resampled_frames:
                            data = rframe.to_ndarray().tobytes()
                            wav_out.writeframes(data)
                            total_frames += rframe.samples

                duration = total_frames / 16000.0
                converted = True
    except Exception as av_err:
        # Fall back to ffmpeg if PyAV fails
        pass

    if not converted:
        try:
            cmd = [
                FFMPEG_PATH,
                "-y",
                "-i", input_path,
                "-ac", "1",
                "-ar", "16000",
                "-acodec", "pcm_s16le",
                output_path
            ]
            no_window = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            res = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                creationflags=no_window
            )
            if res.returncode != 0:
                raise InvalidAudioException(f"FFmpeg conversion failed: {res.stderr}")

            # Get duration from wave file
            with wave.open(output_path, 'rb') as w:
                frames = w.getnframes()
                rate = w.getframerate()
                duration = frames / float(rate)
            converted = True
        except Exception as e:
            if os.path.exists(output_path):
                try:
                    os.remove(output_path)
                except OSError:
                    pass
            if isinstance(e, InvalidAudioException):
                raise
            raise InvalidAudioException(f"Failed to decode or convert audio file: {e}") from e

    if duration > MAX_AUDIO_SECONDS:
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
            except OSError:
                pass
        raise AudioTooLongException(
            f"Audio duration ({duration:.1f}s) exceeds maximum allowed {MAX_AUDIO_SECONDS}s"
        )

    return output_path, duration
