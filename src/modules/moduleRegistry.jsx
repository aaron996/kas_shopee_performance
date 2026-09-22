import { lazy } from 'react';
import { ArrowRightLeft, Clock, Layers, ShieldAlert, Sparkles, Truck } from 'lucide-react';
import { MODULE_IDS } from './moduleIds.js';

// The registry is the single source of truth for a report module's identity,
// navigation placement and lazy surface. Runtime data stays in App because it
// is shared scope, not module-owned state.
export const moduleRegistry = Object.freeze([
  {
    id: 'report1',
    label: '1. OPS metric',
    mobileLabel: '1. OPS metric',
    icon: Layers,
    navigation: { sidebar: true, commandPalette: true, mobile: true },
    surface: lazy(() => import('./ops-metrics/Report1MienVungHub.jsx'))
  },
  {
    id: 'ranking',
    label: 'BXH Performance',
    mobileLabel: 'BXH Xe',
    icon: Truck,
    navigation: { sidebar: true, commandPalette: true, mobile: true },
    loadingText: 'Đang mở BXH Performance...',
    surface: lazy(() => import('./performance-ranking/PerformanceRoadRanking.jsx'))
  },
  {
    id: 'report5',
    label: '2. % Ca 1 theo lane',
    mobileLabel: '2. % Ca 1',
    icon: ArrowRightLeft,
    navigation: { sidebar: true, commandPalette: true, mobile: true },
    surface: lazy(() => import('../components/Report5LaneCa1.jsx'))
  },
  {
    id: 'report3',
    label: '3. Leadtime từng chặng',
    mobileLabel: '3. Leadtime',
    icon: Clock,
    navigation: { sidebar: true, commandPalette: true, mobile: true },
    loadingText: 'Đang mở tab Leadtime...',
    overlay: {
      description: 'Dữ liệu đo lường leadtime từng chặng đang được kết nối và kiểm thử độ chính xác theo mạng lưới vận hành mới.'
    },
    surface: lazy(() => import('../components/ReportLeadtime/index.jsx'))
  },
  {
    id: 'report-insight',
    label: '4. Insight',
    mobileLabel: '4. Insight',
    icon: Sparkles,
    navigation: { sidebar: true, commandPalette: true, mobile: true },
    loadingText: 'Đang mở tab Insight...',
    overlay: {
      description: 'Hệ thống phân tích nguyên nhân biến động KPI và xếp hạng rủi ro trạm đang được kiểm thử thuật toán đối soát.'
    },
    surface: lazy(() => import('../components/ReportInsight.jsx'))
  },
  {
    id: 'cod-suspicion',
    label: '5. Đơn nghi vấn COD',
    mobileLabel: '5. Nghi vấn COD',
    icon: ShieldAlert,
    navigation: { sidebar: true, commandPalette: true, mobile: true },
    loadingText: 'Đang mở tab Đơn nghi vấn COD...',
    keepMounted: true,
    requiresAuth: true,
    surface: lazy(() => import('../components/CodSuspicionReport.jsx'))
  },
  {
    id: 'dev-admin',
    label: 'Dev Admin',
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
export const navigationModules = (surface) => moduleRegistry.filter(module => module.navigation[surface]);
