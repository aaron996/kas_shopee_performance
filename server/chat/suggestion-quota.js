const memoryCounters = new Map();

export function getIctDateString(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
}

export function resetSuggestionQuotaMemoryForTesting() {
  memoryCounters.clear();
}

export const SUGGESTION_DAILY_LIMIT = 10;

/**
 * Consumes 1 suggestion refresh turn for a user for today (Asia/Ho_Chi_Minh, reset 00:00 ICT).
 * Attempts Supabase RPC with fail-safe in-memory store if the migration table is not yet remote.
 * Server-side quota is strictly locked to 10 and does not accept client expansion.
 */
export async function consumeSuggestionQuota(serviceClient, userId, limit = SUGGESTION_DAILY_LIMIT, now = new Date()) {
  const safeLimit = SUGGESTION_DAILY_LIMIT;
  const ictDate = getIctDateString(now);

  if (serviceClient && typeof serviceClient.rpc === 'function') {
    try {
      const { data, error } = await serviceClient.rpc('consume_ai_chat_suggestion_quota', {
        p_user_id: userId,
        p_limit: safeLimit
      });

      if (!error && data && typeof data === 'object') {
        return {
          allowed: Boolean(data.allowed),
          count: Number(data.count),
          remaining: Number(data.remaining),
          limit: safeLimit,
          date: data.date || ictDate
        };
      }
    } catch {
      // Fall through to memory store fallback
    }
  }

  // Resilient in-memory fallback
  const key = `${userId}:${ictDate}`;
  const currentCount = memoryCounters.get(key) || 0;

  if (currentCount < safeLimit) {
    const nextCount = currentCount + 1;
    memoryCounters.set(key, nextCount);
    return {
      allowed: true,
      count: nextCount,
      remaining: Math.max(0, safeLimit - nextCount),
      limit: safeLimit,
      date: ictDate
    };
  }

  return {
    allowed: false,
    count: safeLimit,
    remaining: 0,
    limit: safeLimit,
    date: ictDate
  };
}
