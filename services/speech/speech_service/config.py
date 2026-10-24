import os
import pathlib

MAX_AUDIO_SECONDS = int(os.environ.get("MAX_AUDIO_SECONDS", "600"))
MAX_AUDIO_MB = int(os.environ.get("MAX_AUDIO_MB", "50"))

user_profile = os.environ.get("USERPROFILE", os.path.expanduser("~"))
app_data = os.environ.get("APPDATA", os.path.join(user_profile, "AppData", "Roaming"))
temp_root = os.environ.get("TEMP", os.path.join(user_profile, "AppData", "Local", "Temp"))

MCP_ALLOWED_DIR = os.environ.get("MCP_ALLOWED_DIR", os.path.join(user_profile, "LocalPillRecordings"))
MODELS_DIR = os.path.join(app_data, "LocalPill", "models")
TEMP_DIR = os.path.join(temp_root, "LocalPill")
FFMPEG_PATH = os.environ.get("FFMPEG_PATH", "ffmpeg")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

# Ensure directories exist
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(MCP_ALLOWED_DIR, exist_ok=True)
