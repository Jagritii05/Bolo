import fs from 'fs';
import path from 'path';
import os from 'os';
import { settingsStore } from '../settings-store.js';
import { logger } from '../logger.js';
import { memoryStore } from './memory-store.js';
import { generate, embed, hasApiKey } from './gemini.js';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const BACKFILL_LIMIT = 30;

const DESCRIBE_PROMPT =
  'Describe this screenshot so it can be found later by search. ' +
  'Mention the app or website, the main topic, any visible titles, headings, error messages, ' +
  'names and key text. Plain text, 3 to 6 sentences, no markdown.';

let watchers = [];
let watchedFolders = [];
const queue = [];
const queued = new Set();
let working = false;
let lastError = null;

function isImage(file) {
  return IMAGE_EXTS.has(path.extname(file).toLowerCase());
}

// Wait until the file stops growing (screenshot tools write in chunks)
async function waitForStableFile(filePath, tries = 10) {
  let lastSize = -1;
  for (let i = 0; i < tries; i++) {
    try {
      const { size } = fs.statSync(filePath);
      if (size > 0 && size === lastSize) return true;
      lastSize = size;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return lastSize > 0;
}

export async function indexScreenshot(filePath, intentional = false) {
  if (!(await waitForStableFile(filePath))) return false;
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_IMAGE_BYTES) {
    logger.warn(`[Memory] Skipping large image (${stat.size} bytes): ${path.basename(filePath)}`);
    return false;
  }

  const base64 = fs.readFileSync(filePath).toString('base64');
  const mimeType = MIME[path.extname(filePath).toLowerCase()] || 'image/png';

  const description = await generate(DESCRIBE_PROMPT, [{ mimeType, base64 }]);
  const embedding = await embed(description);
  memoryStore.add({ filePath, description, embedding, createdAt: stat.mtimeMs, intentional });
  logger.info(`[Memory] Indexed ${path.basename(filePath)} (${memoryStore.count()} total).`);
  return true;
}

function enqueue(filePath) {
  const key = path.resolve(filePath).toLowerCase();
  if (queued.has(key) || memoryStore.has(filePath)) return;
  queued.add(key);
  queue.push(filePath);
  processQueue();
}

async function processQueue() {
  if (working) return;
  working = true;
  while (queue.length) {
    const file = queue.shift();
    try {
      if (fs.existsSync(file)) await indexScreenshot(file);
      lastError = null;
    } catch (err) {
      lastError = err.message;
      logger.warn(`[Memory] Failed to index ${path.basename(file)}: ${err.message}`);
      // Back off on rate limits so the free tier isn't hammered
      if (err.status === 429) await new Promise((r) => setTimeout(r, 15000));
    } finally {
      queued.delete(path.resolve(file).toLowerCase());
    }
  }
  working = false;
}

export function getCandidateFolders() {
  const folders = [
    settingsStore.get('screenshotFolder'),
    process.env.ONEDRIVE ? path.join(process.env.ONEDRIVE, 'Pictures', 'Screenshots') : null,
    process.env.OneDriveConsumer ? path.join(process.env.OneDriveConsumer, 'Pictures', 'Screenshots') : null,
    path.join(os.homedir(), 'OneDrive', 'Pictures', 'Screenshots'),
    path.join(os.homedir(), 'Pictures', 'Screenshots'),
  ].filter(Boolean);

  const unique = [];
  const seen = new Set();
  for (const f of folders) {
    const resolved = path.resolve(f);
    const lower = resolved.toLowerCase();
    if (!seen.has(lower) && fs.existsSync(resolved)) {
      seen.add(lower);
      unique.push(resolved);
    }
  }
  return unique;
}

// Index recent screenshots within lookback window that aren't in the index yet
export function backfill(folder) {
  if (settingsStore.get('memoryMode') === 'intentional_only') return;

  try {
    const lookbackHours = settingsStore.get('memoryMaxLookbackHours') || 72;
    const cutoff = Date.now() - (lookbackHours * 60 * 60 * 1000);
    const maxEntries = settingsStore.get('memoryMaxEntries') || 25;
    const remainingSlots = Math.max(0, maxEntries - memoryStore.count());
    if (remainingSlots === 0) return;

    const files = fs.readdirSync(folder)
      .filter(isImage)
      .map((f) => path.join(folder, f))
      .map((f) => ({ f, t: fs.statSync(f).mtimeMs }))
      .filter((x) => x.t >= cutoff)
      .sort((a, b) => b.t - a.t)
      .slice(0, Math.min(10, remainingSlots))
      .map((x) => x.f);

    files.filter((f) => !memoryStore.has(f)).forEach(enqueue);
  } catch (err) {
    logger.warn(`[Memory] Backfill failed for ${folder}: ${err.message}`);
  }
}

// Synchronously index recent screenshots within lookback window on demand
export async function ensureRecentScreenshotsIndexed(limit = 3) {
  if (!settingsStore.get('memoryEnabled') || !hasApiKey()) return 0;
  if (settingsStore.get('memoryMode') === 'intentional_only') return 0;

  const lookbackHours = settingsStore.get('memoryMaxLookbackHours') || 72;
  const cutoff = Date.now() - (lookbackHours * 60 * 60 * 1000);
  const folders = getCandidateFolders();
  let count = 0;

  for (const folder of folders) {
    if (!fs.existsSync(folder)) continue;
    try {
      const allFiles = fs.readdirSync(folder)
        .filter(isImage)
        .map((f) => path.join(folder, f))
        .map((f) => ({ f, t: fs.statSync(f).mtimeMs }))
        .sort((a, b) => b.t - a.t);

      // Prioritize files within lookback window, but fall back to newest files if none match
      let candidateFiles = allFiles.filter((x) => x.t >= cutoff);
      if (candidateFiles.length === 0 && allFiles.length > 0) {
        candidateFiles = allFiles.slice(0, limit);
      } else {
        candidateFiles = candidateFiles.slice(0, limit);
      }

      for (const item of candidateFiles) {
        if (!memoryStore.has(item.f)) {
          const ok = await indexScreenshot(item.f, false);
          if (ok) count++;
        }
      }
    } catch (_) {}
  }
  return count;
}

export function startScreenshotWatcher() {
  stopScreenshotWatcher();

  if (!settingsStore.get('memoryEnabled')) {
    logger.info('[Memory] Screenshot memory disabled in settings.');
    return;
  }
  if (!hasApiKey()) {
    logger.info('[Memory] No Gemini API key set. Screenshot memory is idle.');
    return;
  }
  if (settingsStore.get('memoryMode') === 'intentional_only') {
    logger.info('[Memory] Intentional-only mode enabled. Background folder watcher is idle.');
    return;
  }

  const folders = getCandidateFolders();
  if (!folders.length) {
    logger.warn('[Memory] No existing screenshot folders found.');
    return;
  }

  memoryStore.prune();
  watchedFolders = folders;

  for (const folder of folders) {
    try {
      const w = fs.watch(folder, (eventType, filename) => {
        if (!filename || !isImage(filename)) return;
        const full = path.join(folder, filename);
        if (fs.existsSync(full)) enqueue(full);
      });
      w.on('error', (err) => logger.warn(`[Memory] Watcher error in ${folder}: ${err.message}`));
      watchers.push(w);
      logger.info(`[Memory] Watching ${folder} for new screenshots.`);
      backfill(folder);
    } catch (err) {
      logger.warn(`[Memory] Failed to watch ${folder}: ${err.message}`);
    }
  }
}

export function stopScreenshotWatcher() {
  for (const w of watchers) {
    try {
      w.close();
    } catch (_) {}
  }
  watchers = [];
  watchedFolders = [];
}

export function getMemoryStatus() {
  return {
    enabled: Boolean(settingsStore.get('memoryEnabled')),
    hasKey: hasApiKey(),
    folder: watchedFolders.join('; ') || settingsStore.get('screenshotFolder'),
    watching: watchers.length > 0,
    indexed: memoryStore.count(),
    pending: queue.length + (working ? 1 : 0),
    lastError,
  };
}
