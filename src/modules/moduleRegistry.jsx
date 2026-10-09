import { lazy } from 'react';
import { ArrowRightLeft, Clock, LayoutDashboard, ChartNoAxesColumnIncreasing, ShieldAlert, Sparkles, Truck } from 'lucide-react';
import { MODULE_IDS } from './moduleIds.js';

// Share the import promise between startup preload and React.lazy.
function startupSurface(loader) {
  let pending;
  const preload = () => (pending ||= loader().catch(error => {
    pending = undefined;
    throw error;
  }));
  const surface = lazy(preload);
  surface.preload = preload;
  return surface;
}

// The registry is the single source of truth for a report module's identity,
// navigation placement and lazy surface. Runtime data stays in App because it
// is shared scope, not module-owned state.
export const moduleRegistry = Object.freeze([
  {
    id: 'home', label: 'Tổng quan', mobileLabel: 'Tổng quan', icon: LayoutDashboard, motionIcon: 'LayoutDashboard', description: 'KPI, Hub cần ưu tiên và xu hướng vận hành',
    group: 'overview', navigation: { sidebar: true, commandPalette: true, mobile: true },
    surface: startupSurface(() => import('./ops-metrics/OperationsOverview.jsx'))
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
    surface: startupSurface(() => import('./ops-metrics/Report1MienVungHub.jsx'))
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
    surface: startupSurface(() => import('../components/Report5LaneCa1.jsx'))
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
    surface: startupSurface(() => import('../components/ReportLeadtime/index.jsx'))
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
    surface: startupSurface(() => import('../components/ReportInsight.jsx'))
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
    surface: startupSurface(() => import('../components/CodSuspicionReport.jsx'))
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
    surface: startupSurface(() => import('./performance-ranking/PerformanceRoadRanking.jsx'))
  },
  {
    id: 'dev-admin',
    label: 'Dev',
    keepMounted: true,
    navigation: { sidebar: false, commandPalette: false, mobile: false },
    requiresDevAdmin: true,
    surface: startupSurface(() => import('../components/DevAdminDashboard.jsx'))
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

export function preloadDashboardModules(currentUser) {
  const allowed = moduleRegistry.filter(module =>
    (!module.requiresDevAdmin || currentUser?.isDevAdmin)
    && (!module.requiresAuth || currentUser));
  const pending = new Map(allowed.map(module => [module.id, module.surface.preload()]));
  // Other chunks start now but never hold the intro open. Failures remain
  // visible through the normal surface error path when the tab is opened.
  void Promise.allSettled([...pending.values()]);
  return Promise.allSettled([pending.get('home'), pending.get('report1')]);
}

export const MODULE_GROUP_LABELS = Object.freeze({
  overview: 'Điều hành',
  'ka-performance-metrics': 'KA performance metrics',
  'operation-insights': 'Operation insights'
});
