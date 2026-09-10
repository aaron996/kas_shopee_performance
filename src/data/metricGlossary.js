import { TARGET_KPIS } from './defaultDataset.js';

export const METRIC_GLOSSARY = Object.freeze({
  p1st: {
    key: 'p1st',
    label: '1st Pickup',
    dataset: 'pick',
    unit: 'percent',
    formula: 'ontime_pu_1st / mau_pu * 100',
    target: TARGET_KPIS['1st Pickup'] ?? 97,
    description: 'Tỷ lệ đơn được lấy đúng hạn ở lần lấy đầu tiên.'
  },
  opr: {
    key: 'opr',
    label: 'OPR',
    dataset: 'pick',
    unit: 'percent',
    formula: 'ontime_pu_opr / mau_pu * 100',
    target: TARGET_KPIS.OPR ?? 90,
    description: 'Tỷ lệ lấy hàng đúng hạn trên tổng mẫu pickup.'
  },
  d1st: {
    key: 'd1st',
    label: '1st Delivery',
    dataset: 'deli',
    unit: 'percent',
    formula: 'ontime_deli_1st / mau_deli * 100',
    target: TARGET_KPIS['1st Deli'] ?? 95,
    description: 'Tỷ lệ đơn giao đúng hạn ở lần giao đầu tiên.'
  },
  odr: {
    key: 'odr',
    label: 'ODR',
    dataset: 'deli',
    unit: 'percent',
    formula: 'ontime_deli_odr / mau_deli * 100',
    target: TARGET_KPIS.ODR ?? 90,
    description: 'Tỷ lệ giao hàng đúng hạn trên tổng mẫu delivery.'
  },
  ca1: {
    key: 'ca1',
    label: '% Ca 1',
    dataset: 'ca1',
    unit: 'percent',
    formula: 'don_hub_giao_ca1 / tong_don * 100',
    target: null,
    description: 'Tỷ lệ đơn về hub giao trong ca 1. Nguồn hiện không tách theo client.'
  },
  leadtime: {
    key: 'leadtime',
    label: 'Leadtime từng chặng',
    dataset: 'leadtime',
    unit: 'hour',
    formula: 'sum(stage_hours * mau) / sum(mau), loại NULL riêng cho từng chặng',
    target: null,
    description: 'Leadtime trung bình có trọng số theo mẫu cho Pre-pickup, First mile, Middle mile, Last mile và E2E.'
  },
  fd: {
    key: 'fd',
    label: 'FD',
    dataset: 'fd',
    unit: 'percent',
    formula: 'fd_hoan_thanh / mau_fd * 100',
    target: null,
    description: 'Tỷ lệ hoàn thành FD trên tổng mẫu FD.'
  }
});

export function getMetricDefinition(metric) {
  return METRIC_GLOSSARY[metric] ?? null;
}
