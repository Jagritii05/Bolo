import { GraftSpeechClient } from './graft/graft-speech-client.js';
import { logger } from './logger.js';

let cachedClient = null;

export function getSpeechClient() {
  if (cachedClient) {
    return cachedClient;
  }
  logger.info('Initializing SpeechClient with Graftcode transport.');
  cachedClient = new GraftSpeechClient();
  return cachedClient;
}

