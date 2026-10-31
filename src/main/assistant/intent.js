// Decide what the user wants from what they said.
// Dictation stays the default so normal typing never goes to the cloud.

const FIND_RE = /^(?:hey\s+pill[,\s]+)?(?:find|search(?:\s+for)?|look\s+for|show\s+me|where(?:'s|\s+is))\b[\s,:-]*(.*)$/i;
const REMEMBER_RE = /^(?:hey\s+pill[,\s]+)?(?:remember(?:\s+this|\s+my)?(?:\s+screen)?|save(?:\s+this)?(?:\s+screen)?\s+to\s+memory)\b[\s,:-]*(.*)$/i;
const SUMMARY_RE = /^(?:hey\s+pill[,\s]+)?(?:summari[sz]e|recap|what\s+was\s+i\s+(?:doing|working\s+on))\b[\s,:-]*(.*)$/i;
const ASK_RE = /^(?:hey\s+pill[,\s]+)?(?:assistant|ask|reply(?:\s+to\s+this|\s+to)?|answer(?:\s+this)?|draft|respond)\b[\s,:-]*(.*)$/i;
const HEY_PILL_RE = /^hey\s+pill\b[\s,:-]*(.*)$/i;

export function detectIntent(text) {
  const clean = (text || '').trim().replace(/^[\s.,!?]+/, '');

  let m = clean.match(FIND_RE);
  if (m) return { mode: 'find', query: stripTail(m[1]) };

  m = clean.match(REMEMBER_RE);
  if (m) return { mode: 'remember', query: stripTail(m[1]) };

  m = clean.match(SUMMARY_RE);
  if (m) return { mode: 'summarize', query: stripTail(m[1]) };

  m = clean.match(ASK_RE);
  if (m) return { mode: 'ask', query: stripTail(m[1]) };

  m = clean.match(HEY_PILL_RE);
  if (m) return { mode: 'ask', query: stripTail(m[1]) };

  return { mode: 'dictate', query: clean };
}

function stripTail(s) {
  return (s || '').trim().replace(/[.!?]+$/, '').trim();
}
