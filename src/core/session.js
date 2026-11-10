import { logger } from '../main/logger.js';
import { settingsStore } from '../main/settings-store.js';
import { captureActiveScreen } from '../services/vision/capture.js';
import { extractScreenText, clearScreenSession } from '../services/vision/screenToText.js';
import { transcribeAudio } from '../services/gnani/stt.js';
import { synthesizeSpeech } from '../services/gnani/tts.js';
import { explain, draftReply, formatDictation, transliterateToEnglishScript } from '../services/llm/index.js';
import { getLanguageConfig } from '../services/gnani/config.js';
import { pasteTextToActiveWindow } from '../main/paste.js';

export const SessionState = {
  IDLE: 'IDLE',
  CAPTURING: 'CAPTURING',
  EXTRACTING: 'EXTRACTING',
  LISTENING: 'LISTENING',
  TRANSCRIBING: 'TRANSCRIBING',
  THINKING: 'THINKING',
  SPEAKING: 'SPEAKING',
  ERROR: 'ERROR',
};

// Patterns detecting when user wants to draft/reply or dictate even in explainer mode
const REPLY_INTENT_REGEX = /(?:reply|jawab|uthar|repond|likh\s*do|likho|type\s*karo|ezhudhunga|kore\s*dao|uttar\s*dao|bolo\s*ki|mail\s*ka\s*reply|message\s*ka\s*reply)/i;

class SessionCoordinator {
  constructor() {
    this.state = SessionState.IDLE;
    this.screenText = '';
    this.history = []; // Up to 6 entries (3 user turns, 3 assistant turns)
    this.currentQuestion = '';
    this.lastAnswer = null;
    this.followUpTimer = null;
    this.activeTurnStartTime = 0;
    this.onStateChange = null; // (stateData) => void
    this.cancelSignal = false;
    this.currentMode = settingsStore.get('mode') || 'explain'; // 'explain' | 'reply' | 'dictate'
  }

  setMode(mode) {
    this.currentMode = mode || 'explain';
    settingsStore.set('mode', this.currentMode);
    logger.info(`[Session] Active mode switched to: ${this.currentMode}`);
  }

  getMode() {
    return this.currentMode;
  }

  setState(newState, payload = {}) {
    this.state = newState;
    logger.info(`[Session] State -> ${newState} [Mode: ${this.currentMode}]`);
    if (typeof this.onStateChange === 'function') {
      this.onStateChange({
        state: this.state,
        mode: this.currentMode,
        screenText: this.screenText,
        question: this.currentQuestion,
        lastAnswer: this.lastAnswer,
        ...payload,
      });
    }
  }

  getState() {
    return this.state;
  }

  /**
   * Reset session back to IDLE cleanly.
   */
  cancel() {
    logger.info('[Session] ESC or cancel triggered.');
    this.cancelSignal = true;
    if (this.followUpTimer) {
      clearTimeout(this.followUpTimer);
      this.followUpTimer = null;
    }
    this.setState(SessionState.IDLE, { cancelled: true });
  }

  clearAllMemory() {
    this.screenText = '';
    this.history = [];
    this.currentQuestion = '';
    this.lastAnswer = null;
    clearScreenSession();
    if (this.followUpTimer) {
      clearTimeout(this.followUpTimer);
      this.followUpTimer = null;
    }
    this.setState(SessionState.IDLE);
  }

  /**
   * Triggered when the user presses the global hotkey.
   */
  async handleHotkey() {
    logger.info(`[Session] Hotkey pressed in state: ${this.state} (mode: ${this.currentMode})`);

    // If currently speaking, stop speech and enter follow-up listening
    if (this.state === SessionState.SPEAKING) {
      this.startFollowUpTurn();
      return;
    }

    // If currently listening, hotkey means user is done speaking
    if (this.state === SessionState.LISTENING) {
      this.setState(SessionState.LISTENING, { finishListening: true });
      return;
    }

    // Re-entrancy guard: if in flight, ignore duplicate hotkey presses
    if (
      this.state === SessionState.CAPTURING ||
      this.state === SessionState.EXTRACTING ||
      this.state === SessionState.TRANSCRIBING ||
      this.state === SessionState.THINKING
    ) {
      logger.info('[Session] Request already in flight. Hotkey ignored.');
      return;
    }

    // In 'dictate' mode, skip screen capture and go straight to listening!
    if (this.currentMode === 'dictate') {
      this.startDirectDictation();
      return;
    }

    // If IDLE and follow-up window is active with cached screen text:
    if (this.state === SessionState.IDLE && this.screenText && this.followUpTimer) {
      this.startFollowUpTurn();
      return;
    }

    // Otherwise: Full screen capture turn
    await this.startFreshTurn();
  }

  startDirectDictation() {
    this.cancelSignal = false;
    this.activeTurnStartTime = Date.now();
    const lang = settingsStore.get('language') || 'hi-IN';
    const langConf = getLanguageConfig(lang);

    this.setState(SessionState.LISTENING, {
      message: `Listening to dictate in ${langConf.nativeName}…`,
      isFollowUp: false,
      mode: 'dictate',
    });
  }

  async startFreshTurn() {
    this.cancelSignal = false;
    this.activeTurnStartTime = Date.now();
    const timings = {};

    try {
      this.setState(SessionState.CAPTURING, { message: 'Capturing screen…' });
      const captureStart = Date.now();
      const screenshot = await captureActiveScreen();
      timings.capture = Date.now() - captureStart;
      logger.latency('Capture Screen', timings.capture);

      if (this.cancelSignal) return;

      this.setState(SessionState.EXTRACTING, { message: 'Reading screen content…' });
      const extractStart = Date.now();
      this.screenText = await extractScreenText(screenshot, { bypassCache: true });
      timings.extract = Date.now() - extractStart;
      logger.latency('Extract Screen Text', timings.extract);

      if (this.cancelSignal) return;

      this.history = [];

      const lang = settingsStore.get('language') || 'hi-IN';
      const langConf = getLanguageConfig(lang);
      const promptLabel = this.currentMode === 'reply' ? 'Listening: speak your reply instructions…' : `Listening (${langConf.nativeName})…`;

      this.setState(SessionState.LISTENING, {
        message: promptLabel,
        isFollowUp: false,
        timings,
        mode: this.currentMode,
      });
    } catch (err) {
      logger.error(`[Session] Capture / extraction failed: ${err.message}`);
      this.setState(SessionState.ERROR, { error: err.message });
      this.scheduleIdleReset(4000);
    }
  }

  startFollowUpTurn() {
    if (this.followUpTimer) {
      clearTimeout(this.followUpTimer);
      this.followUpTimer = null;
    }
    this.cancelSignal = false;
    this.activeTurnStartTime = Date.now();

    const lang = settingsStore.get('language') || 'hi-IN';
    const langConf = getLanguageConfig(lang);
    logger.info(`[Session] Starting follow-up turn in ${langConf.name} reusing cached screen text.`);

    this.setState(SessionState.LISTENING, {
      message: `Listening for follow-up (${langConf.nativeName})…`,
      isFollowUp: true,
      mode: this.currentMode,
    });
  }

  async processAudioInput(audioBuffer) {
    if (this.cancelSignal) return;

    const lang = settingsStore.get('language') || 'hi-IN';
    const langConf = getLanguageConfig(lang);
    const timings = {};

    try {
      let speechText = '';

      if (!audioBuffer || audioBuffer.length < 1200) {
        if (this.currentMode === 'dictate') {
          this.setState(SessionState.IDLE, { message: 'No speech detected.' });
          return;
        }
        speechText = langConf.defaultQuestion;
        logger.info(`[Session] No spoken question captured. Using default: "${speechText}"`);
      } else {
        this.setState(SessionState.TRANSCRIBING, { message: `Transcribing voice in ${langConf.name}…` });
        const sttStart = Date.now();
        const sttRes = await transcribeAudio(audioBuffer, lang);
        timings.stt = Date.now() - sttStart;
        logger.latency('Gnani Prisma STT', timings.stt);

        speechText = sttRes?.text?.trim() || (this.currentMode === 'dictate' ? '' : langConf.defaultQuestion);
        logger.info(`[Session] Transcribed speech: "${speechText}"`);
      }

      this.currentQuestion = speechText;
      if (this.cancelSignal) return;

      // Dictation mode
      if (this.currentMode === 'dictate') {
        if (!speechText) {
          this.setState(SessionState.IDLE, { message: 'No speech detected' });
          return;
        }

        const englishScriptText = await transliterateToEnglishScript(speechText);
        logger.info(`[Session] Pasting dictated text in English alphabet: "${englishScriptText}"`);
        await pasteTextToActiveWindow(englishScriptText);

        this.setState(SessionState.IDLE, {
          message: 'Pasted at cursor ✓',
          mode: 'dictate',
        });
        return;
      }

      // Reply draft mode
      const isReplyIntent = this.currentMode === 'reply' || REPLY_INTENT_REGEX.test(speechText);

      if (isReplyIntent) {
        this.setState(SessionState.THINKING, {
          message: 'Drafting reply to screen message…',
          question: speechText,
          mode: 'reply',
        });

        const llmStart = Date.now();
        const replyRes = await draftReply({
          screenText: this.screenText,
          userPrompt: speechText,
          language: lang,
        });
        timings.llm = Date.now() - llmStart;
        logger.latency('LLM Reply Draft', timings.llm);

        if (this.cancelSignal) return;

        const draftText = replyRes.text;
        logger.info(`[Session] Draft created. Pasting at cursor: "${draftText.slice(0, 60)}..."`);
        const pasteRes = await pasteTextToActiveWindow(draftText);

        let confirmationCue = 'Maine reply draft karke cursor par paste kar diya hai.';
        if (lang.startsWith('ta')) confirmationCue = 'Reply draft panni cursor-la paste panniyaachu.';
        if (lang.startsWith('bn')) confirmationCue = 'Aami reply draft kore cursor-e paste kore diyechi.';

        let ttsRes = null;
        if (settingsStore.get('isMuted') !== true) {
          try {
            ttsRes = await synthesizeSpeech(confirmationCue, lang);
          } catch (ttsErr) {
            logger.warn(`[Session] TTS confirmation failed: ${ttsErr.message}`);
          }
        }

        const totalMs = Date.now() - this.activeTurnStartTime;
        this.lastAnswer = {
          question: speechText,
          text: draftText,
          provider: replyRes.provider,
          model: replyRes.model,
          audioDataUri: ttsRes?.dataUri || null,
          pasted: pasteRes?.pasted || false,
          mode: 'reply',
          timings: { ...timings, total: totalMs },
        };

        this.setState(SessionState.SPEAKING, {
          question: speechText,
          answer: draftText,
          provider: replyRes.provider,
          model: replyRes.model,
          audioDataUri: ttsRes?.dataUri || null,
          pasted: pasteRes?.pasted || false,
          mode: 'reply',
          timings: this.lastAnswer.timings,
        });

        this.armFollowUpTimer();
        return;
      }

      // Screen explainer mode
      this.setState(SessionState.THINKING, {
        message: 'Explaining screen…',
        question: speechText,
        mode: 'explain',
      });

      const llmStart = Date.now();
      const llmRes = await explain({
        screenText: this.screenText,
        question: speechText,
        language: lang,
        history: this.history,
      });
      timings.llm = Date.now() - llmStart;
      logger.latency('LLM Explanation', timings.llm);

      if (this.cancelSignal) return;

      const explanationText = llmRes.text;

      // Update multi-turn history (keep last 3 turns = 6 messages)
      this.history.push({ role: 'user', content: speechText });
      this.history.push({ role: 'assistant', content: explanationText });
      if (this.history.length > 6) {
        this.history = this.history.slice(-6);
      }

      // Synthesize spoken explanation
      const isMuted = settingsStore.get('isMuted') === true;
      let ttsRes = null;

      if (!isMuted) {
        const ttsStart = Date.now();
        try {
          ttsRes = await synthesizeSpeech(explanationText, lang);
          timings.tts = Date.now() - ttsStart;
          logger.latency('Gnani Timbre TTS', timings.tts);
        } catch (ttsErr) {
          logger.warn(`[Session] TTS synthesis error: ${ttsErr.message}. Showing text anyway.`);
        }
      }

      const totalMs = Date.now() - this.activeTurnStartTime;
      logger.latency('End-to-End Turn', totalMs, totalMs);

      this.lastAnswer = {
        question: speechText,
        text: explanationText,
        provider: llmRes.provider,
        model: llmRes.model,
        audioDataUri: ttsRes?.dataUri || null,
        mode: 'explain',
        timings: { ...timings, total: totalMs },
      };

      this.setState(SessionState.SPEAKING, {
        question: speechText,
        answer: explanationText,
        provider: llmRes.provider,
        model: llmRes.model,
        audioDataUri: ttsRes?.dataUri || null,
        mode: 'explain',
        timings: this.lastAnswer.timings,
      });

      this.armFollowUpTimer();
    } catch (err) {
      logger.error(`[Session] Turn processing failed: ${err.message}`);
      this.setState(SessionState.ERROR, { error: err.message });
      this.scheduleIdleReset(4500);
    }
  }

  armFollowUpTimer() {
    if (this.followUpTimer) {
      clearTimeout(this.followUpTimer);
    }
    const timeoutSec = settingsStore.get('followUpTimeoutSec') || 30;
    this.followUpTimer = setTimeout(() => {
      logger.info(`[Session] Follow-up window expired (${timeoutSec}s). Resetting session to IDLE.`);
      this.followUpTimer = null;
      if (this.state === SessionState.SPEAKING || this.state === SessionState.IDLE) {
        this.setState(SessionState.IDLE);
      }
    }, timeoutSec * 1000);
  }

  scheduleIdleReset(delayMs = 3000) {
    setTimeout(() => {
      if (this.state === SessionState.ERROR) {
        this.setState(SessionState.IDLE);
      }
    }, delayMs);
  }
}

export const sessionCoordinator = new SessionCoordinator();
