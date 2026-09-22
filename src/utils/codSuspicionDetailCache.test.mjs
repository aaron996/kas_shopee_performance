import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCodSmsEvidenceCacheKey,
  getCachedCodSmsEvidence,
  invalidateCodSmsEvidenceCache,
  clearCodSmsEvidenceCache,
  fetchCodSmsAssessmentEvidenceCached,
  COD_SMS_EVIDENCE_CACHE_TTL_MS
} from './codSuspicionClient.js';

test('getCodSmsEvidenceCacheKey isolates by user email, role, and stable 3-part case tuple', () => {
  const baseParams = {
    suspicionType: 'Gối đầu COD',
    driverId: 'DRV-001',
    orderCode: 'GHN-12345',
    userEmail: 'dev@ghn.vn',
    isDevAdmin: true
  };

  const key1 = getCodSmsEvidenceCacheKey(baseParams);
  assert.equal(key1, 'dev@ghn.vn::dev::Gối đầu COD\u0000DRV-001\u0000GHN-12345');

  // Case-insensitive email and whitespace normalization
  const key1Normalized = getCodSmsEvidenceCacheKey({
    ...baseParams,
    userEmail: '  DEV@GHN.VN  ',
    driverId: ' DRV-001 '
  });
  assert.equal(key1, key1Normalized);

  // Different user role creates different cache scope
  const keyNonDev = getCodSmsEvidenceCacheKey({
    ...baseParams,
    isDevAdmin: false
  });
  assert.notEqual(key1, keyNonDev);
  assert.equal(keyNonDev, 'dev@ghn.vn::viewer::Gối đầu COD\u0000DRV-001\u0000GHN-12345');

  // Different user email creates different cache scope
  const keyDifferentUser = getCodSmsEvidenceCacheKey({
    ...baseParams,
    userEmail: 'other@ghn.vn'
  });
  assert.notEqual(key1, keyDifferentUser);

  // Different orderCode creates different key
  const keyDifferentOrder = getCodSmsEvidenceCacheKey({
    ...baseParams,
    orderCode: 'GHN-99999'
  });
  assert.notEqual(key1, keyDifferentOrder);

  // Different driverId creates different key
  const keyDifferentDriver = getCodSmsEvidenceCacheKey({
    ...baseParams,
    driverId: 'DRV-002'
  });
  assert.notEqual(key1, keyDifferentDriver);

  // Different suspicionType creates different key
  const keyDifferentType = getCodSmsEvidenceCacheKey({
    ...baseParams,
    suspicionType: 'Rút ruột'
  });
  assert.notEqual(key1, keyDifferentType);
});

test('SMS detail cache: reopening same SMS uses cached result without redundant requests', async () => {
  clearCodSmsEvidenceCache();

  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    fetchCallCount++;
    return {
      ok: true,
      json: async () => ({
        contractVersion: '1',
        assessments: [
          {
            key: {
              suspicionType: 'Gối đầu COD',
              driverId: 'DRV-100',
              orderCode: 'ORD-100'
            },
            status: 'scored',
            smsScore: 7,
            evidence: ['SMS 1: Chuyển khoản stk 123456', 'SMS 2: Đã nhận tiền']
          }
        ],
        meta: { count: 1 }
      })
    };
  };

  try {
    const caseParams = {
      suspicionType: 'Gối đầu COD',
      driverId: 'DRV-100',
      orderCode: 'ORD-100',
      userEmail: 'admin@ghn.vn',
      isDevAdmin: true
    };

    // First fetch: cache miss -> network call
    const result1 = await fetchCodSmsAssessmentEvidenceCached(caseParams);
    assert.equal(result1.success, true);
    assert.equal(result1.fromCache, false);
    assert.equal(fetchCallCount, 1);
    assert.equal(result1.assessment.evidence.length, 2);

    // Second fetch (modal reopened for the same SMS): cache hit -> NO network call
    const result2 = await fetchCodSmsAssessmentEvidenceCached(caseParams);
    assert.equal(result2.success, true);
    assert.equal(result2.fromCache, true);
    assert.equal(fetchCallCount, 1, 'Fetch count should remain 1 on cache hit');
    assert.deepEqual(result2.assessment, result1.assessment);

    // Third fetch: different SMS record -> network call required
    const differentCaseParams = {
      ...caseParams,
      orderCode: 'ORD-200'
    };
    const result3 = await fetchCodSmsAssessmentEvidenceCached(differentCaseParams);
    assert.equal(result3.success, true);
    assert.equal(result3.fromCache, false);
    assert.equal(fetchCallCount, 2, 'Different orderCode must trigger a new fetch');

    // Fourth fetch: different user scope -> network call required
    const differentUserParams = {
      ...caseParams,
      userEmail: 'user2@ghn.vn'
    };
    const result4 = await fetchCodSmsAssessmentEvidenceCached(differentUserParams);
    assert.equal(result4.success, true);
    assert.equal(result4.fromCache, false);
    assert.equal(fetchCallCount, 3, 'Different userEmail must not use cached data of another user');
  } finally {
    globalThis.fetch = originalFetch;
    clearCodSmsEvidenceCache();
  }
});

test('SMS detail cache: forceRefresh, manual invalidation, and TTL expiration trigger refetch', async () => {
  clearCodSmsEvidenceCache();

  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    fetchCallCount++;
    return {
      ok: true,
      json: async () => ({
        assessments: [{ key: {}, status: 'scored', evidence: ['SMS quote'] }]
      })
    };
  };

  try {
    const params = {
      suspicionType: 'Gối đầu COD',
      driverId: 'DRV-100',
      orderCode: 'ORD-100',
      userEmail: 'admin@ghn.vn',
      isDevAdmin: true
    };

    // Initial load
    await fetchCodSmsAssessmentEvidenceCached(params);
    assert.equal(fetchCallCount, 1);

    // forceRefresh: true must bypass cache and refetch
    const refreshed = await fetchCodSmsAssessmentEvidenceCached({
      ...params,
      forceRefresh: true
    });
    assert.equal(refreshed.fromCache, false);
    assert.equal(fetchCallCount, 2);

    // After refresh, subsequent load is cached again
    const cachedAfterRefresh = await fetchCodSmsAssessmentEvidenceCached(params);
    assert.equal(cachedAfterRefresh.fromCache, true);
    assert.equal(fetchCallCount, 2);

    // Invalidate specific cache entry
    invalidateCodSmsEvidenceCache(params);
    const refetchedAfterInvalidate = await fetchCodSmsAssessmentEvidenceCached(params);
    assert.equal(refetchedAfterInvalidate.fromCache, false);
    assert.equal(fetchCallCount, 3);

    // TTL expiration test
    const originalDateNow = Date.now;
    try {
      // Fast-forward beyond TTL
      Date.now = () => originalDateNow() + COD_SMS_EVIDENCE_CACHE_TTL_MS + 1000;
      const refetchedAfterTtl = await fetchCodSmsAssessmentEvidenceCached(params);
      assert.equal(refetchedAfterTtl.fromCache, false);
      assert.equal(fetchCallCount, 4);
    } finally {
      Date.now = originalDateNow;
    }
  } finally {
    globalThis.fetch = originalFetch;
    clearCodSmsEvidenceCache();
  }
});

test('SMS detail cache: race condition safety with AbortSignal', async () => {
  clearCodSmsEvidenceCache();

  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    const signal = options?.signal;
    if (signal?.aborted) {
      const err = new Error('This operation was aborted');
      err.name = 'AbortError';
      throw err;
    }
    // Simulate network delay
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 50);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          const err = new Error('This operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }
    });

    return {
      ok: true,
      json: async () => ({
        assessments: [{ key: {}, status: 'scored', evidence: ['Evidence'] }]
      })
    };
  };

  try {
    const controller = new AbortController();
    const fetchPromise = fetchCodSmsAssessmentEvidenceCached({
      suspicionType: 'Gối đầu COD',
      driverId: 'DRV-100',
      orderCode: 'ORD-SLOW',
      userEmail: 'admin@ghn.vn',
      isDevAdmin: true,
      signal: controller.signal
    });

    // Abort before completion
    controller.abort();
    const result = await fetchPromise;

    assert.equal(result.success, false);
    assert.equal(result.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
    clearCodSmsEvidenceCache();
  }
});

test('SMS detail cache: network errors do not poison cache and recover cleanly on retry', async () => {
  clearCodSmsEvidenceCache();

  let shouldFail = true;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    if (shouldFail) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Server internal error' } })
      };
    }
    return {
      ok: true,
      json: async () => ({
        assessments: [{ key: {}, status: 'scored', evidence: ['Valid evidence'] }]
      })
    };
  };

  try {
    const params = {
      suspicionType: 'Gối đầu COD',
      driverId: 'DRV-100',
      orderCode: 'ORD-ERR',
      userEmail: 'admin@ghn.vn',
      isDevAdmin: true
    };

    // First attempt fails
    const failResult = await fetchCodSmsAssessmentEvidenceCached(params);
    assert.equal(failResult.success, false);
    assert.equal(getCachedCodSmsEvidence(params), null, 'Failed fetch must not be cached');

    // Server recovers, user retries
    shouldFail = false;
    const retryResult = await fetchCodSmsAssessmentEvidenceCached(params);
    assert.equal(retryResult.success, true);
    assert.equal(retryResult.assessment.evidence[0], 'Valid evidence');

    // Subsequent call now uses the valid cache
    const cachedResult = await fetchCodSmsAssessmentEvidenceCached(params);
    assert.equal(cachedResult.fromCache, true);
  } finally {
    globalThis.fetch = originalFetch;
    clearCodSmsEvidenceCache();
  }
});
