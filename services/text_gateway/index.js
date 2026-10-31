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

  // Clean and format text with options or preset style
  static CleanTextJson(text, styleOrOptionsJson) {
    let options = {};
    const str = styleOrOptionsJson || '';
    if (typeof str === 'string' && str.trim()) {
      const trimmed = str.trim();
      if (trimmed.toUpperCase() === 'FORMAL') {
        options = { casing: true, fillerRemoval: true, spokenPunctuation: true };
      } else if (trimmed.toUpperCase() === 'CASUAL') {
        options = { casing: false, fillerRemoval: false, spokenPunctuation: true };
      } else {
        try {
          options = JSON.parse(trimmed);
        } catch (_) {}
      }
    }
    const safeText = text || '';
    return defaultPipeline.process(safeText, options);
  }
}
