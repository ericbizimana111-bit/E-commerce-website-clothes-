/**
 * Minimal outbound HTTP helpers for third-party services (geocoding, routing,
 * translation). Every call has a hard timeout so a slow provider can never
 * hang a customer request; callers decide how to degrade on failure.
 */

async function fetchJson(url, { method = 'GET', headers = {}, body, timeoutMs = 6000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...headers },
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} from ${new URL(url).host}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Small TTL + size-bounded cache (insertion-ordered Map eviction). */
function createCache({ max = 500, ttlMs = 24 * 60 * 60 * 1000 } = {}) {
  const store = new Map();
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (hit.expires < Date.now()) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      if (store.size >= max) store.delete(store.keys().next().value);
      store.set(key, { value, expires: Date.now() + ttlMs });
    },
    clear() {
      store.clear();
    },
  };
}

/**
 * Serialize calls with a minimum spacing (e.g. Nominatim allows 1 req/s).
 * Returns a wrapper: throttled(fn) -> Promise of fn()'s result.
 */
function createThrottle(minIntervalMs) {
  let chain = Promise.resolve();
  let last = 0;
  return (fn) => {
    const run = chain.then(async () => {
      const wait = last + minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      return fn();
    });
    // Keep the queue alive even when a call fails.
    chain = run.catch(() => {});
    return run;
  };
}

module.exports = { fetchJson, createCache, createThrottle };
