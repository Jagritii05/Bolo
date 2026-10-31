import fs from 'fs';
import path from 'path';
import os from 'os';

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const MEMORY_DIR = path.join(appData, 'LocalPill', 'memory');
const INDEX_FILE = path.join(MEMORY_DIR, 'index.json');

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// Local screenshot index stored as a JSON file. Only descriptions and vectors are kept.
class MemoryStore {
  constructor(file = INDEX_FILE, maxEntries = 25) {
    this.file = file;
    this.maxEntries = maxEntries;
    this.entries = [];
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
        this.entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      }
    } catch (_) {
      this.entries = [];
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, entries: this.entries }), 'utf-8');
    fs.renameSync(tmp, this.file);
  }

  has(filePath) {
    const key = path.resolve(filePath).toLowerCase();
    return this.entries.some((e) => e.path.toLowerCase() === key);
  }

  add({ filePath, description, embedding, createdAt, intentional = false }) {
    const resolved = path.resolve(filePath);
    this.entries = this.entries.filter((e) => e.path.toLowerCase() !== resolved.toLowerCase());

    // FIFO eviction capped at maxEntries (default 25)
    while (this.entries.length >= this.maxEntries) {
      const nonIntentionalIdx = this.entries.findIndex((e) => !e.intentional);
      if (nonIntentionalIdx !== -1) {
        this.entries.splice(nonIntentionalIdx, 1);
      } else {
        this.entries.shift();
      }
    }

    this.entries.push({
      path: resolved,
      description,
      embedding,
      intentional: Boolean(intentional),
      createdAt: createdAt || Date.now(),
      indexedAt: Date.now(),
    });
    this.save();
  }

  // Clear all indexed entries
  clear() {
    this.entries = [];
    this.save();
  }

  // Drop entries whose files were deleted
  prune() {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => fs.existsSync(e.path));
    if (this.entries.length !== before) this.save();
  }

  search(queryEmbedding, limit = 5) {
    return this.entries
      .map((e) => {
        const baseScore = cosine(queryEmbedding, e.embedding);
        const score = e.intentional ? Math.min(1.0, baseScore + 0.05) : baseScore;
        return {
          path: e.path,
          description: e.description,
          createdAt: e.createdAt,
          intentional: Boolean(e.intentional),
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  recent(limit = 10) {
    return [...this.entries].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  count() {
    return this.entries.length;
  }
}

export const memoryStore = new MemoryStore();
export { MemoryStore, cosine, MEMORY_DIR };
