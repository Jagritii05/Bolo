import { settingsStore } from './settings-store.js';
import { RestSpeechClient } from './rest/rest-speech-client.js';
import { GraftSpeechClient } from './graft/graft-speech-client.js';
import { logger } from './logger.js';

let cachedClient = null;
let currentTransport = null;

export function getSpeechClient() {
  const transport = process.env.TRANSPORT || settingsStore.get('transport') || 'graft';

  if (cachedClient && currentTransport === transport) {
    return cachedClient;
  }

  currentTransport = transport;
  if (transport === 'rest') {
    logger.info('Initializing SpeechClient with REST transport (baseline).');
    cachedClient = new RestSpeechClient();
  } else {
    logger.info('Initializing SpeechClient with Graftcode transport (default).');
    cachedClient = new GraftSpeechClient();
  }

  return cachedClient;
}
