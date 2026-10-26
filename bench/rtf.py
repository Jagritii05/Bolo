#!/usr/bin/env python3
"""
LocalPill: Real-Time Factor (RTF) and Engine Benchmark.
Measures model load latency, inference duration, Real-Time Factor (RTF),
and peak memory usage for local Whisper engines.
"""

import os
import sys
import time
import json
import wave
import tempfile
import ctypes
from ctypes import wintypes

# Add root directory to sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "services", "speech"))

from speech_service.registry import registry

class PROCESS_MEMORY_COUNTERS(ctypes.Structure):
    _fields_ = [
        ("cb", wintypes.DWORD),
        ("PageFaultCount", wintypes.DWORD),
        ("PeakWorkingSetSize", ctypes.c_size_t),
        ("WorkingSetSize", ctypes.c_size_t),
        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
        ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
        ("PagefileUsage", ctypes.c_size_t),
        ("PeakPagefileUsage", ctypes.c_size_t),
    ]

def get_memory_mb() -> float:
    try:
        pmc = PROCESS_MEMORY_COUNTERS()
        pmc.cb = ctypes.sizeof(PROCESS_MEMORY_COUNTERS)
        fn = ctypes.windll.kernel32.K32GetProcessMemoryInfo
        fn.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESS_MEMORY_COUNTERS), wintypes.DWORD]
        fn.restype = wintypes.BOOL
        handle = ctypes.windll.kernel32.GetCurrentProcess()
        if fn(handle, ctypes.byref(pmc), pmc.cb):
            return round(pmc.WorkingSetSize / (1024 * 1024), 1)
    except Exception:
        pass
    return 0.0

def create_sine_wav(path: str, duration_sec: float = 2.0, sample_rate: int = 16000):
    import math
    num_samples = int(duration_sec * sample_rate)
    with wave.open(path, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        frames = bytearray()
        for i in range(num_samples):
            val = int(32767 * 0.3 * math.sin(2 * math.pi * 440 * i / sample_rate))
            frames.extend(val.to_bytes(2, byteorder="little", signed=True))
        wav.writeframes(frames)

def benchmark_engine(engine_id: str, wav_paths: list) -> dict:
    print(f"\n[RTF Bench] Testing Engine: {engine_id}...", flush=True)

    engine = registry.get_engine(engine_id)
    if not engine:
        return {"error": f"Engine {engine_id} not found in registry"}

    # Unload to measure fresh load time
    engine.unload()
    mem_before = get_memory_mb()

    # Measure load time
    t0 = time.perf_counter()
    engine.load()
    load_time_ms = round((time.perf_counter() - t0) * 1000, 1)
    mem_after_load = get_memory_mb()

    print(f"  Model loaded in {load_time_ms} ms (RAM: {mem_after_load} MB, +{round(mem_after_load - mem_before, 1)} MB)", flush=True)

    sample_results = []
    for (label, wav_path, duration) in wav_paths:
        # Warmup
        engine.transcribe(wav_path)

        # 2 measured runs
        runs = []
        for _ in range(2):
            t_inf = time.perf_counter()
            res = engine.transcribe(wav_path)
            elapsed_sec = time.perf_counter() - t_inf
            runs.append(elapsed_sec)

        avg_inference_sec = sum(runs) / len(runs)
        rtf = round(avg_inference_sec / duration, 3)
        sample_results.append({
            "sample": label,
            "durationSec": duration,
            "avgInferenceMs": round(avg_inference_sec * 1000, 1),
            "rtf": rtf,
            "realTimeFasterThanAudio": round(1.0 / rtf, 1) if rtf > 0 else 0,
        })
        print(f"  Sample '{label}' ({duration}s): {round(avg_inference_sec * 1000, 1)} ms -> RTF={rtf} ({round(1.0 / rtf, 1)}x real-time)", flush=True)

    peak_mem = get_memory_mb()
    engine.unload()

    return {
        "engineId": engine_id,
        "label": engine.label,
        "device": getattr(engine, "_device", "cpu"),
        "computeType": getattr(engine, "_compute_type", "int8"),
        "loadTimeMs": load_time_ms,
        "memoryMb": {
            "initial": mem_before,
            "loaded": mem_after_load,
            "peak": peak_mem,
            "delta": round(peak_mem - mem_before, 1)
        },
        "samples": sample_results
    }

def main():
    print("=== [LOCALPILL REAL-TIME FACTOR & ENGINE BENCHMARK] ===")

    results_dir = os.path.join(PROJECT_ROOT, "bench", "results")
    os.makedirs(results_dir, exist_ok=True)

    # Prepare audio samples (1.0s, 3.0s, 5.0s)
    tmp_dir = tempfile.gettempdir()
    wav_1s = os.path.join(tmp_dir, "bench_1s.wav")
    wav_3s = os.path.join(tmp_dir, "bench_3s.wav")
    create_sine_wav(wav_1s, 1.0)
    create_sine_wav(wav_3s, 3.0)

    samples = [
        ("1.0s utterance", wav_1s, 1.0),
        ("3.0s utterance", wav_3s, 3.0),
    ]

    engine_data = []
    # Test local engines
    for eid in ["whisper-tiny", "whisper-base"]:
        try:
            res = benchmark_engine(eid, samples)
            engine_data.append(res)
        except Exception as e:
            print(f"Error testing {eid}: {e}", file=sys.stderr)

    out_file = os.path.join(results_dir, "rtf.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(engine_data, f, indent=2)

    # Cleanup temp audio
    for p in [wav_1s, wav_3s]:
        if os.path.exists(p):
            try:
                os.unlink(p)
            except OSError:
                pass

    print(f"\n[RTF Bench] Saved raw engine metrics to: {out_file}")
    print("=== [ENGINE BENCHMARK COMPLETE] ===\n")

if __name__ == "__main__":
    main()
