import { defaultPipeline } from '../text/index.js';

export class TextPipelineService {
  static health() {
    return JSON.stringify({ ready: true, service: 'TextPipelineService' });
  }

  static processText(rawText, optionsJson) {
    let options = {};
    const jsonStr = optionsJson || '';
    if (jsonStr && typeof jsonStr === 'string' && jsonStr.trim()) {
      try {
        options = JSON.parse(jsonStr);
      } catch (_) {}
    }
    return defaultPipeline.process(rawText, options);
  }

  /**
   * MCP Tool: Clean and format text with deterministic pipeline.
   * Options can specify filler removal, spoken punctuation, casing, sensitive masking, snippets.
   */
  static CleanTextJson(text, optionsJson) {
    return TextPipelineService.processText(text, optionsJson);
  }
}
