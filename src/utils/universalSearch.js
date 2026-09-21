import {
  getCodSuspicionDriverKey,
  groupOrdersByDriver,
  normalizeSuspicionOrder,
  sortDrivers
} from './codSuspicionProcessor.js';

const DIACRITIC_PATTERN = /\p{Diacritic}/gu;

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(DIACRITIC_PATTERN, '')
    .replace(/đ/gi, match => (match === 'Đ' ? 'D' : 'd'))
    .toLowerCase()
    .trim();
}

function scoreMatch(searchText, query) {
  if (!query || !searchText.includes(query)) return -1;
  if (searchText === query) return 0;
  if (searchText.startsWith(query)) return 1;
  const wordIndex = searchText.indexOf(` ${query}`);
  if (wordIndex >= 0) return 2 + wordIndex / 1000;
  return 3 + searchText.indexOf(query) / 1000;
}

export function rankSearchItems(items = [], query = '', limit = 24) {
  const cleanQuery = normalizeSearchText(query);
  if (!cleanQuery) return items.slice(0, limit);

  return items
    .map((item, index) => ({
      item,
      index,
      score: scoreMatch(normalizeSearchText(item.searchText || item.label), cleanQuery)
    }))
    .filter(result => result.score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map(result => result.item);
}

export function buildCodSearchItems(rawRows = []) {
  const normalizedOrders = rawRows.map(normalizeSuspicionOrder);
  const driverGroups = sortDrivers(groupOrdersByDriver(normalizedOrders));

  const driverItems = driverGroups.map(driver => ({
    type: 'cod-driver',
    id: getCodSuspicionDriverKey(driver),
    section: 'Dữ liệu COD',
    label: driver.driverName,
    description: `ID ${driver.driverId} · ${driver.orderCount} đơn · ${driver.suspicionType}`,
    searchText: [
      driver.driverName,
      driver.driverId,
      driver.suspicionType,
      ...driver.warehouses,
      ...driver.orders.map(order => order.orderCode)
    ].join(' '),
    target: {
      driverId: driver.driverId,
      driverName: driver.driverName,
      suspicionType: driver.suspicionType,
      searchQuery: driver.driverId
    }
  }));

  const orderItems = normalizedOrders.map(order => ({
    type: 'cod-order',
    id: `${order.orderCode}:${getCodSuspicionDriverKey(order)}`,
    section: 'Dữ liệu COD',
    label: order.orderCode,
    description: `${order.driverName} · ID ${order.driverId} · ${order.warehouseName}`,
    searchText: [
      order.orderCode,
      order.driverName,
      order.driverId,
      order.warehouseName,
      order.suspicionType
    ].join(' '),
    target: {
      driverId: order.driverId,
      driverName: order.driverName,
      suspicionType: order.suspicionType,
      orderCode: order.orderCode,
      searchQuery: order.orderCode
    }
  }));

  return { driverItems, orderItems };
}
