import { configureGraftTextGateway } from './adapter.js';
import { settingsStore } from '../settings-store.js';
import { logger } from '../logger.js';

export class GraftTextClient {
  constructor() {
    this._initialized = false;
    this._textService = null;
  }

  async _ensureInit() {
    if (!this._initialized) {
      await configureGraftTextGateway();
      const { TextPipelineService } = await import('@graft/npm-text-gateway');
      this._textService = TextPipelineService;
      this._initialized = true;
    }
  }

  async process(rawText, overrideOptions = {}) {
    if (!rawText || typeof rawText !== 'string') return '';

    try {
      await this._ensureInit();

      const pipelineSettings = settingsStore.get('textPipeline') || {};
      const snippets = settingsStore.get('snippets') || {};

      const options = {
        ...pipelineSettings,
        snippets,
        ...overrideOptions,
      };

      const optionsJson = JSON.stringify(options);
      logger.info(`Sending text (${rawText.length} chars) through Gateway B over Graftcode RPC...`);

      const cleanText = await this._textService.processText(rawText, optionsJson);
      return typeof cleanText === 'string' ? cleanText : String(cleanText);
    } catch (err) {
      logger.error(`Gateway B text processing error: ${err.message}. Falling back to baseline.`);
      // Fall back gracefully to local text normalization if Gateway B connection has issues
      const { BaselineTextClient } = await import('../text-client.js');
      const fallback = new BaselineTextClient();
      return fallback.process(rawText);
    }
  }

  async cleanTextJson(text, optionsJson = '') {
    await this._ensureInit();
    return await this._textService.cleanTextJson(text, optionsJson);
  }

  async health() {
    try {
      await this._ensureInit();
      const res = await this._textService.health();
      return typeof res === 'string' ? JSON.parse(res) : res;
    } catch (err) {
      return { ready: false, error: err.message };
    }
  }
}
