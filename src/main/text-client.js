import { settingsStore } from './settings-store.js';

export class BaselineTextClient {
  process(rawText) {
    if (!rawText) return '';
    let text = rawText.trim();

    const config = settingsStore.get('textPipeline') || {};
    const snippets = settingsStore.get('snippets') || {};

    // 1. Spoken punctuation substitution
    if (config.spokenPunctuation) {
      text = text
        .replace(/\bperiod\b/gi, '.')
        .replace(/\bcomma\b/gi, ',')
        .replace(/\bquestion mark\b/gi, '?')
        .replace(/\bexclamation mark\b/gi, '!')
        .replace(/\bnew line\b/gi, '\n');
    }

    // 2. Filler words removal
    if (config.fillerRemoval) {
      text = text.replace(/\b(um|uh|er|ah|like|you know)\b/gi, '').replace(/\s{2,}/g, ' ');
    }

    // 3. Snippets expansion
    for (const [trigger, expansion] of Object.entries(snippets)) {
      if (text.includes(trigger)) {
        text = text.split(trigger).join(expansion);
      }
    }

    // 4. Auto sentence casing
    if (config.casing && text.length > 0) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }

    return text.trim();
  }
}

let cachedTextClient = new BaselineTextClient();

export function getTextClient() {
  const transport = settingsStore.get('transport') || 'rest';
  if (transport === 'graft') {
    try {
      const { GraftTextClient } = require('./graft/graft-text-client.js');
      return new GraftTextClient();
    } catch (_) {}
  }
  return cachedTextClient;
}
