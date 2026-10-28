import assert from 'assert';
import {
  TextPipeline,
  isValidLuhn,
  isValidAadhaar,
  generateVerhoeff,
  removeFillerWords,
  replaceSpokenPunctuation,
  applySentenceCasing,
  expandSnippets,
  maskSensitiveData,
} from '../services/text/index.js';

console.log('[Test] Running Text Pipeline Unit Tests...');

// ── 1. Luhn Card Validation ──────────────────────────────────────────────────
assert.strictEqual(isValidLuhn('4532015112830366'), true, 'Valid 16-digit Visa must pass Luhn');
assert.strictEqual(isValidLuhn('4532 0151 1283 0366'), true, 'Valid card with spaces must pass Luhn');
assert.strictEqual(isValidLuhn('4532-0151-1283-0366'), true, 'Valid card with hyphens must pass Luhn');
assert.strictEqual(isValidLuhn('4532015112830367'), false, 'Corrupted card must fail Luhn');
assert.strictEqual(isValidLuhn('1234567890123456'), false, 'Random card-length numbers failing Luhn must fail');
assert.strictEqual(isValidLuhn(''), false, 'Empty string must return false');
assert.strictEqual(isValidLuhn('123'), false, 'Short numbers must return false');

// ── 2. Verhoeff Aadhaar Validation ───────────────────────────────────────────
const validAadhaar = '23456789012' + generateVerhoeff('23456789012');
const invalidAadhaar = '23456789012' + ((generateVerhoeff('23456789012') + 1) % 10);
assert.strictEqual(isValidAadhaar(validAadhaar), true, 'Valid Aadhaar must pass Verhoeff');
assert.strictEqual(
  isValidAadhaar(`${validAadhaar.slice(0, 4)} ${validAadhaar.slice(4, 8)} ${validAadhaar.slice(8)}`),
  true,
  'Formatted Aadhaar must pass'
);
assert.strictEqual(isValidAadhaar(invalidAadhaar), false, 'Corrupted Aadhaar must fail Verhoeff');
assert.strictEqual(isValidAadhaar('012345678901'), false, 'Aadhaar starting with 0 must fail');
assert.strictEqual(isValidAadhaar('112345678901'), false, 'Aadhaar starting with 1 must fail');

// ── 3. PAN Card Masking ──────────────────────────────────────────────────────
const panSample = 'My PAN number is ABCDE1234F and another is xyzab5678k.';
const maskedPan = maskSensitiveData(panSample);
assert.ok(maskedPan.includes('[PAN-MASKED]'), 'Valid PAN must be masked');
assert.strictEqual(
  maskedPan,
  'My PAN number is [PAN-MASKED] and another is [PAN-MASKED].',
  'All valid PANs should be replaced'
);

// ── 4. Card & Aadhaar Masking ────────────────────────────────────────────────
const cardSample = 'Charge my card 4532-0151-1283-0366 or 4532015112830366 please. Order 1234567890123456.';
const maskedCard = maskSensitiveData(cardSample);
assert.strictEqual(
  maskedCard,
  'Charge my card [CARD-MASKED] or [CARD-MASKED] please. Order 1234567890123456.',
  'Only valid Luhn cards should be masked'
);

const aadhaarSample = `Aadhaar is ${validAadhaar} and invalid is ${invalidAadhaar}.`;
const maskedAadhaar = maskSensitiveData(aadhaarSample);
assert.strictEqual(
  maskedAadhaar,
  `Aadhaar is [AADHAAR-MASKED] and invalid is ${invalidAadhaar}.`,
  'Only checksum-valid Aadhaar numbers must be masked'
);

// ── 5. API Keys Masking ──────────────────────────────────────────────────────
const keysSample =
  'OpenAI sk-abcdef12345678901234567890 Groq gsk_1234567890123456789012345 AWS AKIAIOSFODNN7EXAMPLE and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
const maskedKeys = maskSensitiveData(keysSample);
assert.ok(!maskedKeys.includes('sk-abcdef'), 'OpenAI key must be masked');
assert.ok(!maskedKeys.includes('gsk_'), 'Groq key must be masked');
assert.ok(!maskedKeys.includes('AKIAIOSFODNN7EXAMPLE'), 'AWS key must be masked');
assert.ok(!maskedKeys.includes('eyJhbGciOiJIUzI1Ni'), 'Bearer token must be masked');

// ── 6. Normalization: Fillers ────────────────────────────────────────────────
assert.strictEqual(
  removeFillerWords('um uh like I want to go er you know to the store ah'),
  'I want to go to the store',
  'Adjacent and scattered fillers should be cleanly removed'
);

// ── 7. Normalization: Spoken Punctuation ──────────────────────────────────────
assert.strictEqual(
  replaceSpokenPunctuation('hello comma world period are you there question mark yes exclamation mark'),
  'hello, world. are you there? yes!',
  'Spoken punctuation words should be converted and spacing cleaned'
);

// ── 8. Normalization: Sentence Casing ────────────────────────────────────────
assert.strictEqual(
  applySentenceCasing('hello world. this is great! how are you? good.'),
  'Hello world. This is great! How are you? Good.',
  'Sentence casing after ., !, ? should be applied'
);

// ── 9. Snippets Expansion ────────────────────────────────────────────────────
const snippets = {
  ':email': 'john@example.com',
  ':email_work': 'john.work@corp.com',
  ':shrug': '¯\\_(ツ)_/¯',
};
const snippetSample = 'Contact me at :email_work or personal :email :shrug';
assert.strictEqual(
  expandSnippets(snippetSample, snippets),
  'Contact me at john.work@corp.com or personal john@example.com ¯\\_(ツ)_/¯',
  'Overlapping snippet prefixes must expand correctly'
);

// ── 10. End-to-End Pipeline Execution ────────────────────────────────────────
const pipeline = new TextPipeline({ snippets });

// Deliverable requirement test: "um I need to buy milk period" -> "I need to buy milk."
const deliverableTest = pipeline.process('um I need to buy milk period');
assert.strictEqual(deliverableTest, 'I need to buy milk.', 'Master prompt deliverable case must pass exactly');

// Combined complex test: fillers, punctuation, cards, casing, snippets
const complexTest = pipeline.process(
  'um uh hello comma send invoice to :email period charge card 4532 0151 1283 0366 exclamation mark'
);
assert.strictEqual(
  complexTest,
  'Hello, send invoice to john@example.com. Charge card [CARD-MASKED]!',
  'Full end-to-end processing must be accurate'
);

// ── 11. Edge Cases ───────────────────────────────────────────────────────────
assert.strictEqual(pipeline.process(''), '', 'Empty string must return empty string');
assert.strictEqual(pipeline.process('   \n  \t  '), '', 'Whitespace only must return empty string');
assert.strictEqual(pipeline.process(null), '', 'Null must return empty string');
assert.strictEqual(pipeline.process(undefined), '', 'Undefined must return empty string');

const longText = 'word '.repeat(10000) + 'period';
const processedLong = pipeline.process(longText);
// ── 12. Password, Contextual Aadhaar, & Spoken Digits ───────────────────────
const passwordSample = 'the password is jagrithi add the rate 1-2-3';
assert.strictEqual(
  pipeline.process(passwordSample),
  'The password is [PASSWORD-MASKED]',
  'Password with symbols should be masked'
);

const aadhaarSpokenSample = 'My Aadhaal card number is 12345678910';
assert.strictEqual(
  pipeline.process(aadhaarSpokenSample),
  'My Aadhaal card number is [AADHAAR-MASKED]',
  'Contextual spoken Aadhaar must be masked'
);

const spokenDigitsSample = 'charge card four five three two zero one five one one two eight three zero three six six';
assert.strictEqual(
  pipeline.process(spokenDigitsSample),
  'Charge card [CARD-MASKED]',
  'Spoken digits must normalize and mask via Luhn'
);

console.log('[Test] ALL TEXT PIPELINE UNIT TESTS PASSED! \u2713');
