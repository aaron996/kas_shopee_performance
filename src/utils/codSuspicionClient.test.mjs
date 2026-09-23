import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCodSmsAssessmentPages } from './codSmsAssessmentPagination.js';

function assessment(index) {
  return {
    key: {
      suspicionType: 'Gối đầu COD',
      driverId: `D${Math.floor(index / 10)}`,
      orderCode: `O${index}`
    },
    status: 'scored',
    smsScore: index % 9 + 1
  };
}

test('collectCodSmsAssessmentPages fetches every page when the exact total exceeds 500', async () => {
  const requests = [];
  const allRows = Array.from({ length: 501 }, (_, index) => assessment(index));
  const result = await collectCodSmsAssessmentPages(async ({ limit, offset }) => {
    requests.push({ limit, offset });
    return {
      success: true,
      contractVersion: '1',
      assessments: allRows.slice(offset, offset + limit),
      meta: { totalCount: allRows.length }
    };
  });

  assert.equal(result.success, true);
  assert.equal(result.assessments.length, 501);
  assert.equal(result.meta.totalCount, 501);
  assert.deepEqual(requests, [
    { limit: 500, offset: 0 },
    { limit: 500, offset: 500 }
  ]);
});

test('collectCodSmsAssessmentPages returns an empty successful result for zero assessments', async () => {
  let requestedPages = 0;
  const result = await collectCodSmsAssessmentPages(async () => {
    requestedPages += 1;
    return { success: true, assessments: [], meta: { totalCount: 0 } };
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.assessments, []);
  assert.equal(result.meta.totalCount, 0);
  assert.equal(requestedPages, 1);
});

test('collectCodSmsAssessmentPages fails closed when any later page fails', async () => {
  const allRows = Array.from({ length: 501 }, (_, index) => assessment(index));
  const result = await collectCodSmsAssessmentPages(async ({ offset, limit }) => {
    if (offset > 0) return { success: false, error: 'page failed', assessments: [], meta: {} };
    return {
      success: true,
      assessments: allRows.slice(offset, offset + limit),
      meta: { totalCount: allRows.length }
    };
  });

  assert.equal(result.success, false);
  assert.deepEqual(result.assessments, [], 'Partial pages are never exposed as a complete summary');
  assert.match(result.error, /page failed/);
});

test('collectCodSmsAssessmentPages rejects incomplete counts, duplicate keys, and totals beyond API offset limits', async () => {
  const shortPage = await collectCodSmsAssessmentPages(async () => ({
    success: true,
    assessments: [assessment(0)],
    meta: { totalCount: 2 }
  }));
  assert.equal(shortPage.success, false);
  assert.deepEqual(shortPage.assessments, []);

  const duplicatePage = await collectCodSmsAssessmentPages(async ({ offset }) => ({
    success: true,
    assessments: [assessment(0)],
    meta: { totalCount: 2 }
  }), { limit: 1 });
  assert.equal(duplicatePage.success, false);
  assert.deepEqual(duplicatePage.assessments, []);
  assert.match(duplicatePage.error, /trùng/);

  let requestedPages = 0;
  const beyondOffset = await collectCodSmsAssessmentPages(async ({ limit }) => {
    requestedPages += 1;
    return {
      success: true,
      assessments: Array.from({ length: limit }, (_, index) => assessment(index)),
      meta: { totalCount: 100501 }
    };
  });
  assert.equal(beyondOffset.success, false);
  assert.deepEqual(beyondOffset.assessments, []);
  assert.match(beyondOffset.error, /giới hạn phân trang/);
  assert.equal(requestedPages, 1);
});
