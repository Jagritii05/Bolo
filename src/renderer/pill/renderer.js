/* ============================================================
   renderer.js — LocalPill floating pill UI
   ============================================================ */

const pill = document.getElementById('pill');
const micBtn = document.getElementById('micBtn');
const micIcon = document.getElementById('micIcon');
const stopIcon = document.getElementById('stopIcon');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const statusRow = document.getElementById('statusRow');
const transcriptContainer = document.getElementById('transcriptContainer');
const transcriptText = document.getElementById('transcriptText');
const loadingRow = document.getElementById('loadingRow');
const loadingText = document.getElementById('loadingText');
const settingsBtn = document.getElementById('settingsBtn');
const closeBtn = document.getElementById('closeBtn');

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let modelReady = false;
let readyPoller = null;

const api = window.localPill || window.electronAPI;

function setRecordingUI(recording) {
  if (recording) {
    pill.classList.add('recording');
    micIcon.style.display = 'none';
    stopIcon.style.display = 'block';
    showStatus('Recording… press <kbd>Ctrl+Shift+Space</kbd> to finish', 'recording');
    hideTranscript();
    hideLoading();
  } else {
    pill.classList.remove('recording');
    micIcon.style.display = 'block';
    stopIcon.style.display = 'none';
    showStatus('Press <kbd>Ctrl+Shift+Space</kbd> to speak', 'idle');
  }
}

function showStatus(html, type = 'idle') {
  statusRow.style.display = 'flex';
  statusText.innerHTML = html;
  statusDot.className = 'status-dot';
  if (type === 'loading') statusDot.classList.add('loading');
  if (type === 'error') statusDot.classList.add('error');
}

function showTranscript(text) {
  transcriptContainer.style.display = 'block';
  transcriptText.textContent = text;
}

function hideTranscript() {
  transcriptContainer.style.display = 'none';
  transcriptText.textContent = '';
}

function showLoading(msg = 'Transcribing & pasting…') {
  loadingRow.style.display = 'flex';
  loadingText.textContent = msg;
  statusRow.style.display = 'none';
}

function hideLoading() {
  loadingRow.style.display = 'none';
}

// ── Model readiness check ─────────────────────────────────────────────────────
async function checkModelReady() {
  try {
    const health = await api.checkHealth();
    if (health && health.ready) {
      modelReady = true;
      if (readyPoller) {
        clearInterval(readyPoller);
        readyPoller = null;
      }
      showStatus('Press <kbd>Ctrl+Shift+Space</kbd> to speak', 'idle');
    } else {
      showStatus('Loading model in background…', 'loading');
    }
  } catch (_) {
    showStatus('Starting speech backend…', 'loading');
  }
}

function startReadyPoller() {
  showStatus('Starting speech backend…', 'loading');
  readyPoller = setInterval(checkModelReady, 1500);
  checkModelReady();
}

// ── Audio recording ───────────────────────────────────────────────────────────
async function startRecording() {
  if (!modelReady) {
    showStatus('Speech model still warming up…', 'loading');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : '');

    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
      audioChunks = [];

      if (blob.size < 800) {
        showStatus('No speech detected. Try again.', 'idle');
        return;
      }

      await handleAudioBlob(blob);
    };

    mediaRecorder.start(250);
    isRecording = true;
    setRecordingUI(true);
  } catch (err) {
    console.error('Microphone access failed:', err);
    showStatus('Microphone access denied ❌', 'error');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
  setRecordingUI(false);
  showLoading();
}

async function handleAudioBlob(blob) {
  showLoading();
  hideTranscript();

  try {
    const arrayBuffer = await blob.arrayBuffer();
    // Pass buffer to Main process via IPC
    const result = await api.transcribeAudio(new Uint8Array(arrayBuffer));
    hideLoading();

    if (result && result.success && result.text) {
      showTranscript(result.text);
      showStatus('✓ Pasted  ·  Press <kbd>Ctrl+Shift+Space</kbd>', 'idle');
    } else {
      showStatus(result?.error || 'Transcription failed', 'error');
    }
  } catch (err) {
    hideLoading();
    showStatus(`Error: ${err.message}`, 'error');
  }
}

// ── IPC events ────────────────────────────────────────────────────────────────
if (api.onToggleRecording) {
  api.onToggleRecording(({ recording }) => {
    if (recording) {
      startRecording();
    } else {
      if (isRecording) stopRecording();
    }
  });
}

if (api.onEngineChanged) {
  api.onEngineChanged((engineId) => {
    showStatus(`Switched engine: ${engineId}`, 'idle');
  });
}

// ── Button clicks ─────────────────────────────────────────────────────────────
micBtn.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    if (api.openSettings) api.openSettings();
  });
}

closeBtn.addEventListener('click', () => {
  if (isRecording) stopRecording();
  if (api.hidePill) api.hidePill();
});

// ── Init ──────────────────────────────────────────────────────────────────────
startReadyPoller();
