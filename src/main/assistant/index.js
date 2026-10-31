import path from 'path';
import fs from 'fs';
import { memoryStore, MEMORY_DIR } from './memory-store.js';
import { generate, embed } from './gemini.js';
import { captureActiveScreen } from './screen-capture.js';
import { ensureRecentScreenshotsIndexed } from './screenshot-watcher.js';

export { detectIntent } from './intent.js';
export { startScreenshotWatcher, stopScreenshotWatcher, getMemoryStatus, ensureRecentScreenshotsIndexed } from './screenshot-watcher.js';

const MIN_SCORE = 0.30;
const CAPTURES_DIR = path.join(MEMORY_DIR, 'captures');

// "remember this ..." - save current screen snapshot to persistent memory
export async function rememberCurrentScreen(note = '') {
  const shot = await captureActiveScreen();
  fs.mkdirSync(CAPTURES_DIR, { recursive: true });

  const filename = `remember_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
  const filePath = path.join(CAPTURES_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(shot.base64, 'base64'));

  const prompt =
    'Describe this screen snapshot so it can be retrieved later from memory. ' +
    (note ? `User note: "${note}". ` : '') +
    'Include active applications, key topics, visible headings, errors, or documents. Plain text, 3 to 5 sentences, no markdown.';

  const description = await generate(prompt, [shot]);
  const embedding = await embed(description);

  memoryStore.add({
    filePath,
    description,
    embedding,
    createdAt: Date.now(),
    intentional: true,
  });

  return {
    path: filePath,
    name: filename,
    description,
  };
}

// Clear all indexed memory items
export function clearMemoryStore() {
  memoryStore.clear();
  return true;
}

// "find ..." - search screenshot memory
export async function findScreenshots(query, limit = 5) {
  if (!query) throw new Error('Say what to find, e.g. "find the screenshot with the error".');

  // If memory is empty or behind, index recent screenshots immediately
  if (memoryStore.count() === 0) {
    await ensureRecentScreenshotsIndexed(5).catch(() => {});
  } else {
    // Quick check to index the latest screenshot if just captured
    await ensureRecentScreenshotsIndexed(1).catch(() => {});
  }

  if (memoryStore.count() === 0) {
    throw new Error('No screenshots found in your Screenshots folder. Take a screenshot with Win+Shift+S or PrtScn.');
  }
  const qEmb = await embed(query);
  const allResults = memoryStore.search(qEmb, limit);
  const filtered = allResults.filter((r) => r.score >= MIN_SCORE);
  const results = filtered.length > 0 ? filtered : allResults.slice(0, 2);

  return results.map((r) => ({
    path: r.path,
    name: path.basename(r.path),
    description: r.description,
    score: Math.round(r.score * 100) / 100,
    createdAt: r.createdAt,
  }));
}

// "summarize ..." - summary of the latest screenshots
export async function summarizeRecent(focus = '', limit = 10) {
  if (memoryStore.count() === 0) {
    await ensureRecentScreenshotsIndexed(5).catch(() => {});
  }
  const recent = memoryStore.recent(limit);
  if (!recent.length) {
    throw new Error('No screenshots indexed yet to summarize.');
  }
  const list = recent
    .map((e, i) => `${i + 1}. [${new Date(e.createdAt).toLocaleString()}] ${e.description}`)
    .join('\n');

  const prompt =
    `These are descriptions of my ${recent.length} most recent screenshots, newest first:\n\n${list}\n\n` +
    (focus ? `Focus on: ${focus}\n\n` : '') +
    'Summarize what I was working on in a few short sentences. Plain text, no markdown.';

  return generate(prompt);
}

// "hey pill / reply / answer ..." - look at the screen and write a reply to paste
export async function askAboutScreen(instruction) {
  const shot = await captureActiveScreen();
  const prompt = instruction
    ? `Instruction: ${instruction}`
    : 'Write a suitable reply to what is shown on screen.';

  return generate(prompt, [shot], {
    system:
      'You are a writing assistant. The user is looking at the attached screenshot of their screen. ' +
      'Follow their instruction using what is on screen as context. ' +
      'Return only the text to paste at their cursor: no preamble, no quotes, no markdown.',
  });
}
