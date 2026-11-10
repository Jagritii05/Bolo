import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDictation, transliterateToEnglishScript } from '../../src/services/llm/index.js';

test('Dictation: Formats spoken punctuation and capitalization', () => {
  const raw = 'hello comma this is an urgent reminder full stop please check the file';
  const clean = formatDictation(raw);
  assert.equal(clean, 'Hello, this is an urgent reminder. Please check the file');
});

test('Dictation: Formats Indic spoken punctuation keywords', () => {
  const raw = 'namaste purna viram kal subah milte hain alpaviram kripya confirm karein';
  const clean = formatDictation(raw);
  assert.equal(clean, 'Namaste. Kal subah milte hain, kripya confirm karein');
});

test('Dictation: Handles new lines and questions', () => {
  const raw = 'are you available today question mark new line we need to discuss the project';
  const clean = formatDictation(raw);
  assert.match(clean, /\?/);
  assert.match(clean, /\n/);
});

test('Dictation: Preserves English script directly', async () => {
  const raw = 'mera naam rahul hai full stop';
  const clean = await transliterateToEnglishScript(raw);
  assert.equal(clean, 'Mera naam rahul hai.');
});

