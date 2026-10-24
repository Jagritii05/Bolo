import { settingsStore } from './settings-store.js';
import { RestSpeechClient } from './rest/rest-speech-client.js';
import { logger } from './logger.js';

let cachedClient = null;
let currentTransport = null;

export function getSpeechClient() {
  const transport = settingsStore.get('transport') || 'rest';

  if (cachedClient && currentTransport === transport) {
    return cachedClient;
  }

  currentTransport = transport;
  if (transport === 'rest') {
    logger.info('Initializing SpeechClient with REST transport.');
    cachedClient = new RestSpeechClient();
  } else {
    try {
      // Lazy load GraftSpeechClient once implemented in Phase 2
      const { GraftSpeechClient } = require('./graft/graft-speech-client.js');
      logger.info('Initializing SpeechClient with Graftcode transport.');
      cachedClient = new GraftSpeechClient();
    } catch (err) {
      logger.warn(`GraftSpeechClient not ready yet, falling back to REST: ${err.message}`);
      cachedClient = new RestSpeechClient();
    }
  }

  return cachedClient;
}
