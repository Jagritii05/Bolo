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
const resultsContainer = document.getElementById('resultsContainer');
const resultsTitle = document.getElementById('resultsTitle');
const resultsList = document.getElementById('resultsList');
const resultsCloseBtn = document.getElementById('resultsCloseBtn');

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isStarting = false;
let shouldStopImmediately = false;
let activeStream = null;
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

function showResults(results, title) {
  hideTranscript();
  hideLoading();
  statusRow.style.display = 'none';

  resultsTitle.textContent = title || 'Screenshots';
  resultsList.innerHTML = '';

  if (!results || results.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:12px;color:#94a3b8;padding:8px 0;';
    empty.textContent = 'No matching screenshots found.';
    resultsList.appendChild(empty);
  } else {
    results.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'result-item';

      const fileName = item.filePath ? item.filePath.split(/[\\/]/).pop() : 'screenshot.png';
      const scoreBadge = (typeof item.score === 'number' && item.score > 0)
        ? `<span class="result-score">${Math.round(item.score * 100)}% match</span>`
        : '';

      card.innerHTML = `
        <div class="result-header-row">
          <span class="result-name" title="${fileName}">${fileName}</span>
          ${scoreBadge}
        </div>
        <div class="result-desc" title="${item.description || ''}">${item.description || 'No description available.'}</div>
        <div class="result-actions">
          <button class="result-btn action-copy-path">Copy Path</button>
          <button class="result-btn action-copy-img">Copy Image</button>
          <button class="result-btn action-open">Open</button>
        </div>
      `;

      const pathBtn = card.querySelector('.action-copy-path');
      const imgBtn = card.querySelector('.action-copy-img');
      const openBtn = card.querySelector('.action-open');

      pathBtn.addEventListener('click', async () => {
        if (api.copyPath) {
          await api.copyPath(item.filePath);
          pathBtn.textContent = 'Copied!';
          setTimeout(() => { pathBtn.textContent = 'Copy Path'; }, 1500);
        }
      });

      imgBtn.addEventListener('click', async () => {
        if (api.copyImage) {
          const ok = await api.copyImage(item.filePath);
          imgBtn.textContent = ok ? 'Copied!' : 'Failed';
          setTimeout(() => { imgBtn.textContent = 'Copy Image'; }, 1500);
        }
      });

      openBtn.addEventListener('click', () => {
        if (api.showInFolder) {
          api.showInFolder(item.filePath);
        }
      });

      resultsList.appendChild(card);
    });
  }

  resultsContainer.style.display = 'flex';
  pill.classList.add('expanded');
  if (api.setPillHeight) {
    api.setPillHeight(360);
  }
}

function hideResults() {
  resultsContainer.style.display = 'none';
  pill.classList.remove('expanded');
  if (api.setPillHeight) {
    api.setPillHeight(68);
  }
  showStatus('Press <kbd>Ctrl+Shift+Space</kbd> to speak', 'idle');
}

if (resultsCloseBtn) {
  resultsCloseBtn.addEventListener('click', hideResults);
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
      const msg = health?.kind === 'MODEL_LOADING'
        ? 'Loading speech model…'
        : (health?.error || 'Starting services…');
      showStatus(msg, 'loading');
    }
  } catch (_) {
    showStatus('Starting services…', 'loading');
  }
}

function startReadyPoller() {
  showStatus('Starting services…', 'loading');
  readyPoller = setInterval(checkModelReady, 1500);
  checkModelReady();
}

function resetToReadyLater(delayMs = 2800) {
  setTimeout(() => {
    if (!isRecording) {
      showStatus('Press <kbd>Ctrl+Shift+Space</kbd> to speak', 'idle');
    }
  }, delayMs);
}

// ── Audio recording ───────────────────────────────────────────────────────────
async function startRecording() {
  if (resultsContainer && resultsContainer.style.display !== 'none') {
    hideResults();
  }

  if (isRecording || isStarting) {
    return;
  }

  if (!modelReady) {
    showStatus('Loading speech model…', 'loading');
    return;
  }

  isStarting = true;
  shouldStopImmediately = false;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });

    if (shouldStopImmediately || !isStarting) {
      stream.getTracks().forEach((track) => track.stop());
      isStarting = false;
      return;
    }

    activeStream = stream;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');

    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
        activeStream = null;
      }
      const blob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
      audioChunks = [];

      if (blob.size < 1200) {
        showStatus("Didn't catch any audio. Try again.", 'idle');
        resetToReadyLater(2500);
        return;
      }

      await handleAudioBlob(blob);
    };

    mediaRecorder.start();
    isRecording = true;
    isStarting = false;
    setRecordingUI(true);
  } catch (err) {
    isStarting = false;
    isRecording = false;
    setRecordingUI(false);
    console.error('Microphone access failed:', err);
    showStatus(
      '<span id="micErrLink" style="cursor:pointer;text-decoration:underline;">Allow microphone access in Windows Settings > Privacy.</span>',
      'error'
    );
    const link = document.getElementById('micErrLink');
    if (link) {
      link.addEventListener('click', () => {
        if (api.openMicSettings) api.openMicSettings();
      });
    }
  }
}

function stopRecording() {
  if (isStarting) {
    shouldStopImmediately = true;
    isStarting = false;
    setRecordingUI(false);
    return;
  }

  if (!isRecording) {
    return;
  }

  isRecording = false;
  setRecordingUI(false);
  showLoading();

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

async function handleAudioBlob(blob) {
  showLoading('Processing speech…');
  hideTranscript();

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const result = await api.transcribeAudio(new Uint8Array(arrayBuffer));
    hideLoading();

    if (!result) {
      showStatus('Transcription failed. Details in log.', 'error');
      resetToReadyLater(3000);
      return;
    }

    if (!result.success) {
      const errMsg = result.error || 'Transcription failed. Details in log.';
      showStatus(errMsg, 'error');
      resetToReadyLater(3500);
      return;
    }

    // Assistant intent routing responses
    if (result.mode === 'find') {
      showResults(result.results || [], result.text || 'Matching Screenshots');
      return;
    }

    if (result.mode === 'remember') {
      showStatus('Screen saved to memory · Press <kbd>Ctrl+Shift+Space</kbd>', 'idle');
      resetToReadyLater(3500);
      return;
    }

    if (resultsContainer && resultsContainer.style.display !== 'none') {
      hideResults();
    }

    if (result.mode === 'summarize') {
      if (result.text && result.text.trim()) {
        showStatus('Summary copied to clipboard · Press <kbd>Ctrl+Shift+Space</kbd>', 'idle');
        resetToReadyLater(3500);
      } else {
        showStatus('No recent screenshots to summarize.', 'idle');
        resetToReadyLater(2500);
      }
      return;
    }

    if (result.mode === 'ask') {
      if (result.text && result.text.trim()) {
        showStatus('Pasted reply · Press <kbd>Ctrl+Shift+Space</kbd>', 'idle');
        resetToReadyLater(3500);
      } else {
        showStatus('Could not answer from screen.', 'idle');
        resetToReadyLater(2500);
      }
      return;
    }

    // Standard dictation
    if (result.text && result.text.trim()) {
      if (result.warning) {
        showStatus(result.warning, 'error');
        resetToReadyLater(4000);
      } else {
        showStatus('Pasted · Press <kbd>Ctrl+Shift+Space</kbd>', 'idle');
        resetToReadyLater(3500);
      }
    } else {
      showStatus("Didn't catch any audio. Try again.", 'idle');
      resetToReadyLater(2500);
    }
  } catch (err) {
    hideLoading();
    showStatus(`Error: ${err.message}`, 'error');
    resetToReadyLater(3500);
  }
}

// ── IPC events ────────────────────────────────────────────────────────────────
if (api.onToggleRecording) {
  api.onToggleRecording(({ recording }) => {
    if (recording) {
      startRecording();
    } else {
      stopRecording();
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
  if (isRecording || isStarting) {
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
  if (isRecording || isStarting) stopRecording();
  if (resultsContainer && resultsContainer.style.display !== 'none') {
    hideResults();
  }
  if (api.hidePill) api.hidePill();
});

// ── Init ──────────────────────────────────────────────────────────────────────
startReadyPoller();
