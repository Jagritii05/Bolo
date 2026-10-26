/**
 * Text normalization: filler words, spoken punctuation, sentence casing, and snippets.
 */

// Spoken punctuation mappings
const SPOKEN_PUNCTUATION_PATTERNS = [
  { regex: /\b(exclamation mark|exclamation point)\b/gi, replacement: '!' },
  { regex: /\b(question mark)\b/gi, replacement: '?' },
  { regex: /\b(new line|newline)\b/gi, replacement: '\n' },
  { regex: /\b(full stop|period)\b/gi, replacement: '.' },
  { regex: /\b(comma)\b/gi, replacement: ',' },
  { regex: /\b(colon)\b/gi, replacement: ':' },
  { regex: /\b(semicolon)\b/gi, replacement: ';' },
  { regex: /\b(open quote)\b/gi, replacement: '"' },
  { regex: /\b(close quote)\b/gi, replacement: '"' },
];

/**
 * Removes filler words (um, uh, er, ah, like, you know) with word boundary checks.
 * Handles adjacent filler words and cleans up excess spacing.
 * @param {string} text
 * @returns {string}
 */
export function removeFillerWords(text) {
  if (!text || typeof text !== 'string') return '';

  let prev = '';
  let cur = text;

  // Run in a loop until no more adjacent filler words remain
  // Filler words: um, uh, er, ah, you know, like
  const fillerRegex = /\b(um|uh|er|ah|you know|like)\b/gi;

  while (prev !== cur) {
    prev = cur;
    cur = cur.replace(fillerRegex, '');
    cur = cur.replace(/[ \t]{2,}/g, ' ');
  }

  // Clean whitespace around newlines and trim
  return cur
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/**
 * Converts spoken punctuation words to punctuation characters and fixes surrounding spacing.
 * @param {string} text
 * @returns {string}
 */
export function replaceSpokenPunctuation(text) {
  if (!text || typeof text !== 'string') return '';
  let result = text;

  for (const { regex, replacement } of SPOKEN_PUNCTUATION_PATTERNS) {
    result = result.replace(regex, replacement);
  }

  // Remove spaces immediately before punctuation marks (. , ? ! ; and : if not a snippet trigger)
  result = result.replace(/[ \t]+([.,?!;]|:(?![a-zA-Z_]))/g, '$1');

  // Ensure single space after sentence punctuation (. , ? ! ;) when immediately followed by non-space
  result = result.replace(/([.,?!;])(?=[^\s"'\n\r])/g, '$1 ');

  // For colons, only ensure space if NOT a timestamp (e.g. 10:30) or snippet trigger (e.g. :email)
  result = result.replace(/(?<!\d):(?!\d|[a-zA-Z_])/g, ': ');

  return result.trim();
}

/**
 * Applies sentence casing:
 * - Capitalizes first letter of text.
 * - Capitalizes first letter after terminal punctuation (. ? !) or newlines.
 * @param {string} text
 * @returns {string}
 */
export function applySentenceCasing(text) {
  if (!text || typeof text !== 'string') return '';

  // Capitalize very first alphanumeric character
  let result = text.replace(/^(\s*)([a-z])/i, (_m, ws, char) => ws + char.toUpperCase());

  // Capitalize first letter after terminal punctuation followed by whitespace/newlines
  result = result.replace(/([.?!]\s+)([a-z])/g, (_m, punctWs, char) => punctWs + char.toUpperCase());

  // Capitalize first letter on a new line
  result = result.replace(/(\n\s*)([a-z])/g, (_m, nlWs, char) => nlWs + char.toUpperCase());

  return result;
}

/**
 * Expands custom voice snippets.
 * Longest triggers match first to prevent prefix collision.
 * @param {string} text
 * @param {Record<string, string>} snippets
 * @returns {string}
 */
export function expandSnippets(text, snippets = {}) {
  if (!text || typeof text !== 'string' || !snippets || Object.keys(snippets).length === 0) {
    return text;
  }

  let result = text;
  // Sort triggers by length descending
  const sortedTriggers = Object.keys(snippets).sort((a, b) => b.length - a.length);

  for (const trigger of sortedTriggers) {
    const expansion = snippets[trigger];
    if (result.includes(trigger)) {
      result = result.split(trigger).join(expansion);
    }
  }

  return result;
}
