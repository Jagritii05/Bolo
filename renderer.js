/* ============================================================
   renderer.js — Granite Pill renderer process
   - Captures mic audio via MediaRecorder
   - Sends WAV/WebM to Python ASR server
   - Displays transcript in the pill
   ============================================================ */

const ASR_URL = 'http://127.0.0.1:7777';
const POLL_INTERVAL_MS = 2000; // check model readiness every 2s

// ── DOM refs ──────────────────────────────────────────────────────────────────
const pill          = document.getElementById('pill');
const micBtn        = document.getElementById('micBtn');
const micIcon       = document.getElementById('micIcon');
const stopIcon      = document.getElementById('stopIcon');
const statusDot     = document.getElementById('statusDot');
const statusText    = document.getElementById('statusText');
const statusRow     = document.getElementById('statusRow');
const transcriptContainer = document.getElementById('transcriptContainer');
const transcriptText      = document.getElementById('transcriptText');
const loadingRow    = document.getElementById('loadingRow');
const loadingText   = document.getElementById('loadingText');
const closeBtn      = document.getElementById('closeBtn');

// ── State ─────────────────────────────────────────────────────────────────────
let mediaRecorder  = null;
let audioChunks    = [];
let isRecording    = false;
let modelReady     = false;
let readyPoller    = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function setRecordingUI(recording) {
  if (recording) {
    pill.classList.add('recording');
    micIcon.style.display  = 'none';
    stopIcon.style.display = 'block';
    showStatus('Recording… press ⇧X to stop', 'recording');
    hideTranscript();
    hideLoading();
  } else {
    pill.classList.remove('recording');
    micIcon.style.display  = 'block';
    stopIcon.style.display = 'none';
    showStatus('Press <kbd>⇧X</kbd> to start', 'idle');
  }
}

function showStatus(html, _type) {
  statusRow.style.display = 'flex';
  statusText.innerHTML = html;
}

function hideStatus() {
  statusRow.style.display = 'none';
}

function showTranscript(text) {
  transcriptContainer.style.display = 'block';
  transcriptText.textContent = text;
}

function hideTranscript() {
  transcriptContainer.style.display = 'none';
  transcriptText.textContent = '';
}

function showLoading(msg = 'Transcribing…') {
  loadingRow.style.display = 'flex';
  loadingText.textContent = msg;
  statusRow.style.display = 'none';
}

function hideLoading() {
  loadingRow.style.display = 'none';
}

// ── Model readiness polling ───────────────────────────────────────────────────
async function checkModelReady() {
  try {
    const res = await fetch(`${ASR_URL}/health`, { signal: AbortSignal.timeout(1500) });
    const data = await res.json();
    if (data.ready) {
      modelReady = true;
      clearInterval(readyPoller);
      readyPoller = null;
      showStatus('Press <kbd>⇧X</kbd> to start', 'idle');
      console.log('[Renderer] Model ready!');
    } else {
      showStatus('Loading model…', 'idle');
    }
  } catch (_) {
    showStatus('Starting server…', 'idle');
  }
}

function startReadyPoller() {
  showStatus('Loading model…', 'idle');
  readyPoller = setInterval(checkModelReady, POLL_INTERVAL_MS);
  checkModelReady(); // immediate first check
}

// ── Audio capture ─────────────────────────────────────────────────────────────
async function startRecording() {
  console.log('[startRecording] Enter');
  if (!modelReady) {
    showStatus('Model not ready yet, please wait…', 'idle');
    return;
  }

  try {
    console.log('[startRecording] Requesting getUserMedia...');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    console.log('[startRecording] getUserMedia success');

    const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
      ? 'audio/ogg;codecs=opus'
      : 'audio/webm;codecs=opus';
    
    console.log('[startRecording] Selected mimeType:', mimeType);

    mediaRecorder = new MediaRecorder(stream, { mimeType });
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      console.log('[startRecording] ondataavailable size:', e.data ? e.data.size : 0);
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      console.log('[startRecording] MediaRecorder stopped');
      stream.getTracks().forEach(t => t.stop());

      const blob = new Blob(audioChunks, { type: mimeType });
      audioChunks = [];

      console.log('[startRecording] Blob created, size:', blob.size);
      if (blob.size < 1000) {
        showStatus('No audio captured. Try again.', 'idle');
        return;
      }

      await transcribeBlob(blob);
    };

    console.log('[startRecording] Starting mediaRecorder...');
    mediaRecorder.start(250); // collect chunks every 250ms
    isRecording = true;
    setRecordingUI(true);
    console.log('[startRecording] Recording started perfectly');
  } catch (err) {
    console.error('[Renderer] Mic error:', err);
    showStatus('Microphone access denied ❌', 'idle');
  }
}

function stopRecording() {
  console.log('[stopRecording] Enter');
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
  setRecordingUI(false);
  window.electronAPI.recordingDone();
  showLoading('Transcribing…');
  console.log('[stopRecording] Exit');
}

// ── Transcription ─────────────────────────────────────────────────────────────
async function transcribeBlob(blob) {
  showLoading('Transcribing…');
  hideTranscript();

  try {
    console.log('[transcribeBlob] Extracting arrayBuffer...');
    const arrayBuffer = await blob.arrayBuffer();
    
    console.log('[transcribeBlob] Successfully extracted arrayBuffer. Sending POST request to Python (ffmpeg)...');
    const response = await fetch(`${ASR_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: arrayBuffer,
    });

    const data = await response.json();
    hideLoading();

    if (response.ok && data.text) {
      showTranscript(data.text);
      showStatus('✓ Done  ·  Press <kbd>⇧X</kbd> again', 'idle');
      statusRow.style.display = 'flex';

      // Auto copy to clipboard via Main Process (bypassing Browser blur restrictions)
      window.electronAPI.pasteText(data.text);
    } else {
      showStatus(data.error || 'Transcription failed', 'idle');
    }
  } catch (err) {
    hideLoading();
    console.error('[Renderer] Fetch error:', err);
    showStatus('Server error — check console', 'idle');
  }
}

// ── IPC from main process (global shortcut Shift+X) ──────────────────────────
window.electronAPI.onToggle(({ recording, hide }) => {
  console.log('[onToggle] Received:', { recording, hide });
  if (hide) {
    console.log('[onToggle] Hiding...');
    setRecordingUI(false);
    hideTranscript();
    hideLoading();
    return;
  }

  if (recording) {
    console.log('[onToggle] Handling start recording...');
    startRecording();
  } else {
    console.log('[onToggle] Handling stop recording...');
    if (isRecording) stopRecording();
  }
});

// ── Mic button click (in-pill click) ─────────────────────────────────────────
micBtn.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// ── Close button ──────────────────────────────────────────────────────────────
closeBtn.addEventListener('click', () => {
  if (isRecording) stopRecording();
  window.electronAPI.hideWindow();
});

// ── Init ──────────────────────────────────────────────────────────────────────
startReadyPoller();
