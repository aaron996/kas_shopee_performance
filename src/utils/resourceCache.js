// Bounded, memory-only cache. Invalidation also detaches pending reads so an
// older response cannot repopulate the cache after a refresh or mutation.
export function createResourceCache({ now = Date.now, maxEntries = 64 } = {}) {
  const entries = new Map();
  const pending = new Map();
  const peek = key => {
    const entry = entries.get(key);
    if (!entry || entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry.value;
  };
  const invalidate = (matches = () => true) => {
    for (const key of entries.keys()) if (matches(key)) entries.delete(key);
    for (const key of pending.keys()) if (matches(key)) pending.delete(key);
  };
  const read = (key, loader, { ttlMs = 60_000, forceRefresh = false } = {}) => {
    if (forceRefresh) invalidate(candidate => candidate === key);
    const cached = peek(key);
    if (cached !== undefined) return Promise.resolve(cached);
    if (pending.has(key)) return pending.get(key);
    const promise = Promise.resolve().then(loader).then(value => {
      if (pending.get(key) === promise) {
        entries.delete(key);
        entries.set(key, { value, expiresAt: now() + ttlMs });
        while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      }
      return value;
    }).finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
    });
    pending.set(key, promise);
    return promise;
  };
  return { peek, read, invalidate };
}

// Cancellation belongs to a consumer, not to a request shared by other views.
export function withConsumerSignal(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
