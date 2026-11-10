import { logger } from '../../main/logger.js';

export class GnaniError extends Error {
  constructor(message, status = 500, kind = 'GNANI_ERROR') {
    super(message);
    this.name = 'GnaniError';
    this.status = status;
    this.kind = kind;
  }
}

export class GnaniAuthError extends GnaniError {
  constructor(message = 'Invalid Gnani API Key (HTTP 401). Check GNANI_API_KEY.') {
    super(message, 401, 'AUTH_ERROR');
    this.name = 'GnaniAuthError';
  }
}

export class GnaniRateLimitError extends GnaniError {
  constructor(message = 'Gnani API concurrency/rate limit exceeded (HTTP 429).') {
    super(message, 429, 'RATE_LIMIT');
    this.name = 'GnaniRateLimitError';
  }
}

export class GnaniServerError extends GnaniError {
  constructor(message = 'Gnani speech service temporarily unavailable (HTTP 5xx).', status = 500) {
    super(message, status, 'SERVER_ERROR');
    this.name = 'GnaniServerError';
  }
}

class SerialGnaniQueue {
  constructor() {
    this.queue = [];
    this.running = false;
  }

  // Serializes calls to Gnani API with 429 backoff retry
  enqueue(taskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject, retries: 0 });
      this._drain();
    });
  }

  async _drain() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;

    const item = this.queue.shift();
    try {
      const result = await this._executeWithRetry(item.taskFn, item.retries);
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      this.running = false;
      this._drain();
    }
  }

  async _executeWithRetry(taskFn, initialRetries = 0) {
    let attempts = initialRetries;
    const maxRetries = 3;

    while (true) {
      try {
        return await taskFn();
      } catch (err) {
        const is429 = err.status === 429 || err.kind === 'RATE_LIMIT' || (err.message && err.message.includes('429'));
        if (is429 && attempts < maxRetries) {
          attempts++;
          const baseDelay = Math.pow(2, attempts - 1) * 1000;
          const jitter = Math.floor(Math.random() * 300);
          const delay = baseDelay + jitter;
          logger.warn(`[GnaniQueue] Rate limit 429 received. Backing off ${delay}ms (Retry ${attempts}/${maxRetries})...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (is429) {
          throw new GnaniRateLimitError('Gnani API concurrency limit reached. Please wait a moment and try again.');
        }

        throw err;
      }
    }
  }

  getPendingCount() {
    return this.queue.length;
  }
}

export const gnaniQueue = new SerialGnaniQueue();

