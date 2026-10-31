import {
  removeFillerWords,
  replaceSpokenPunctuation,
  normalizeSpokenDigits,
  applySentenceCasing,
  expandSnippets,
} from './normalization.js';

export const DEFAULT_PIPELINE_OPTIONS = {
  fillerRemoval: true,
  spokenPunctuation: true,
  casing: true,
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

    if (opt.spokenPunctuation) {
      text = replaceSpokenPunctuation(text);
      text = normalizeSpokenDigits(text);
    }

    if (opt.fillerRemoval) {
      text = removeFillerWords(text);
    }

    if (opt.snippets && Object.keys(opt.snippets).length > 0) {
      text = expandSnippets(text, opt.snippets);
    }

    if (opt.casing) {
      text = applySentenceCasing(text);
    }

    // Collapse extra spaces but keep line breaks
    text = text
      .split('\n')
      .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
      .join('\n')
      .trim();

    return text;
  }
}

export const defaultPipeline = new TextPipeline();
