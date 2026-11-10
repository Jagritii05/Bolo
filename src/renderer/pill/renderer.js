const api = window.bolo || window.localPill;

// DOM Elements
const pill = document.getElementById('pill');
const micBtn = document.getElementById('micBtn');
const micIcon = document.getElementById('micIcon');
const stopIcon = document.getElementById('stopIcon');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const modeBadge = document.getElementById('modeBadge');
const modeBadgeIcon = document.getElementById('modeBadgeIcon');
const modeBadgeText = document.getElementById('modeBadgeText');
const muteBtn = document.getElementById('muteBtn');
const soundOnIcon = document.getElementById('soundOnIcon');
const soundOffIcon = document.getElementById('soundOffIcon');
const settingsBtn = document.getElementById('settingsBtn');
const closeBtn = document.getElementById('closeBtn');

const settingsPopover = document.getElementById('settingsPopover');
const openFullSettingsBtn = document.getElementById('openFullSettingsBtn');

const loaderRow = document.getElementById('loaderRow');
const loaderText = document.getElementById('loaderText');

const explanationContainer = document.getElementById('explanationContainer');
const questionRow = document.getElementById('questionRow');
const questionText = document.getElementById('questionText');
const answerRow = document.getElementById('answerRow');
const answerText = document.getElementById('answerText');
const pasteBtn = document.getElementById('pasteBtn');
const replayBtn = document.getElementById('replayBtn');
const copyBtn = document.getElementById('copyBtn');
const footerProviderModel = document.getElementById('footerProviderModel');

// Mode and language state
let currentMode = 'explain';
let currentLanguage = 'hi-IN';
let isPopoverOpen = false;

// Audio state
let mediaStream = null;
let audioContext = null;
let recorderNode = null;
let pcmChunks = [];
let isRecording = false;
let speechDetected = false;
let silenceStart = 0;
let recordingTimeout = null;
let currentAudioElement = null;
let lastAudioUri = null;
let lastAnswerContent = '';

// Load initial settings
async function initPill() {
  try {
    const info = await api.getState();
    if (info) {
      if (info.language) {
        updateLanguageUI(info.language);
      }
      if (info.mode) {
        updateModeUI(info.mode);
      }
      setMuteUI(info.isMuted);
      resetToIdleUI();
    }
  } catch (err) {
    console.warn('Could not load initial state:', err);
  }
}
initPill();

function updateModeUI(mode) {
  currentMode = mode || 'explain';
  const icons = { explain: '🔍', reply: '✉️', dictate: '🎙️' };
  const labels = { explain: 'Explain', reply: 'Reply', dictate: 'Dictate' };
  if (modeBadgeIcon) modeBadgeIcon.textContent = icons[currentMode] || '🔍';
  if (modeBadgeText) modeBadgeText.textContent = labels[currentMode] || 'Explain';

  document.querySelectorAll('#modeChips .chip').forEach((chip) => {
    if (chip.getAttribute('data-mode') === currentMode) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });

  resetToIdleUI();
}

function updateLanguageUI(lang) {
  currentLanguage = lang || 'hi-IN';
  document.querySelectorAll('#langChips .chip').forEach((chip) => {
    if (chip.getAttribute('data-lang') === currentLanguage) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

function togglePopover(show) {
  isPopoverOpen = typeof show === 'boolean' ? show : !isPopoverOpen;
  if (isPopoverOpen) {
    settingsPopover.style.display = 'flex';
    settingsBtn.classList.add('active');
    api.setPillSize(340, 155);
  } else {
    settingsPopover.style.display = 'none';
    settingsBtn.classList.remove('active');
    if (!explanationContainer || explanationContainer.style.display === 'none') {
      api.setPillSize(340, 50);
    }
  }
}

function setMuteUI(muted) {
  if (muted) {
    soundOnIcon.style.display = 'none';
    soundOffIcon.style.display = 'block';
    muteBtn.title = 'Sound Muted (Click to Unmute)';
  } else {
    soundOnIcon.style.display = 'block';
    soundOffIcon.style.display = 'none';
    muteBtn.title = 'Voice Output Active (Click to Mute)';
  }
}

// Handle state changes from main process
api.onSessionStateChanged((data) => {
  console.log('[Pill UI] State change:', data);

  if (data.languageChanged) {
    updateLanguageUI(data.languageChanged);
  }
  if (data.mode) {
    updateModeUI(data.mode);
  }

  // If finishListening triggered while recording, stop immediately
  if (data.finishListening && isRecording) {
    stopRecording(true);
    return;
  }

  // Handle cancelled
  if (data.cancelled) {
    stopActiveAudio();
    stopRecording(false);
    resetToIdleUI();
    return;
  }

  switch (data.state) {
    case 'IDLE':
      hideExplanation();
      if (data.message) {
        setStatus(data.message, 'speaking');
        setTimeout(() => resetToIdleUI(), 2200);
      } else {
        resetToIdleUI();
      }
      break;

    case 'CAPTURING':
      stopActiveAudio();
      stopRecording(false);
      togglePopover(false);
      showLoader(data.message || 'Capturing screen…');
      setStatus('Capturing screen…', 'loading');
      hideExplanation();
      break;

    case 'EXTRACTING':
      showLoader('Reading visible screen text…');
      setStatus('Reading screen text…', 'loading');
      break;

    case 'LISTENING':
      hideLoader();
      togglePopover(false);
      pill.classList.remove('speaking');
      pill.classList.add('recording');
      micIcon.style.display = 'none';
      stopIcon.style.display = 'block';
      setStatus(data.message || 'Listening… speak your prompt', 'recording');
      startRecording();
      break;

    case 'TRANSCRIBING':
      stopRecording(false);
      pill.classList.remove('recording');
      micIcon.style.display = 'block';
      stopIcon.style.display = 'none';
      showLoader('Transcribing question (Gnani Prisma)…');
      setStatus('Transcribing…', 'loading');
      break;

    case 'THINKING':
      showLoader(currentMode === 'reply' ? 'Drafting smart reply…' : 'Explaining screen…');
      setStatus('Thinking…', 'loading');
      if (data.question) {
        showQuestion(data.question);
      }
      break;

    case 'SPEAKING':
      hideLoader();
      pill.classList.remove('recording');
      pill.classList.add('speaking');
      micIcon.style.display = 'block';
      stopIcon.style.display = 'none';
      setStatus('Ready · Press hotkey for follow-up', 'speaking');
      renderAnswer(data);
      break;

    case 'ERROR':
      hideLoader();
      pill.classList.remove('recording', 'speaking');
      micIcon.style.display = 'block';
      stopIcon.style.display = 'none';
      setStatus(data.error || 'An error occurred', 'error');
      break;
  }
});

function resetToIdleUI() {
  pill.classList.remove('recording', 'speaking');
  micIcon.style.display = 'block';
  stopIcon.style.display = 'none';
  hideLoader();

  let hint = '<kbd>Ctrl+Shift+Space</kbd>';
  if (currentMode === 'reply') {
    hint = 'Draft <kbd>Ctrl+Shift+Space</kbd>';
  } else if (currentMode === 'dictate') {
    hint = 'Dictate <kbd>Ctrl+Shift+Space</kbd>';
  }

  setStatus(hint, 'idle');
  if (!isPopoverOpen && (!explanationContainer || explanationContainer.style.display === 'none')) {
    api.setPillSize(340, 50);
  }
}

function setStatus(html, type = 'idle') {
  statusText.innerHTML = html;
  statusDot.className = 'status-dot';
  if (type === 'loading') statusDot.classList.add('loading');
  if (type === 'recording') statusDot.classList.add('recording');
  if (type === 'speaking') statusDot.classList.add('speaking');
  if (type === 'error') statusDot.classList.add('error');
}

function showLoader(msg) {
  loaderRow.style.display = 'flex';
  loaderText.textContent = msg;
  if (!isPopoverOpen && (!explanationContainer || explanationContainer.style.display === 'none')) {
    api.setPillSize(340, 80);
  }
}

function hideLoader() {
  loaderRow.style.display = 'none';
}

function showQuestion(q) {
  if (q) {
    questionText.textContent = q;
    questionRow.style.display = 'flex';
  } else {
    questionRow.style.display = 'none';
  }
}

function hideExplanation() {
  explanationContainer.style.display = 'none';
  if (!isPopoverOpen) {
    api.setPillSize(340, 50);
  }
}

function renderAnswer(data) {
  lastAnswerContent = data.answer || '';
  lastAudioUri = data.audioDataUri || null;

  showQuestion(data.question);
  answerText.textContent = data.answer || '';
  footerProviderModel.textContent = `${data.provider || 'LLM'} (${data.model || 'model'})`;

  explanationContainer.style.display = 'flex';
  api.setPillSize(440, 310);

  if (data.pasted) {
    setStatus('Pasted at cursor', 'speaking');
    if (pasteBtn) {
      pasteBtn.innerHTML = `
        <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Pasted!
      `;
      setTimeout(() => {
        pasteBtn.innerHTML = `
          <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
          </svg>
          Re-paste
        `;
      }, 2000);
    }
  }

  // Play audio in renderer if provided and not muted
  if (data.audioDataUri && !data.isMuted) {
    playBase64Audio(data.audioDataUri);
  }
}

function playBase64Audio(dataUri) {
  stopActiveAudio();
  try {
    currentAudioElement = new Audio(dataUri);
    currentAudioElement.onended = () => {
      pill.classList.remove('speaking');
    };
    currentAudioElement.onerror = (e) => {
      console.warn('Audio playback error in renderer:', e);
      pill.classList.remove('speaking');
    };
    currentAudioElement.play().catch((err) => {
      console.warn('Audio play() was interrupted or blocked:', err.message);
      pill.classList.remove('speaking');
    });
  } catch (err) {
    console.error('Failed to initialize Audio element:', err);
    pill.classList.remove('speaking');
  }
}

function stopActiveAudio() {
  if (currentAudioElement) {
    try {
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
    } catch {}
    currentAudioElement = null;
  }
  pill.classList.remove('speaking');
}

// Microphone and AudioWorklet recording
async function startRecording() {
  if (isRecording) return;
  isRecording = true;
  pcmChunks = [];
  speechDetected = false;
  silenceStart = 0;

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtxClass();

    // Register AudioWorklet processor module
    try {
      await audioContext.audioWorklet.addModule('./audio-processor.js');
    } catch (loadErr) {
      console.warn('[AudioWorklet] Direct module load fallback to inline blob:', loadErr);
      const code = `
        class RecorderProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const input = inputs[0];
            if (input && input.length > 0 && input[0]) {
              this.port.postMessage(input[0]);
            }
            return true;
          }
        }
        registerProcessor('recorder-processor', RecorderProcessor);
      `;
      const blob = new Blob([code], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      await audioContext.audioWorklet.addModule(blobUrl);
    }

    const source = audioContext.createMediaStreamSource(mediaStream);
    recorderNode = new AudioWorkletNode(audioContext, 'recorder-processor');

    recorderNode.port.onmessage = (e) => {
      if (!isRecording) return;
      const samples = e.data; // Float32Array
      pcmChunks.push(new Float32Array(samples));

      // Calculate volume for silence threshold
      let sumSquares = 0;
      for (let i = 0; i < samples.length; i++) {
        sumSquares += samples[i] * samples[i];
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      const isVoice = rms > 0.012;

      const now = Date.now();
      if (isVoice) {
        speechDetected = true;
        silenceStart = 0;
      } else if (speechDetected) {
        if (!silenceStart) {
          silenceStart = now;
        } else if (now - silenceStart > 1800) {
          console.log('[Recording] Silence threshold (1.8s) reached. Auto-stopping...');
          stopRecording(true);
        }
      }
    };

    source.connect(recorderNode);
    // AudioWorkletNode runs in background audio thread and does not need to connect to destination!

    // Hard ceiling: 30 seconds
    recordingTimeout = setTimeout(() => {
      console.log('[Recording] Maximum recording limit (30s) reached.');
      stopRecording(true);
    }, 30000);

  } catch (err) {
    console.error('Failed to access microphone:', err);
    isRecording = false;
    api.cancelSession();
    setStatus('Microphone access denied', 'error');
  }
}

async function stopRecording(shouldSubmit = true) {
  if (!isRecording) return;
  isRecording = false;

  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }

  const sampleRate = audioContext?.sampleRate || 44100;

  if (recorderNode) {
    try {
      recorderNode.disconnect();
      recorderNode.port.onmessage = null;
    } catch {}
    recorderNode = null;
  }

  if (audioContext) {
    try {
      await audioContext.close();
    } catch {}
    audioContext = null;
  }

  if (mediaStream) {
    try {
      mediaStream.getTracks().forEach((t) => t.stop());
    } catch {}
    mediaStream = null;
  }

  if (!shouldSubmit || pcmChunks.length === 0) {
    pcmChunks = [];
    return;
  }

  const chunksToProcess = pcmChunks;
  pcmChunks = [];

  try {
    const wavBytes = pcmToWav(chunksToProcess, sampleRate, 16000);
    if (!wavBytes || wavBytes.length < 500) {
      console.warn('[Recording] Audio too short, submitting empty.');
      await api.submitAudio(null);
      return;
    }

    console.log(`[Recording] WAV ready: ${wavBytes.length} bytes (16kHz Mono 16-bit). Submitting...`);
    await api.submitAudio(wavBytes);
  } catch (err) {
    console.error('Failed to encode PCM to WAV:', err);
    await api.submitAudio(null);
  }
}

function pcmToWav(chunks, sourceRate, targetRate = 16000) {
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.length;
  }

  if (totalLength === 0) {
    return new Uint8Array(0);
  }

  // Concatenate all float chunks into a single Float32Array
  const fullSource = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    fullSource.set(chunk, offset);
    offset += chunk.length;
  }

  // Resample from sourceRate to targetRate (16kHz)
  let resampled;
  if (sourceRate === targetRate) {
    resampled = fullSource;
  } else {
    const ratio = sourceRate / targetRate;
    const newLen = Math.round(fullSource.length / ratio);
    resampled = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const srcIdx = i * ratio;
      const lower = Math.floor(srcIdx);
      const upper = Math.min(lower + 1, fullSource.length - 1);
      const weight = srcIdx - lower;
      resampled[i] = fullSource[lower] * (1 - weight) + fullSource[upper] * weight;
    }
  }

  // Convert Float32 (-1.0 to 1.0) to 16-bit integer PCM
  const pcm16 = new Int16Array(resampled.length);
  for (let i = 0; i < resampled.length; i++) {
    const s = Math.max(-1, Math.min(1, resampled[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  const numChannels = 1;
  const bitsPerSample = 16;
  const dataSize = pcm16.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt subchunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);

  // data subchunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM audio
  let byteOffset = 44;
  for (let i = 0; i < pcm16.length; i++) {
    view.setInt16(byteOffset, pcm16[i], true);
    byteOffset += 2;
  }

  return new Uint8Array(buffer);
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// UI event listeners
micBtn.addEventListener('click', () => {
  api.triggerHotkey();
});

// Mode badge click cycles modes
modeBadge.addEventListener('click', (e) => {
  e.stopPropagation();
  const modes = ['explain', 'reply', 'dictate'];
  const nextIdx = (modes.indexOf(currentMode) + 1) % modes.length;
  const nextMode = modes[nextIdx];
  api.setMode(nextMode);
  updateModeUI(nextMode);
});

// Settings button toggles popover
settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePopover();
});

// Mode chips in popover
document.querySelectorAll('#modeChips .chip').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const mode = btn.getAttribute('data-mode');
    api.setMode(mode);
    updateModeUI(mode);
    togglePopover(false);
  });
});

// Language chips in popover
document.querySelectorAll('#langChips .chip').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const lang = btn.getAttribute('data-lang');
    api.setLanguage(lang);
    updateLanguageUI(lang);
    togglePopover(false);
  });
});

// Open full settings from popover
openFullSettingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePopover(false);
  api.openSettings();
});

// Close popover when clicking anywhere outside
document.addEventListener('click', (e) => {
  if (isPopoverOpen && !settingsPopover.contains(e.target) && !settingsBtn.contains(e.target)) {
    togglePopover(false);
  }
});

if (pasteBtn) {
  pasteBtn.addEventListener('click', async () => {
    if (lastAnswerContent) {
      await api.pasteText(lastAnswerContent);
      const orig = pasteBtn.innerHTML;
      pasteBtn.innerHTML = `
        <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Pasted!
      `;
      setTimeout(() => {
        pasteBtn.innerHTML = orig;
      }, 1500);
    }
  });
}

muteBtn.addEventListener('click', async () => {
  const res = await api.toggleMute();
  if (res) {
    setMuteUI(res.isMuted);
    if (res.isMuted) {
      stopActiveAudio();
    }
  }
});

replayBtn.addEventListener('click', async () => {
  if (lastAudioUri) {
    stopActiveAudio();
    currentAudioElement = new Audio(lastAudioUri);
    currentAudioElement.play().catch(() => {});
  } else {
    const uri = await api.replayAudio();
    if (uri) {
      lastAudioUri = uri;
      stopActiveAudio();
      currentAudioElement = new Audio(uri);
      currentAudioElement.play().catch(() => {});
    }
  }
});

copyBtn.addEventListener('click', () => {
  if (lastAnswerContent) {
    api.copyText(lastAnswerContent);
    const origText = copyBtn.innerHTML;
    copyBtn.innerHTML = 'Copied!';
    setTimeout(() => {
      copyBtn.innerHTML = origText;
    }, 1500);
  }
});

closeBtn.addEventListener('click', () => {
  api.hidePill();
});

// Keyboard shortcuts: ESC to cancel/close popover; Ctrl+M to cycle mode
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isPopoverOpen) {
      togglePopover(false);
      return;
    }
    api.cancelSession();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
    e.preventDefault();
    const modes = ['explain', 'reply', 'dictate'];
    const nextIdx = (modes.indexOf(currentMode) + 1) % modes.length;
    const nextMode = modes[nextIdx];
    api.setMode(nextMode);
    updateModeUI(nextMode);
  }
});
