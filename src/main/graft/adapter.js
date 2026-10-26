import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

export const GRAFT_PORTS = {
  GATEWAY_A_WS: 8085,
  GATEWAY_A_HTTP: 8086,
  GATEWAY_B_WS: 8095,
  GATEWAY_B_HTTP: 8096,
};

let isSpeechConfigured = false;
let isTextConfigured = false;

/**
 * Section 6.5 Error Mapping Table
 */
export const ERROR_MAPPINGS = {
  GATEWAY_NOT_READY: {
    kind: 'GATEWAY_NOT_READY',
    retryable: true,
    message: 'Starting services…',
    action: 'Wait; supervisor retries',
  },
  MODEL_LOADING: {
    kind: 'MODEL_LOADING',
    retryable: true,
    message: 'Loading speech model…',
    action: 'Wait',
  },
  INVALID_AUDIO: {
    kind: 'INVALID_AUDIO',
    retryable: false,
    message: "Didn't catch any audio. Try again.",
    action: 'Return to Ready',
  },
  AUDIO_TOO_LONG: {
    kind: 'AUDIO_TOO_LONG',
    retryable: false,
    message: 'Recording too long (max 10 min).',
    action: 'Return to Ready',
  },
  ENGINE_UNAVAILABLE: {
    kind: 'ENGINE_UNAVAILABLE',
    retryable: true,
    message: 'Engine unavailable: {reason}. Switched to {fallback}.',
    action: 'Auto fallback to tiny/base',
  },
  TRANSCRIPTION_FAILED: {
    kind: 'TRANSCRIPTION_FAILED',
    retryable: true,
    message: 'Transcription failed. Details in log.',
    action: 'Offer retry',
  },
  GATEWAY_DIED: {
    kind: 'GATEWAY_DIED',
    retryable: true,
    message: 'Service restarted, please retry.',
    action: 'Supervisor restarts; auto retry once',
  },
  ELEVATED_WINDOW: {
    kind: 'ELEVATED_WINDOW',
    retryable: false,
    message: "Copied. Couldn't paste into an admin window.",
    action: 'Text stays on clipboard',
  },
  MIC_PERMISSION_DENIED: {
    kind: 'MIC_PERMISSION_DENIED',
    retryable: false,
    message: 'Allow microphone access in Windows Settings > Privacy.',
    action: 'Open settings link',
  },
  PATH_NOT_ALLOWED: {
    kind: 'PATH_NOT_ALLOWED',
    retryable: false,
    message: 'Path not allowed outside designated recordings folder.',
    action: 'Reject request',
  },
};

/**
 * Section 6.4: Translates an exception into { kind, retryable, message, action }
 */
export function translateError(exc) {
  if (!exc) {
    return {
      kind: 'UNKNOWN',
      retryable: false,
      message: 'An unknown error occurred.',
      action: 'None',
    };
  }

  const rawMsg = typeof exc === 'string' ? exc : (exc.message || exc.name || String(exc));
  const msgLower = rawMsg.toLowerCase();

  // 1. Elevated window
  if (msgLower.includes('elevated') || msgLower.includes('admin window')) {
    return { ...ERROR_MAPPINGS.ELEVATED_WINDOW };
  }

  // 2. Microphone permission denied
  if (
    msgLower.includes('notallowederror') ||
    msgLower.includes('permissiondenied') ||
    msgLower.includes('microphone access denied') ||
    msgLower.includes('privacy-microphone')
  ) {
    return { ...ERROR_MAPPINGS.MIC_PERMISSION_DENIED };
  }

  // 3. Invalid audio / blob under 1 KB
  if (
    msgLower.includes('invalidaudioexception') ||
    msgLower.includes('didn\'t catch any audio') ||
    msgLower.includes('under 1 kb') ||
    msgLower.includes('audio too small') ||
    msgLower.includes('no speech detected')
  ) {
    return { ...ERROR_MAPPINGS.INVALID_AUDIO };
  }

  // 4. Audio too long
  if (
    msgLower.includes('audiotoolongexception') ||
    msgLower.includes('recording too long') ||
    msgLower.includes('exceeds maximum allowed duration')
  ) {
    return { ...ERROR_MAPPINGS.AUDIO_TOO_LONG };
  }

  // 5. Path not allowed
  if (
    msgLower.includes('pathnotallowedexception') ||
    msgLower.includes('outside the allowed directory')
  ) {
    return { ...ERROR_MAPPINGS.PATH_NOT_ALLOWED };
  }

  // 6. Model not ready / loading
  if (
    msgLower.includes('modelnotreadyexception') ||
    msgLower.includes('loading speech model') ||
    msgLower.includes('state: loading') ||
    msgLower.includes('still warming up')
  ) {
    return { ...ERROR_MAPPINGS.MODEL_LOADING };
  }

  // 7. Engine unavailable
  if (msgLower.includes('engineunavailableexception')) {
    const reasonMatch = rawMsg.match(/EngineUnavailableException:\s*([^.\n]+)/i);
    const reason = reasonMatch ? reasonMatch[1].trim() : 'Missing dependencies or device';
    const fallback = 'whisper-base';
    return {
      kind: 'ENGINE_UNAVAILABLE',
      retryable: true,
      message: `Engine unavailable: ${reason}. Switched to ${fallback}.`,
      action: 'Auto fallback to tiny/base',
      fallback,
    };
  }

  // 8. Gateway died mid-call / socket drop
  if (
    msgLower.includes('econnreset') ||
    msgLower.includes('socket hang up') ||
    msgLower.includes('epipe') ||
    msgLower.includes('broken pipe') ||
    msgLower.includes('closed unexpectedly') ||
    msgLower.includes('service restarted')
  ) {
    return { ...ERROR_MAPPINGS.GATEWAY_DIED };
  }

  // 9. Gateway not up yet / connection refused
  if (
    msgLower.includes('econnrefused') ||
    msgLower.includes('websocket is not open') ||
    msgLower.includes('failed to connect') ||
    msgLower.includes('enotfound') ||
    msgLower.includes('connectex') ||
    msgLower.includes('starting services')
  ) {
    return { ...ERROR_MAPPINGS.GATEWAY_NOT_READY };
  }

  // 10. Transcription failed
  if (
    msgLower.includes('transcriptionfailedexception') ||
    msgLower.includes('transcription failed')
  ) {
    return { ...ERROR_MAPPINGS.TRANSCRIPTION_FAILED };
  }

  // Fallback for general unclassified error
  return {
    kind: 'GENERAL_ERROR',
    retryable: false,
    message: rawMsg,
    action: 'Details in log',
  };
}

/**
 * Section 6.4: Connect to a Graftcode endpoint
 */
export async function connect(endpoint) {
  if (typeof endpoint === 'string' && endpoint.includes(':8085')) {
    const { GraftConfig } = await import('@graft/npm-speech-gateway');
    GraftConfig.host = endpoint.startsWith('ws') ? endpoint : `ws://${endpoint}/ws`;
    GraftConfig.stateless = true;
    isSpeechConfigured = true;
    return GraftConfig;
  }
  if (typeof endpoint === 'string' && endpoint.includes(':8095')) {
    const { GraftConfig } = await import('@graft/npm-text-gateway');
    GraftConfig.host = endpoint.startsWith('ws') ? endpoint : `ws://${endpoint}/ws`;
    GraftConfig.stateless = true;
    isTextConfigured = true;
    return GraftConfig;
  }
  return null;
}

/**
 * Section 6.4: Execute a call with timeout and error translation
 */
export async function call(handle, method, args = [], timeoutMs = 30000) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Call to ${method} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const callPromise = typeof handle[method] === 'function'
      ? handle[method](...(Array.isArray(args) ? args : [args]))
      : Promise.reject(new Error(`Method ${method} not found on handle`));

    const result = await Promise.race([callPromise, timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    const translated = translateError(err);
    logger.warn(`Graft adapter call failed on ${method}: [${translated.kind}] ${translated.message}`);
    const wrappedErr = new Error(translated.message);
    wrappedErr.translated = translated;
    throw wrappedErr;
  }
}

/**
 * Section 6.4: Close / reset connections
 */
export function close() {
  isSpeechConfigured = false;
  isTextConfigured = false;
  logger.info('Graftcode adapter connections reset.');
}

export async function configureGraftcode() {
  return connect(`ws://localhost:${GRAFT_PORTS.GATEWAY_A_WS}/ws`);
}

export async function configureGraftTextGateway() {
  return connect(`ws://localhost:${GRAFT_PORTS.GATEWAY_B_WS}/ws`);
}
