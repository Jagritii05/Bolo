import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeForSpeech,
  numberToWordsHindi,
  numberToWordsTamil,
  numberToWordsBengali,
} from '../../src/services/gnani/normalizer.js';

test('Normalizer: Number to Words conversion in Hindi', () => {
  assert.equal(numberToWordsHindi(0), 'शून्य');
  assert.equal(numberToWordsHindi(5), 'पाँच');
  assert.equal(numberToWordsHindi(15), 'पंद्रह');
  assert.equal(numberToWordsHindi(25), 'बीस पाँच');
  assert.equal(numberToWordsHindi(100), 'एक सौ');
  assert.equal(numberToWordsHindi(500), 'पाँच सौ');
  assert.equal(numberToWordsHindi(1500), 'एक हज़ार पाँच सौ');
  assert.equal(numberToWordsHindi(750000), 'सात लाख पचास हज़ार');
});

test('Normalizer: Number to Words conversion in Tamil', () => {
  assert.equal(numberToWordsTamil(0), 'சுழியம்');
  assert.equal(numberToWordsTamil(1), 'ஒன்று');
  assert.equal(numberToWordsTamil(10), 'பத்து');
  assert.equal(numberToWordsTamil(100), 'நூறு');
  assert.equal(numberToWordsTamil(500), 'ஐந்து நூறு');
  assert.equal(numberToWordsTamil(1000), 'ஆயிரம்');
});

test('Normalizer: Number to Words conversion in Bengali', () => {
  assert.equal(numberToWordsBengali(0), 'শূন্য');
  assert.equal(numberToWordsBengali(1), 'এক');
  assert.equal(numberToWordsBengali(10), 'দশ');
  assert.equal(numberToWordsBengali(100), 'একশত');
  assert.equal(numberToWordsBengali(500), 'পাঁচ শত');
  assert.equal(numberToWordsBengali(1000), 'এক হাজার');
});

test('Normalizer: Currency symbol normalization', () => {
  const hindiCur = normalizeForSpeech('कृपया ₹500 जमा करें', 'hi-IN');
  assert.match(hindiCur, /पाँच सौ रुपये/);

  const hinglishCur = normalizeForSpeech('Aapki total fee ₹500 lagegi', 'hi-IN');
  assert.match(hinglishCur, /paanch sau rupaye/);

  const tamilCur = normalizeForSpeech('கட்டணம் ₹500 செலுத்தவும்', 'ta-IN');
  assert.match(tamilCur, /ரூபாய்/);

  const bengaliCur = normalizeForSpeech('ফি ₹500 প্রদান করুন', 'bn-IN');
  assert.match(bengaliCur, /টাকা/);
});

test('Normalizer: Percentage normalization', () => {
  const hindiPct = normalizeForSpeech('सफलता दर 50% है', 'hi-IN');
  assert.match(hindiPct, /पचास प्रतिशत/);

  const hinglishPct = normalizeForSpeech('Work 50% complete ho gaya', 'hi-IN');
  assert.match(hinglishPct, /pachaas percent/);

  const tamilPct = normalizeForSpeech('வெற்றி விகிதம் 50%', 'ta-IN');
  assert.match(tamilPct, /சதவீதம்/);

  const bnPct = normalizeForSpeech('সাফল্য 50%', 'bn-IN');
  assert.match(bnPct, /শতাংশ/);
});

test('Normalizer: Markdown cleanup and sentence truncation', () => {
  const markdownText = '## Heading\n* **Bold text** with `code` snippet';
  const clean = normalizeForSpeech(markdownText, 'hi-IN');
  assert.equal(clean.includes('*'), false);
  assert.equal(clean.includes('#'), false);
  assert.equal(clean.includes('`'), false);

  const longText = 'पहला वाक्य यहाँ है। दूसरा वाक्य यहाँ है। तीसरा वाक्य यहाँ है। चौथा वाक्य यहाँ है। पाँचवाँ वाक्य बहुत लंबा है और सीमा को पार कर जाता है।'.repeat(5);
  const truncated = normalizeForSpeech(longText, 'hi-IN', 150);
  assert.ok(truncated.length <= 160);
  assert.ok(truncated.endsWith('।') || truncated.endsWith('...'));
});

