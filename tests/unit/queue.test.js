import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gnaniQueue,
  GnaniRateLimitError,
  GnaniAuthError,
  GnaniError,
} from '../../src/services/gnani/queue.js';

test('GnaniQueue: Strictly serial execution order without parallel concurrency', async () => {
  let activeCount = 0;
  let maxConcurrent = 0;
  const executionOrder = [];

  const makeTask = (id, delayMs) => async () => {
    activeCount++;
    maxConcurrent = Math.max(maxConcurrent, activeCount);
    await new Promise((r) => setTimeout(r, delayMs));
    executionOrder.push(id);
    activeCount--;
    return id;
  };

  const p1 = gnaniQueue.enqueue(makeTask(1, 40));
  const p2 = gnaniQueue.enqueue(makeTask(2, 20));
  const p3 = gnaniQueue.enqueue(makeTask(3, 10));

  const results = await Promise.all([p1, p2, p3]);

  assert.deepEqual(results, [1, 2, 3]);
  assert.deepEqual(executionOrder, [1, 2, 3]);
  assert.equal(maxConcurrent, 1, 'Only one task should be active at a time');
});

test('GnaniQueue: Retries on HTTP 429 and succeeds if limit clears', async () => {
  let callCount = 0;
  const flakeTask = async () => {
    callCount++;
    if (callCount < 2) {
      const err = new GnaniError('Rate limited', 429, 'RATE_LIMIT');
      throw err;
    }
    return 'ok-after-retry';
  };

  const res = await gnaniQueue.enqueue(flakeTask);
  assert.equal(res, 'ok-after-retry');
  assert.equal(callCount, 2);
});

test('GnaniQueue: Fails with GnaniRateLimitError when max 429 retries exceeded', async () => {
  const perpetual429 = async () => {
    throw new GnaniError('Rate limit exceeded', 429, 'RATE_LIMIT');
  };

  await assert.rejects(
    async () => {
      await gnaniQueue.enqueue(perpetual429);
    },
    (err) => {
      return err instanceof GnaniRateLimitError || err.status === 429;
    }
  );
});

test('GnaniQueue: Propagates GnaniAuthError immediately without retrying', async () => {
  let attempts = 0;
  const authFail = async () => {
    attempts++;
    throw new GnaniAuthError('Invalid key');
  };

  await assert.rejects(
    async () => {
      await gnaniQueue.enqueue(authFail);
    },
    (err) => {
      return err instanceof GnaniAuthError && attempts === 1;
    }
  );
});

