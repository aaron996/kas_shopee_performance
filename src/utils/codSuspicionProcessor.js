/**
 * KAS-221 COD Suspicion Module - Data Processor & Business Logic
 * Source: KAS - Bộ tiêu chí cảnh báo (DOCX chuẩn) & 01_score_model_hcm_v20_PENDING_VERIFY.sql
 *
 * CRITICAL RULE:
 * Tuyệt đối không hiển thị mã kỹ thuật M7, M9, M10, M11, M12 trên UI.
 * Toàn bộ label, badge, tooltip sử dụng ngôn ngữ vận hành tiếng Việt từ DOCX.
 */

export const STRONG_SIGNALS = [
  {
    key: 'signal_reason_conflict',
    label: 'Lý do thất bại không khớp thực tế',
    shortLabel: 'Lý do không khớp',
    points: 3,
    description: 'Ghi nhận lý do "không liên lạc được/không nghe máy" nhưng thực tế cùng ngày đã có cuộc gọi kết nối thành công.'
  },
  {
    key: 'signal_fake_call',
    label: 'Cuộc gọi có dấu hiệu giả',
    shortLabel: 'Call log giả',
    points: 2,
    description: 'Từ lần thử giao thứ 2 trở đi, xuất hiện cuộc gọi gần như chắc chắn không thực (không đổ chuông thật).'
  },
  {
    key: 'signal_gps_far',
    label: 'Vị trí giao thực tế lệch xa địa chỉ khách',
    shortLabel: 'GPS lệch xa',
    points: 5,
    description: 'Lúc bấm giao thành công, vị trí thiết bị cách xa địa chỉ khách hàng.'
  },
  {
    key: 'signal_gps_duplicate',
    label: 'Trùng vị trí bất thường giữa nhiều đơn',
    shortLabel: 'GPS trùng vị trí',
    points: 5,
    description: 'Nhiều đơn khác nhau của cùng một tài xế có vị trí giao thành công trùng khớp tuyệt đối với nhau.'
  },
  {
    key: 'signal_gps_mocked',
    label: 'Thiết bị tự báo vị trí giả',
    shortLabel: 'GPS giả lập',
    points: 3,
    description: 'Lúc giao thành công, thiết bị tự ghi nhận đang ở chế độ giả lập vị trí.'
  }
];

export const STRONG_SIGNAL_MAP = Object.fromEntries(
  STRONG_SIGNALS.map(s => [s.key, s])
);

export const ALERT_LEVELS = {
  HIGH: { value: 'HIGH', label: 'Cao', color: '#dc2626', background: 'rgba(220, 38, 38, 0.10)' },
  MEDIUM: { value: 'MEDIUM', label: 'Vừa', color: '#d97706', background: 'rgba(217, 119, 6, 0.10)' },
  LOW: { value: 'LOW', label: 'Thấp', color: '#2563eb', background: 'rgba(37, 99, 235, 0.10)' }
};

/**
 * KAS-221 only returns screened records from 10 points. Keep the existing
 * high-risk cut-off (18) and split the remaining reviewed queue at 15.
 */
export function getAlertLevel(totalScore) {
  const score = Number(totalScore) || 0;
  if (score >= 18) return ALERT_LEVELS.HIGH;
  if (score >= 15) return ALERT_LEVELS.MEDIUM;
  return ALERT_LEVELS.LOW;
}

/**
 * Format currency VND using vi-VN locale
 */
export function formatCurrencyVND(amount) {
  if (amount === null || amount === undefined || amount === '' || Number.isNaN(Number(amount))) {
    return '-';
  }
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(Number(amount));
}

/**
 * Format date string (YYYY-MM-DD) to dd/MM/yyyy
 */
export function formatDateVN(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '-';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/**
 * Format timestamp (timestamptz) to dd/MM/yyyy HH:mm
 */
export function formatDateTimeVN(isoStr) {
  if (!isoStr) return 'Đang cập nhật';
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return 'Đang cập nhật';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Normalize raw row from Supabase into standard UI order object
 */
export function normalizeSuspicionOrder(raw) {
  const driverId = String(raw.driver_id || raw['ID tài xế'] || '').trim();
  const driverName = (raw.driver_name || raw['Tên tài xế'] || '').trim();
  const orderCode = String(raw.order_code || raw['Mã đơn'] || '').trim();
  const suspicionType = (raw.suspicion_type || raw['Loại nghi ngờ'] || 'Gối đầu COD').trim();
  const orderStatus = (raw.order_status || raw['Trạng thái hiện tại'] || 'delivered').trim();

  const codRaw = raw.cod_amount ?? raw['COD'];
  const codAmount = (codRaw !== null && codRaw !== undefined && codRaw !== '' && !Number.isNaN(Number(codRaw)))
    ? Number(codRaw)
    : null;

  const warehouse = (raw.warehouse_name || raw['Kho giao'] || '').trim();
  const totalScore = Number(raw.total_score ?? raw['Điểm tổng nghi vấn'] ?? 0);

  return {
    id: raw.id || `${driverId}-${orderCode}`,
    driverId,
    driverName: driverName || (driverId ? `Tài xế ${driverId}` : 'Chưa có tên'),
    driverNameRaw: driverName,
    suspicionType,
    orderCode,
    orderStatus,
    codAmount,
    warehouseName: warehouse || 'Chưa rõ kho',
    firstDeliveredDate: raw.first_delivered_date || raw['Ngày gán giao'] || null,
    endDeliveryDate: raw.end_delivery_date || raw['Ngày kết thúc giao'] || null,
    returnDate: raw.return_date || raw['Ngày chuyển hoàn'] || null,
    deliveryDurationDays: raw.delivery_duration_days ?? raw['Tổng thời gian giao (ngày)'] ?? null,
    rescheduleDaysCount: raw.reschedule_days_count ?? raw['Số ngày hẹn giao lại'] ?? null,
    firstFailNote: (raw.first_fail_note || raw['Lý do fail ca giao đầu tiên'] || '').trim() || 'Không ghi nhận lý do',
    totalScore,
    // 5 strong signals
    signalReasonConflict: Boolean(raw.signal_reason_conflict ?? raw['Mâu thuẫn lý do vs duration (M7)']),
    signalFakeCall: Boolean(raw.signal_fake_call ?? raw['Call log giả từ lần thử 2 (M9)']),
    signalGpsFar: Boolean(raw.signal_gps_far ?? raw['GPS bất thường lúc thành công (M10)']),
    signalGpsDuplicate: Boolean(raw.signal_gps_duplicate ?? raw['GPS trùng khớp giữa nhiều đơn (M11)']),
    signalGpsMocked: Boolean(raw.signal_gps_mocked ?? raw['GPS mocked lúc thành công (M12)']),
    // Additional metrics
    driverSuspiciousOrderCount: Number(raw.driver_suspicious_order_count ?? raw.so_don_nghi_van_cua_tai_xe ?? 1),
    successDistanceKm: raw.success_distance_km ?? raw['Khoảng cách GPS lúc thành công (km)'] ?? null,
    syncedAt: raw.synced_at || null
  };
}

/**
 * Stable logical key for matching a source order to separate workflow metadata.
 * The database enforces the same three-part uniqueness constraint.
 */
export function getCodSuspicionCaseKey({ orderCode, driverId, suspicionType }) {
  return JSON.stringify([
    String(orderCode || '').trim(),
    String(driverId || '').trim(),
    String(suspicionType || '').trim()
  ]);
}

/**
 * A processing decision covers every currently screened order of a driver for
 * one suspicion type. It deliberately excludes orderCode.
 */
export function getCodSuspicionDriverKey({ driverId, suspicionType }) {
  return JSON.stringify([
    String(driverId || '').trim(),
    String(suspicionType || '').trim()
  ]);
}

/**
 * Split already-filtered driver groups by persisted driver workflow status.
 */
export function filterDriverGroupsByResolutionStatus(driverGroups = [], status = 'pending') {
  return driverGroups.filter(driver => {
    const resolution = driver.resolution;
    if (status === 'pending') return !resolution;
    if (status === 'resolved') {
      return resolution?.finding_outcome === 'violation';
    }
    if (status === 'non_violation') return resolution?.finding_outcome === 'non_violation';
    return false;
  });
}

/**
 * Group normalized order rows by Driver
 */
export function groupOrdersByDriver(orders = []) {
  const driverMap = new Map();

  orders.forEach((order) => {
    const key = getCodSuspicionDriverKey(order);
    let group = driverMap.get(key);
    if (!group) {
      group = {
      driverId: order.driverId,
      driverName: order.driverName,
      suspicionType: order.suspicionType,
      resolution: order.resolution || null,
        orders: [],
        maxScore: 0,
        totalCod: 0,
        warehouses: new Set(),
        signalSummary: {
          signalReasonConflict: false,
          signalFakeCall: false,
          signalGpsFar: false,
          signalGpsDuplicate: false,
          signalGpsMocked: false
        }
      };
      driverMap.set(key, group);
    }

    group.orders.push(order);
    if (order.totalScore > group.maxScore) {
      group.maxScore = order.totalScore;
    }
    if (typeof order.codAmount === 'number') {
      group.totalCod += order.codAmount;
    }
    if (order.warehouseName) {
      group.warehouses.add(order.warehouseName);
    }

    if (order.signalReasonConflict) group.signalSummary.signalReasonConflict = true;
    if (order.signalFakeCall) group.signalSummary.signalFakeCall = true;
    if (order.signalGpsFar) group.signalSummary.signalGpsFar = true;
    if (order.signalGpsDuplicate) group.signalSummary.signalGpsDuplicate = true;
    if (order.signalGpsMocked) group.signalSummary.signalGpsMocked = true;
  });

  return Array.from(driverMap.values()).map(group => ({
    ...group,
    orderCount: group.orders.length,
    warehouses: Array.from(group.warehouses).sort(),
    // Orders sorted by score descending within driver
    orders: [...group.orders].sort((a, b) => b.totalScore - a.totalScore || b.orderCode.localeCompare(a.orderCode))
  }));
}

/**
 * Sort drivers:
 * 1. Highest suspicious score descending
 * 2. Order count descending
 * 3. Driver ID ascending (stable tie-breaker)
 */
export function sortDrivers(drivers = []) {
  return [...drivers].sort((a, b) => {
    if (b.maxScore !== a.maxScore) {
      return b.maxScore - a.maxScore;
    }
    if (b.orderCount !== a.orderCount) {
      return b.orderCount - a.orderCount;
    }
    return String(a.driverId).localeCompare(String(b.driverId));
  });
}

/**
 * Filter driver groups by suspicion type, warehouse, and search term
 */
export function filterDriverGroups(driverGroups = [], {
  suspicionType = 'ALL',
  warehouse = 'ALL',
  alertLevel = 'ALL',
  searchQuery = ''
} = {}) {
  const cleanSearch = searchQuery.trim().toLowerCase();

  return driverGroups
    .map(driver => {
      // 1. Filter orders of this driver
      const matchingOrders = driver.orders.filter(order => {
        if (suspicionType !== 'ALL' && order.suspicionType !== suspicionType) {
          return false;
        }
        if (warehouse !== 'ALL' && order.warehouseName !== warehouse) {
          return false;
        }
        if (alertLevel !== 'ALL' && getAlertLevel(order.totalScore).value !== alertLevel) {
          return false;
        }
        return true;
      });

      if (matchingOrders.length === 0) return null;

      // 2. Check search query against driver ID, driver Name, or matching order codes
      if (cleanSearch) {
        const matchesDriver =
          driver.driverId.toLowerCase().includes(cleanSearch) ||
          driver.driverName.toLowerCase().includes(cleanSearch);
        const matchesOrder = matchingOrders.some(o => o.orderCode.toLowerCase().includes(cleanSearch));

        if (!matchesDriver && !matchesOrder) {
          return null;
        }
      }

      // Recompute driver stats for the filtered subset of orders
      const maxScore = Math.max(...matchingOrders.map(o => o.totalScore), 0);
      const totalCod = matchingOrders.reduce((sum, o) => sum + (o.codAmount || 0), 0);
      const warehouses = Array.from(new Set(matchingOrders.map(o => o.warehouseName))).sort();

      return {
        ...driver,
        orders: matchingOrders,
        orderCount: matchingOrders.length,
        maxScore,
        totalCod,
        warehouses
      };
    })
    .filter(Boolean);
}

/**
 * Compute KPIs and Triage Chart aggregations from filtered driver groups
 */
export function computeSuspicionKPIs(driverGroups = []) {
  let totalOrders = 0;
  let totalCod = 0;

  const typeCounts = {
    'Gối đầu COD': { orders: 0, drivers: 0 },
    'Rút ruột': { orders: 0, drivers: 0 }
  };

  const warehouseStats = new Map();

  driverGroups.forEach(driver => {
    const driverType = driver.suspicionType;
    if (typeCounts[driverType]) {
      typeCounts[driverType].drivers += 1;
    }

    driver.orders.forEach(order => {
      totalOrders += 1;
      if (typeof order.codAmount === 'number') {
        totalCod += order.codAmount;
      }
      if (typeCounts[order.suspicionType]) {
        typeCounts[order.suspicionType].orders += 1;
      }

      const wh = order.warehouseName || 'Chưa rõ';
      let whData = warehouseStats.get(wh);
      if (!whData) {
        whData = { warehouse: wh, orders: 0, drivers: new Set(), totalCod: 0 };
        warehouseStats.set(wh, whData);
      }
      whData.orders += 1;
      whData.drivers.add(driver.driverId);
      if (typeof order.codAmount === 'number') {
        whData.totalCod += order.codAmount;
      }
    });
  });

  const topWarehouses = Array.from(warehouseStats.values())
    .map(w => ({
      warehouse: w.warehouse,
      orderCount: w.orders,
      driverCount: w.drivers.size,
      totalCod: w.totalCod
    }))
    // Sort before the UI applies its top-five limit. The explicit name
    // tie-breaker makes each rendered bar stable even if snapshot row order
    // changes, so its warehouse label and value remain from the same record.
    .sort((a, b) => (
      b.orderCount - a.orderCount ||
      a.warehouse.localeCompare(b.warehouse, 'vi')
    ))
    .slice(0, 10);

  return {
    totalDrivers: driverGroups.length,
    totalOrders,
    totalCod,
    typeCounts,
    topWarehouses
  };
}

/**
 * Validate that year, month, and day form a genuine Gregorian calendar date (UTC).
 * Guards against non-existent dates such as Feb 31, Apr 31, and Feb 29 in non-leap years.
 */
function isValidCalendarDate(year, month, day) {
  if (
    Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day) ||
    year < 1900 || year > 2100 ||
    month < 1 || month > 12 ||
    day < 1 || day > 31
  ) {
    return false;
  }
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day
  );
}

/**
 * Safely parse date string into standard 'YYYY-MM-DD'
 * Returns null if invalid, missing, or calendar non-existent
 */
export function normalizeDateKey(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Handle ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  const isoPrefix = trimmed.split('T')[0];
  if (isoPrefix.includes('-')) {
    const parts = isoPrefix.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      if (y.length === 4) {
        const year = Number(y);
        const month = Number(m);
        const day = Number(d);
        if (isValidCalendarDate(year, month, day)) {
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    }
  }

  // Handle slash format: DD/MM/YYYY or YYYY/MM/DD
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        // DD/MM/YYYY
        const [d, m, y] = parts;
        const year = Number(y);
        const month = Number(m);
        const day = Number(d);
        if (isValidCalendarDate(year, month, day)) {
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      } else if (parts[0].length === 4) {
        // YYYY/MM/DD
        const [y, m, d] = parts;
        const year = Number(y);
        const month = Number(m);
        const day = Number(d);
        if (isValidCalendarDate(year, month, day)) {
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    }
  }

  return null;
}

/**
 * Aggregate orders by end_delivery_date (endDeliveryDate) for daily column chart:
 * - Chronological order ascending
 * - Deduplicate by orderCode
 * - Ignore empty or invalid dates safely
 * - Return empty array if no valid dates
 */
export function aggregateOrdersByEndDeliveryDate(input = []) {
  if (!Array.isArray(input)) return [];

  // Flatten orders from driver groups or direct order array
  const allOrders = [];
  input.forEach(item => {
    if (item && Array.isArray(item.orders)) {
      allOrders.push(...item.orders);
    } else if (item && (item.orderCode || item.endDeliveryDate)) {
      allOrders.push(item);
    }
  });

  // Deduplicate orders by orderCode to avoid double counting
  const uniqueOrdersByCode = new Map();
  allOrders.forEach(order => {
    const code = String(order.orderCode || order.id || '').trim();
    if (code && !uniqueOrdersByCode.has(code)) {
      uniqueOrdersByCode.set(code, order);
    }
  });

  // Group count by normalized date
  const dateMap = new Map();
  uniqueOrdersByCode.forEach(order => {
    const dateKey = normalizeDateKey(order.endDeliveryDate);
    if (!dateKey) return;

    const currentCount = dateMap.get(dateKey) || 0;
    dateMap.set(dateKey, currentCount + 1);
  });

  // Sort chronological ascending (earliest to latest)
  const sortedDateKeys = Array.from(dateMap.keys()).sort((a, b) => a.localeCompare(b));

  return sortedDateKeys.map(dateKey => {
    const [year, month, day] = dateKey.split('-');
    return {
      date: dateKey,
      dateLabel: `${day}/${month}`,
      fullDateLabel: `${day}/${month}/${year}`,
      cases: dateMap.get(dateKey)
    };
  });
}

