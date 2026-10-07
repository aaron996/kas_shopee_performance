import { lazy } from 'react';
import { ArrowRightLeft, Clock, LayoutDashboard, ChartNoAxesColumnIncreasing, ShieldAlert, Sparkles, Truck } from 'lucide-react';
import { MODULE_IDS } from './moduleIds.js';

// The registry is the single source of truth for a report module's identity,
// navigation placement and lazy surface. Runtime data stays in App because it
// is shared scope, not module-owned state.
export const moduleRegistry = Object.freeze([
  {
    id: 'home', label: 'Tổng quan', mobileLabel: 'Tổng quan', icon: LayoutDashboard, motionIcon: 'LayoutDashboard', description: 'KPI, Hub cần ưu tiên và xu hướng vận hành',
    group: 'overview', navigation: { sidebar: true, commandPalette: true, mobile: true },
    surface: lazy(() => import('./ops-metrics/OperationsOverview.jsx'))
  },
  {
    id: 'report1',
    motionIcon: 'ChartNoAxesColumnIncreasing',
    description: 'Tra cứu chỉ số theo Toàn quốc, Miền, Vùng và Hub',
    label: 'Chi tiết Vùng/Hub',
    mobileLabel: 'Vùng/Hub',
    icon: ChartNoAxesColumnIncreasing,
    group: 'ka-performance-metrics',
    navigation: { sidebar: true, commandPalette: true, mobile: true },
    surface: lazy(() => import('./ops-metrics/Report1MienVungHub.jsx'))
  },
  {
    id: 'report5',
    motionIcon: 'ArrowRightLeft',
    description: 'Ca 1 theo lane vận hành',
    label: '% Ca 1 theo lane',
    mobileLabel: '% Ca 1',
    icon: ArrowRightLeft,
    group: 'ka-performance-metrics',
    navigation: { sidebar: true, commandPalette: true, mobile: true },
    surface: lazy(() => import('../components/Report5LaneCa1.jsx'))
  },
  {
    id: 'report3',
    motionIcon: 'Clock',
    description: 'Leadtime theo từng chặng · Đang phát triển',
    label: 'Leadtime từng chặng',
    mobileLabel: 'Leadtime',
    icon: Clock,
    group: 'ka-performance-metrics',
    navigation: { sidebar: true, commandPalette: true, mobile: true },
    loadingText: 'Đang mở tab Leadtime...',
    overlay: {
      description: 'Dữ liệu đo lường leadtime từng chặng đang được kết nối và kiểm thử độ chính xác theo mạng lưới vận hành mới.'
    },
    surface: lazy(() => import('../components/ReportLeadtime/index.jsx'))
  },
  {
    id: 'report-insight',
    motionIcon: 'Sparkles',
    description: 'Phân tích biến động KPI · Đang phát triển',
    label: 'Insight',
    mobileLabel: 'Insight',
    icon: Sparkles,
    group: 'operation-insights',
    navigation: { sidebar: true, commandPalette: true, mobile: true },
    loadingText: 'Đang mở tab Insight...',
    overlay: {
      description: 'Hệ thống phân tích nguyên nhân biến động KPI và xếp hạng rủi ro trạm đang được kiểm thử thuật toán đối soát.'
    },
    surface: lazy(() => import('../components/ReportInsight.jsx'))
  },
  {
    id: 'cod-suspicion',
    motionIcon: 'ShieldAlert',
    description: 'Kiểm tra đơn COD và trạng thái xử lý',
    label: 'Đơn nghi vấn COD',
    mobileLabel: 'Nghi vấn COD',
    icon: ShieldAlert,
    group: 'operation-insights',
    navigation: { sidebar: true, commandPalette: true, mobile: true },
    loadingText: 'Đang mở tab Đơn nghi vấn COD...',
    keepMounted: true,
    requiresAuth: true,
    surface: lazy(() => import('../components/CodSuspicionReport.jsx'))
  },
  {
    id: 'ranking',
    motionIcon: 'Truck',
    description: 'Xếp hạng hiệu suất vận hành',
    label: 'BXH Performance',
    mobileLabel: 'BXH Xe',
    icon: Truck,
    navigation: { sidebar: true, commandPalette: true, mobile: true },
    loadingText: 'Đang mở BXH Performance...',
    // Temporarily hidden from regular users; re-enable by removing this flag.
    requiresDevAdmin: true,
    surface: lazy(() => import('./performance-ranking/PerformanceRoadRanking.jsx'))
  },
  {
    id: 'dev-admin',
    label: 'Dev',
    keepMounted: true,
    navigation: { sidebar: false, commandPalette: false, mobile: false },
    requiresDevAdmin: true,
    surface: lazy(() => import('../components/DevAdminDashboard.jsx'))
  }
]);

// Fail fast if a persisted module id and its presentation definition diverge.
const registeredModuleIds = new Set(moduleRegistry.map(module => module.id));
if (
  moduleRegistry.length !== MODULE_IDS.length
  || registeredModuleIds.size !== MODULE_IDS.length
  || MODULE_IDS.some(id => !registeredModuleIds.has(id))
) {
  throw new Error('Module registry must define every persisted module id exactly once.');
}

export const getModule = (id) => moduleRegistry.find(module => module.id === id);
export const navigationModules = (surface, currentUser) => moduleRegistry
  .filter(module => module.navigation[surface])
  .filter(module => !module.requiresDevAdmin || currentUser?.isDevAdmin)
  .filter(module => !module.requiresAuth || currentUser);

export const MODULE_GROUP_LABELS = Object.freeze({
  overview: 'Điều hành',
  'ka-performance-metrics': 'KA performance metrics',
  'operation-insights': 'Operation insights'
});
