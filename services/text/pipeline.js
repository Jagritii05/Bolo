import {
  removeFillerWords,
  replaceSpokenPunctuation,
  normalizeSpokenDigits,
  applySentenceCasing,
  expandSnippets,
} from './normalization.js';
import { maskSensitiveData } from './masking.js';

export const DEFAULT_PIPELINE_OPTIONS = {
  fillerRemoval: true,
  spokenPunctuation: true,
  casing: true,
  maskSensitiveData: true,
  maskCard: true,
  maskAadhaar: true,
  maskPan: true,
  maskApiKey: true,
  maskPassword: true,
  maskEmail: false,
  maskPhone: false,
  snippets: {
    ':email': 'my.email@example.com',
    ':shrug': '¯\\_(ツ)_/¯',
  },
};

export class TextPipeline {
  constructor(options = {}) {
    this.options = { ...DEFAULT_PIPELINE_OPTIONS, ...options };
  }

  process(rawText, overrideOptions = {}) {
    if (!rawText || typeof rawText !== 'string') return '';
    let text = rawText;

    const opt = {
      ...this.options,
      ...overrideOptions,
      snippets: {
        ...(this.options.snippets || {}),
        ...(overrideOptions.snippets || {}),
      },
    };

    // 1. Spoken Punctuation and Digit Normalization
    if (opt.spokenPunctuation) {
      text = replaceSpokenPunctuation(text);
      text = normalizeSpokenDigits(text);
    }

    // 2. Filler Word Removal
    if (opt.fillerRemoval) {
      text = removeFillerWords(text);
    }

    // 3. Snippets Expansion
    if (opt.snippets && Object.keys(opt.snippets).length > 0) {
      text = expandSnippets(text, opt.snippets);
    }

    // 4. Sensitive Data Masking
    if (opt.maskSensitiveData) {
      text = maskSensitiveData(text, opt);
    }

    // 5. Sentence Auto-Casing
    if (opt.casing) {
      text = applySentenceCasing(text);
    }

    // 6. Clean up remaining multi-spaces while preserving line breaks
    text = text
      .split('\n')
      .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
      .join('\n')
      .trim();

    return text;
  }
}

export const defaultPipeline = new TextPipeline();
