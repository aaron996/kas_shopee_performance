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
 * Group normalized order rows by Driver
 */
export function groupOrdersByDriver(orders = []) {
  const driverMap = new Map();

  orders.forEach((order) => {
    const key = order.driverId || 'UNKNOWN';
    let group = driverMap.get(key);
    if (!group) {
      group = {
        driverId: order.driverId,
        driverName: order.driverName,
        suspicionType: order.suspicionType,
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
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 10);

  return {
    totalDrivers: driverGroups.length,
    totalOrders,
    totalCod,
    typeCounts,
    topWarehouses
  };
}
