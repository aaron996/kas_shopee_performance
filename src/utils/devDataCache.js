import { createResourceCache, withConsumerSignal } from './resourceCache.js';

export function createDevDataClient({ auth, fetchImpl = (...args) => fetch(...args), cache = createResourceCache() }) {

  const scope = user => JSON.stringify([user?.supabaseUser?.id, user?.email?.trim().toLowerCase(), user?.role]);
  const key = (user, resource) => JSON.stringify([scope(user), resource]);
  const clearDevDataCache = () => cache.invalidate();
  const peekDevResource = (user, resource) => user?.isDevAdmin ? cache.peek(key(user, resource)) : undefined;

  const getSession = async user => {
    const { data: { session } } = await auth.getSession();
    if (!session?.access_token || !user?.isDevAdmin || session.user?.email?.toLowerCase() !== user.email?.toLowerCase()
      || (user.supabaseUser?.id && session.user?.id !== user.supabaseUser.id)) {
      throw new Error('Chưa đăng nhập hoặc phiên Dev đã hết hạn.');
    }
    return session;
  };

  async function readDevResource(user, resource, loader, options = {}) {
    const session = await getSession(user);
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return withConsumerSignal(cache.read(key(user, resource), () => loader(session), options), options.signal);
  }

  async function fetchDevApi(user, url, { forceRefresh = false, signal, ...options } = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const request = async session => {
      const response = await fetchImpl(url, {
        ...options,
        // Shared GET requests outlive individual consumers; mutations stay direct.
        ...(method === 'GET' ? {} : { signal }),
        headers: { 'Content-Type': 'application/json', ...options.headers, Authorization: `Bearer ${session.access_token}` }
      });
      let payload;
      if ((response.headers.get('content-type') || '').includes('application/json')) payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || `Lỗi yêu cầu (${response.status})`);
      return payload ?? response;
    };
    if (method === 'GET') return readDevResource(user, url, request, { forceRefresh, signal });
    // Even failed probes can persist state. Discard related reads before and
    // after every write, including reads started while the write was pending.
    clearDevDataCache();
    try {
      const session = await getSession(user);
      return await request(session);
    } finally { clearDevDataCache(); }
  }
  return { clearDevDataCache, peekDevResource, readDevResource, fetchDevApi };
}
