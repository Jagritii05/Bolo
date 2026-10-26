import { settingsStore } from './settings-store.js';
import { defaultPipeline } from '../../services/text/index.js';
import { GraftTextClient } from './graft/graft-text-client.js';
import { logger } from './logger.js';

export class BaselineTextClient {
  process(rawText) {
    if (!rawText) return '';
    const config = settingsStore.get('textPipeline') || {};
    const snippets = settingsStore.get('snippets') || {};
    return defaultPipeline.process(rawText, { ...config, snippets });
  }
}

let cachedGraftClient = null;
let cachedBaselineClient = new BaselineTextClient();

export function getTextClient() {
  const transport = process.env.TRANSPORT || settingsStore.get('transport') || 'graft';

  if (transport === 'graft') {
    if (!cachedGraftClient) {
      logger.info('Initializing TextClient with Graftcode Gateway B transport.');
      cachedGraftClient = new GraftTextClient();
    }
    return cachedGraftClient;
  }

  return cachedBaselineClient;
}
