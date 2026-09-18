const memoryCounters = new Map();

export function getIctDateString(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
}

export function resetSuggestionQuotaMemoryForTesting() {
  memoryCounters.clear();
}

/**
 * Consumes 1 suggestion refresh turn for a user for today (Asia/Ho_Chi_Minh, reset 00:00 ICT).
 * Attempts Supabase RPC with fail-safe in-memory store if the migration table is not yet remote.
 */
export async function consumeSuggestionQuota(serviceClient, userId, limit = 10, now = new Date()) {
  const ictDate = getIctDateString(now);

  if (serviceClient && typeof serviceClient.rpc === 'function') {
    try {
      const { data, error } = await serviceClient.rpc('consume_ai_chat_suggestion_quota', {
        p_user_id: userId,
        p_limit: limit
      });

      if (!error && data && typeof data === 'object') {
        return {
          allowed: Boolean(data.allowed),
          count: Number(data.count),
          remaining: Number(data.remaining),
          limit,
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

  if (currentCount < limit) {
    const nextCount = currentCount + 1;
    memoryCounters.set(key, nextCount);
    return {
      allowed: true,
      count: nextCount,
      remaining: Math.max(0, limit - nextCount),
      limit,
      date: ictDate
    };
  }

  return {
    allowed: false,
    count: currentCount,
    remaining: 0,
    limit,
    date: ictDate
  };
}
