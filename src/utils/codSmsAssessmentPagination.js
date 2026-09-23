import { getCodSmsCaseKey } from './codSuspicionProcessor.js';

export const COD_SMS_ASSESSMENT_MAX_LIMIT = 500;
const COD_SMS_ASSESSMENT_MAX_OFFSET = 100000;

/**
 * Load every page from the contract-v1 summary endpoint. Requires the exact
 * `meta.totalCount` and complete 3-part case keys, and fails closed if paging
 * cannot prove that every assessment was received.
 */
export async function collectCodSmsAssessmentPages(loadPage, { limit = 500 } = {}) {
  const pageLimit = Math.min(Math.max(Number(limit) || 500, 1), COD_SMS_ASSESSMENT_MAX_LIMIT);
  const failure = error => ({ success: false, error, assessments: [], meta: {} });
  if (typeof loadPage !== 'function') {
    return failure('Không có bộ tải trang đánh giá SMS hợp lệ.');
  }

  const assessments = [];
  const seenCaseKeys = new Set();
  let totalCount = null;
  let offset = 0;
  let contractVersion = '1';

  while (totalCount === null || offset < totalCount) {
    if (offset > COD_SMS_ASSESSMENT_MAX_OFFSET) {
      return failure('Số đánh giá SMS vượt giới hạn phân trang hiện tại của API.');
    }

    const page = await loadPage({ limit: pageLimit, offset });
    if (!page?.success) {
      return failure(page?.error || 'Không thể tải đầy đủ các trang đánh giá SMS.');
    }

    const pageTotalCount = page.meta?.totalCount;
    if (!Number.isSafeInteger(pageTotalCount) || pageTotalCount < 0) {
      return failure('API không trả về tổng số đánh giá SMS hợp lệ để kiểm tra phân trang.');
    }
    if (totalCount !== null && pageTotalCount !== totalCount) {
      return failure('Số lượng đánh giá SMS thay đổi trong lúc tải; hãy tải lại để tránh dùng dữ liệu thiếu.');
    }
    totalCount = pageTotalCount;
    contractVersion = page.contractVersion || contractVersion;

    if (totalCount > COD_SMS_ASSESSMENT_MAX_OFFSET + pageLimit) {
      return failure('Số đánh giá SMS vượt giới hạn phân trang hiện tại của API.');
    }

    const pageAssessments = Array.isArray(page.assessments) ? page.assessments : [];
    if (pageAssessments.length > pageLimit) {
      return failure('API trả về quá số đánh giá SMS cho một trang.');
    }
    if (pageAssessments.length === 0 && offset < totalCount) {
      return failure('API kết thúc trang trước khi tải đủ số đánh giá SMS đã công bố.');
    }
    if (offset + pageAssessments.length < totalCount && pageAssessments.length < pageLimit) {
      return failure('API trả về một trang ngắn hơn giới hạn trước khi hết đánh giá SMS.');
    }

    for (const assessment of pageAssessments) {
      const identity = assessment?.key;
      const suspicionType = String(identity?.suspicionType ?? identity?.suspicion_type ?? '').trim();
      const driverId = String(identity?.driverId ?? identity?.driver_id ?? '').trim();
      const orderCode = String(identity?.orderCode ?? identity?.order_code ?? '').trim();
      if (!suspicionType || !driverId || !orderCode) {
        return failure('API trả về đánh giá SMS thiếu khóa loại nghi ngờ, tài xế hoặc mã đơn.');
      }

      const caseKey = getCodSmsCaseKey(identity);
      if (seenCaseKeys.has(caseKey)) {
        return failure('API trả về khóa đánh giá SMS trùng khi phân trang; hãy tải lại dữ liệu.');
      }
      seenCaseKeys.add(caseKey);
      assessments.push(assessment);
    }

    offset += pageAssessments.length;
  }

  if (assessments.length !== totalCount) {
    return failure('Đã tải chưa đủ số đánh giá SMS theo tổng số API công bố.');
  }

  return {
    success: true,
    contractVersion,
    assessments,
    meta: { count: assessments.length, totalCount, offset: 0 }
  };
}
