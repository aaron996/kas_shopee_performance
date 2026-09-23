import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ShieldAlert,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Pencil,
  RotateCcw,
  Trash2,
  ImagePlus,
  X,
  MessageSquare,
  LoaderCircle,
  Search,
  Info,
  Play
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';
import {
  formatCurrencyVND,
  formatDateVN,
  formatDateTimeVN,
  normalizeSuspicionOrder,
  groupOrdersByDriver,
  sortDrivers,
  filterDriverGroups,
  filterDriverGroupsByResolutionStatus,
  buildCodSmsAssessmentMap,
  addSmsSummaryToDriverGroups,
  getCodSuspicionDriverKey,
  computeSuspicionKPIs,
  getAlertLevel,
  getOrderEffectiveAlertLevel,
  aggregateOrdersByEndDeliveryDate,
  getCodSmsCaseKey,
  getSmsScoreBadge,
  summarizeCodSmsAssessments,
  getDriverSmsLabel,
  formatSmsConfidence,
  SMS_PATTERN_LABELS
} from '../utils/codSuspicionProcessor';
import {
  fetchCodSuspicionData,
  fetchCodSuspicionCaseResolutions,
  saveCodSuspicionDriverResolution,
  undoCodSuspicionDriverResolution,
  uploadCodResolutionEvidence,
  removeCodResolutionEvidence,
  fetchCodSmsAssessmentsSummary,
  fetchCodSmsAssessmentEvidenceCached,
  getCachedCodSmsEvidence,
  invalidateCodSmsEvidenceCache,
  runCodSmsAssessmentBatch
} from '../utils/codSuspicionClient';
import LoadingScreen from './LoadingScreen';
import ModalDialog from './ui/ModalDialog';
import { fetchCodSmsThreshold } from '../utils/codSmsThresholdClient';
import CodSmsRunHistoryPanel from './CodSmsRunHistoryPanel';

const TYPE_COLORS = {
  'Gối đầu COD': 'var(--ghn-orange, #f26522)',
  'Rút ruột': '#8b5cf6'
};

const CONTACT_CHANNELS = [
  ['telegram', 'Telegram'],
  ['gtalk', 'Gtalk'],
  ['email', 'Email'],
  ['verbal', 'Trao đổi miệng'],
  ['other', 'Khác']
];

const USER_RESOLUTION_TABS = [
  { id: 'pending', label: 'Cần xác minh' },
  { id: 'resolved', label: 'Đã xử lý' }
];

const DEV_ONLY_RESOLUTION_TAB = { id: 'non_violation', label: 'Không vi phạm' };

const SMS_OVERVIEW_BUCKETS = [
  { key: 'flagged', label: 'có điểm SMS > 0', level: 'high' },
  { key: 'zero', label: 'điểm 0 / không bằng chứng', level: 'no_evidence' },
  { key: 'failed', label: 'lỗi chấm', level: 'failed' },
  { key: 'unscored', label: 'chưa chấm', level: 'unscored' }
];

function getResolutionLabel(resolution) {
  if (resolution?.finding_outcome === 'non_violation') return 'Không vi phạm';
  return resolution?.enforcement_status === 'disciplinary_action' ? 'Đã xử lý theo chế tài' : 'Đang xử lý';
}

export default function CodSuspicionReport({
  active = true,
  filters,
  onAvailableWarehouses,
  canManageResolutions = false,
  isDevAdmin = false,
  userEmail = '',
  dataEnabled = true,
  focusTarget = null,
  onFocusTargetHandled,
  onClearSearch
}) {
  const [rawData, setRawData] = useState([]);
  const [resolutions, setResolutions] = useState(() => new Map());
  const [smsAssessments, setSmsAssessments] = useState(() => new Map());
  const [smsThreshold, setSmsThreshold] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSmsLoading, setIsSmsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [resolutionError, setResolutionError] = useState('');
  const [smsError, setSmsError] = useState('');
  const [smsAssessmentsFailed, setSmsAssessmentsFailed] = useState(false);
  const [activeResolutionTab, setActiveResolutionTab] = useState('pending');
  const [resolvingDriverKeys, setResolvingDriverKeys] = useState(() => new Set());
  const [workflowDialog, setWorkflowDialog] = useState(null);
  const [workflowForm, setWorkflowForm] = useState({ findingOutcome: 'violation', enforcementStatus: 'in_progress', contactChannel: 'telegram', note: '', attachments: [], removedAttachments: [], newFiles: [] });
  const [smsDetailModal, setSmsDetailModal] = useState(null);
  const [evidenceState, setEvidenceState] = useState({ isLoading: false, error: null, evidence: null });
  const activeSmsRequestRef = useRef(null);
  const [manualRunDialogOpen, setManualRunDialogOpen] = useState(false);
  const [manualRunState, setManualRunState] = useState({ isRunning: false, error: null, result: null, aborted: false });
  const [manualRunProgress, setManualRunProgress] = useState(null);
  const [manualRunMode, setManualRunMode] = useState('all'); // 'all' | 'cases'
  const [manualRunSearch, setManualRunSearch] = useState('');
  const [manualRunSelectedKeys, setManualRunSelectedKeys] = useState(() => new Map());
  const manualRunAbortRef = useRef(null);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [smsOverviewBucket, setSmsOverviewBucket] = useState(null);
  const [smsRunsRefreshKey, setSmsRunsRefreshKey] = useState(0);
  const fileInputRef = useRef(null);
  const driverCardRefs = useRef(new Map());

  const { suspicionType = 'ALL', warehouse = 'ALL', alertLevel = 'ALL', searchQuery = '' } = filters || {};

  // Accordion expanded state: Set of driverId
  const [expandedDrivers, setExpandedDrivers] = useState(new Set());

  // Mobile responsive detection (breakpoint 768px)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    return () => {
      activeSmsRequestRef.current?.controller?.abort();
    };
  }, []);

  // Fetch data
  const loadData = useCallback(async ({ forceRefresh = false } = {}) => {
    if (!dataEnabled) {
      setRawData([]);
      setResolutions(new Map());
      setSmsAssessments(new Map());
      setSmsThreshold(null);
      setErrorMsg('');
      setResolutionError('');
      setSmsError('');
      setSmsAssessmentsFailed(false);
      setIsLoading(false);
      setIsSmsLoading(false);
      setHasLoaded(true);
      return;
    }
    if (forceRefresh) {
      invalidateCodSmsEvidenceCache();
    }
    setIsLoading(true);
    setIsSmsLoading(true);
    setErrorMsg('');
    setSmsError('');
    setSmsAssessmentsFailed(false);
    setSmsThreshold(null);
    try {
      const [sourceResult, resolutionResult, smsResult, thresholdResult] = await Promise.all([
        fetchCodSuspicionData({ forceRefresh }),
        fetchCodSuspicionCaseResolutions(),
        fetchCodSmsAssessmentsSummary({ limit: 500 }),
        fetchCodSmsThreshold().then(value => ({ success: true, value }), () => ({ success: false }))
      ]);
      const smsLoadErrors = [];
      if (thresholdResult.success && Number.isInteger(thresholdResult.value.threshold)
        && thresholdResult.value.threshold >= 1 && thresholdResult.value.threshold <= 9) {
        setSmsThreshold(thresholdResult.value.threshold);
      } else {
        smsLoadErrors.push('Không thể tải mốc điểm SMS đang áp dụng; tạm hiển thị mức theo SQL.');
      }
      if (sourceResult.success) {
        setRawData(sourceResult.rows || []);
        setResolutions(new Map(
          (resolutionResult.rows || []).map(row => [
            getCodSuspicionDriverKey({
              driverId: row.driver_id,
              suspicionType: row.suspicion_type
            }),
            row
          ])
        ));
        if (!resolutionResult.success) {
          setResolutionError('Không thể tải trạng thái xử lý. Vui lòng thử lại trước khi thao tác.');
        }
      } else {
        setErrorMsg('Không thể tải dữ liệu đơn nghi vấn. Vui lòng thử lại hoặc báo Dev Admin kiểm tra nguồn dữ liệu.');
      }

      if (smsResult.success) {
        setSmsAssessments(buildCodSmsAssessmentMap(smsResult.assessments));
      } else {
        setSmsAssessments(new Map());
        setSmsAssessmentsFailed(true);
        smsLoadErrors.push('Không thể tải đầy đủ đánh giá SMS; mức đang hiển thị chỉ dựa trên điểm SQL, chưa phải kết luận SMS.');
      }
      if (smsLoadErrors.length) setSmsError(`${smsLoadErrors.join(' ')} Vui lòng tải lại.`);
    } catch (err) {
      console.error('Error in CodSuspicionReport loadData:', err);
      setSmsAssessments(new Map());
      setSmsAssessmentsFailed(true);
      setSmsThreshold(null);
      setSmsError('Không thể tải đầy đủ đánh giá SMS và mốc áp dụng; tạm hiển thị mức theo SQL. Vui lòng tải lại.');
      setErrorMsg('Đã xảy ra lỗi khi kết nối Supabase. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
      setIsSmsLoading(false);
      setHasLoaded(true);
    }
  }, [dataEnabled]);

  const loadEvidenceForModal = useCallback(async (order, { forceRefresh = false } = {}) => {
    if (!isDevAdmin || !order) return;
    const caseKey = getCodSmsCaseKey(order);

    // Cancel previous in-flight fetch to prevent race condition
    if (activeSmsRequestRef.current?.controller) {
      activeSmsRequestRef.current.controller.abort();
    }

    const controller = new AbortController();
    activeSmsRequestRef.current = { caseKey, controller };

    // Synchronous cache hit check
    if (!forceRefresh) {
      const cached = getCachedCodSmsEvidence({
        suspicionType: order.suspicionType,
        driverId: order.driverId,
        orderCode: order.orderCode,
        userEmail,
        isDevAdmin
      });
      if (cached?.assessment) {
        setEvidenceState({
          isLoading: false,
          error: null,
          evidence: Array.isArray(cached.assessment.evidence) ? cached.assessment.evidence : []
        });
        return;
      }
    }

    setEvidenceState({ isLoading: true, error: null, evidence: null });

    try {
      const result = await fetchCodSmsAssessmentEvidenceCached({
        suspicionType: order.suspicionType,
        driverId: order.driverId,
        orderCode: order.orderCode,
        userEmail,
        isDevAdmin,
        forceRefresh,
        signal: controller.signal
      });

      // Ignore if user navigated away or opened a different SMS
      if (activeSmsRequestRef.current?.caseKey !== caseKey) {
        return;
      }
      if (result.aborted) {
        return;
      }

      if (result.success && result.assessment) {
        setEvidenceState({
          isLoading: false,
          error: null,
          evidence: Array.isArray(result.assessment.evidence) ? result.assessment.evidence : []
        });
      } else {
        setEvidenceState({
          isLoading: false,
          error: result.error || 'Không thể tải bằng chứng SMS nguyên văn.',
          evidence: null
        });
      }
    } catch (err) {
      if (activeSmsRequestRef.current?.caseKey !== caseKey || err.name === 'AbortError') {
        return;
      }
      console.error('Failed to load SMS evidence:', err);
      setEvidenceState({
        isLoading: false,
        error: 'Lỗi mạng khi tải bằng chứng SMS.',
        evidence: null
      });
    }
  }, [isDevAdmin, userEmail]);

  const openSmsModal = useCallback((order, assessment) => {
    setSmsDetailModal({ order, assessment });
    if (isDevAdmin && assessment && (assessment.status === 'scored' || assessment.evidenceRestricted)) {
      const cached = getCachedCodSmsEvidence({
        suspicionType: order.suspicionType,
        driverId: order.driverId,
        orderCode: order.orderCode,
        userEmail,
        isDevAdmin
      });
      if (cached?.assessment) {
        if (activeSmsRequestRef.current?.controller) {
          activeSmsRequestRef.current.controller.abort();
        }
        activeSmsRequestRef.current = { caseKey: getCodSmsCaseKey(order), controller: null };
        setEvidenceState({
          isLoading: false,
          error: null,
          evidence: Array.isArray(cached.assessment.evidence) ? cached.assessment.evidence : []
        });
      } else {
        loadEvidenceForModal(order);
      }
    } else {
      if (activeSmsRequestRef.current?.controller) {
        activeSmsRequestRef.current.controller.abort();
      }
      activeSmsRequestRef.current = null;
      setEvidenceState({ isLoading: false, error: null, evidence: null });
    }
  }, [isDevAdmin, userEmail, loadEvidenceForModal]);

  const closeSmsModal = useCallback(() => {
    if (activeSmsRequestRef.current?.controller) {
      activeSmsRequestRef.current.controller.abort();
    }
    activeSmsRequestRef.current = null;
    setSmsDetailModal(null);
  }, []);

  const handleRunManualBatch = useCallback(async () => {
    const cases = manualRunMode === 'cases'
      ? [...manualRunSelectedKeys.values()].map(({ suspicionType, driverId, orderCode }) => ({ suspicionType, driverId, orderCode }))
      : [];
    if (manualRunMode === 'cases' && cases.length === 0) return;

    setManualRunState({ isRunning: true, error: null, result: null, aborted: false });
    setManualRunProgress(null);
    const controller = new AbortController();
    manualRunAbortRef.current = controller;

    const result = await runCodSmsAssessmentBatch({
      mode: manualRunMode,
      cases,
      signal: controller.signal,
      onProgress: update => setManualRunProgress(update)
    });
    manualRunAbortRef.current = null;
    setSmsRunsRefreshKey(key => key + 1);

    if (!result.success) {
      setManualRunState(result.aborted
        ? { isRunning: false, error: null, result: null, aborted: true }
        : { isRunning: false, error: result.error || 'Không thể chạy chấm điểm SMS.', result: null, aborted: false });
      if (result.aborted) await loadData({ forceRefresh: true });
      return;
    }
    setManualRunState({ isRunning: false, error: null, result: result.batch, aborted: false });
    await loadData({ forceRefresh: true });
  }, [loadData, manualRunMode, manualRunSelectedKeys]);

  const handleStopManualBatch = useCallback(() => {
    manualRunAbortRef.current?.abort();
  }, []);

  const closeManualRunDialog = useCallback(() => {
    if (manualRunState.isRunning) return;
    setManualRunDialogOpen(false);
    setManualRunState({ isRunning: false, error: null, result: null, aborted: false });
    setManualRunProgress(null);
    setManualRunMode('all');
    setManualRunSearch('');
    setManualRunSelectedKeys(new Map());
  }, [manualRunState.isRunning]);

  useEffect(() => {
    if (active) loadData();
  }, [active, loadData]);

  // Normalize all rows
  const normalizedOrders = useMemo(() => rawData.map(raw => {
    const order = normalizeSuspicionOrder(raw);
    return {
      ...order,
      resolution: resolutions.get(getCodSuspicionDriverKey(order)) || null
    };
  }), [rawData, resolutions]);

  const driverNameById = useMemo(() => {
    const names = new Map();
    for (const order of normalizedOrders) {
      if (order.driverId && order.driverNameRaw && !names.has(order.driverId)) {
        names.set(order.driverId, order.driverNameRaw);
      }
    }
    return names;
  }, [normalizedOrders]);

  // Order picker (manual SMS run, mode='cases'): filters the already-loaded
  // orders client-side, no extra API call needed.
  const manualRunSearchResults = useMemo(() => {
    const term = manualRunSearch.trim().toLowerCase();
    if (!term) return [];
    return normalizedOrders
      .filter(order => order.orderCode.toLowerCase().includes(term)
        || order.driverId.toLowerCase().includes(term)
        || order.driverName.toLowerCase().includes(term))
      .slice(0, 50);
  }, [normalizedOrders, manualRunSearch]);

  // Group all rows by driver and sort default. A resolution can outlive its
  // source orders — the daily KAS-221 sync fully replaces `kas_cod_suspicion_data`,
  // so a driver who dropped out of today's flagged list still needs to show up
  // wherever its saved resolution belongs (usually the "Đã xử lý" tab) instead
  // of silently vanishing.
  const allDriverGroups = useMemo(() => {
    const grouped = groupOrdersByDriver(normalizedOrders);
    const groupedKeys = new Set(grouped.map(getCodSuspicionDriverKey));
    const orphanGroups = [];
    resolutions.forEach((resolution, key) => {
      if (groupedKeys.has(key)) return;
      orphanGroups.push({
        driverId: resolution.driver_id,
        driverName: `Tài xế ${resolution.driver_id}`,
        suspicionType: resolution.suspicion_type,
        resolution,
        isOrphan: true,
        orders: [],
        orderCount: 0,
        maxScore: 0,
        totalCod: 0,
        warehouses: [],
        signalSummary: {
          signalReasonConflict: false,
          signalFakeCall: false,
          signalGpsFar: false,
          signalGpsDuplicate: false,
          signalGpsMocked: false
        }
      });
    });
    return sortDrivers([...grouped, ...orphanGroups]);
  }, [normalizedOrders, resolutions]);

  // Extract all available warehouses for the filter dropdown
  const availableWarehouses = useMemo(() => {
    const set = new Set();
    normalizedOrders.forEach(o => {
      if (o.warehouseName && o.warehouseName !== 'Chưa rõ kho') {
        set.add(o.warehouseName);
      }
    });
    return Array.from(set).sort();
  }, [normalizedOrders]);

  useEffect(() => {
    onAvailableWarehouses?.(availableWarehouses);
  }, [availableWarehouses, onAvailableWarehouses]);

  // Filtered driver groups
  const filteredDrivers = useMemo(() => {
    const filteredGroups = filterDriverGroups(allDriverGroups, {
      suspicionType,
      warehouse,
      alertLevel,
      searchQuery,
      assessmentsByCaseKey: smsAssessments,
      threshold: smsThreshold,
      useEffectiveAlertLevel: !isDevAdmin && smsThreshold !== null
    });
    return addSmsSummaryToDriverGroups(filteredGroups, smsAssessments, { threshold: smsThreshold });
  }, [allDriverGroups, suspicionType, warehouse, alertLevel, searchQuery, smsAssessments, smsThreshold, isDevAdmin]);

  const smsOverview = useMemo(
    () => summarizeCodSmsAssessments(normalizedOrders, smsAssessments),
    [normalizedOrders, smsAssessments]
  );

  const resolutionCounts = useMemo(() => {
    const driverIdsByStatus = {
      pending: new Set(),
      resolved: new Set(),
      non_violation: new Set()
    };
    filteredDrivers.forEach(driver => {
      const driverKey = driver.driverId || driver.driverName;
      if (!driver.resolution) driverIdsByStatus.pending.add(driverKey);
      else if (driver.resolution.finding_outcome === 'non_violation') driverIdsByStatus.non_violation.add(driverKey);
      else driverIdsByStatus.resolved.add(driverKey);
    });
    return Object.fromEntries(
      Object.entries(driverIdsByStatus).map(([status, driverIds]) => [status, driverIds.size])
    );
  }, [filteredDrivers]);

  const totalDriverCaseCount = useMemo(
    () => new Set(filteredDrivers.map(driver => driver.driverId || driver.driverName)).size,
    [filteredDrivers]
  );

  const visibleDrivers = useMemo(
    () => filterDriverGroupsByResolutionStatus(filteredDrivers, activeResolutionTab),
    [filteredDrivers, activeResolutionTab]
  );

  const resolutionTabs = useMemo(
    () => canManageResolutions ? [...USER_RESOLUTION_TABS, DEV_ONLY_RESOLUTION_TAB] : USER_RESOLUTION_TABS,
    [canManageResolutions]
  );

  useEffect(() => {
    if (!canManageResolutions && activeResolutionTab === 'non_violation') {
      setActiveResolutionTab('pending');
    }
  }, [activeResolutionTab, canManageResolutions]);

  useEffect(() => {
    if (!focusTarget || isLoading) return;
    const targetDriver = filteredDrivers.find(driver => (
      driver.driverId === focusTarget.driverId &&
      driver.suspicionType === focusTarget.suspicionType
    ));
    if (!targetDriver) return;

    const nextTab = !targetDriver.resolution
      ? 'pending'
      : targetDriver.resolution.finding_outcome === 'non_violation'
        ? 'non_violation'
        : 'resolved';
    if (nextTab !== 'non_violation' || canManageResolutions) {
      setActiveResolutionTab(nextTab);
    }
  }, [canManageResolutions, filteredDrivers, focusTarget, isLoading]);

  useEffect(() => {
    if (!focusTarget || isLoading) return undefined;
    const targetDriver = visibleDrivers.find(driver => (
      driver.driverId === focusTarget.driverId &&
      driver.suspicionType === focusTarget.suspicionType
    ));
    if (!targetDriver) return undefined;

    const driverKey = getCodSuspicionDriverKey(targetDriver);
    const accordionKey = `${activeResolutionTab}:${driverKey}`;
    setExpandedDrivers(previous => new Set(previous).add(accordionKey));

    const frameId = requestAnimationFrame(() => {
      driverCardRefs.current.get(driverKey)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onFocusTargetHandled?.();
    });
    return () => cancelAnimationFrame(frameId);
  }, [activeResolutionTab, focusTarget, isLoading, onFocusTargetHandled, visibleDrivers]);

  // Compute KPIs & Triage Chart stats
  const kpis = useMemo(() => {
    return computeSuspicionKPIs(filteredDrivers);
  }, [filteredDrivers]);

  // Accordion toggle handler for individual driver
  const handleToggleExpandDriver = (driverId) => {
    setExpandedDrivers(prev => {
      const next = new Set(prev);
      if (next.has(driverId)) {
        next.delete(driverId);
      } else {
        next.add(driverId);
      }
      return next;
    });
  };

  const openWorkflowDialog = (driver) => {
    if (!canManageResolutions) return;
    const existing = driver.resolution || null;
    setWorkflowDialog(driver);
    setWorkflowForm({
      findingOutcome: existing?.finding_outcome || 'violation',
      enforcementStatus: existing?.enforcement_status || 'in_progress',
      contactChannel: existing?.contact_channel || 'telegram',
      note: existing?.note || '',
      attachments: Array.isArray(existing?.attachments) ? existing.attachments : [],
      removedAttachments: [],
      newFiles: []
    });
  };

  const addEvidenceFiles = (files) => {
    const accepted = Array.from(files || []).filter(file => (
      ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 5 * 1024 * 1024
    ));
    if (accepted.length !== Array.from(files || []).length) {
      setResolutionError('Chỉ nhận ảnh JPG, PNG hoặc WEBP tối đa 5 MB.');
    }
    setWorkflowForm(previous => ({ ...previous, newFiles: [...previous.newFiles, ...accepted].slice(0, 5) }));
  };

  const handleSaveDriverResolution = async () => {
    if (!workflowDialog || !workflowForm.contactChannel) return;
    const driverKey = getCodSuspicionDriverKey(workflowDialog);
    setResolutionError('');
    setResolvingDriverKeys(previous => new Set(previous).add(driverKey));

    const uploadedPaths = [];
    for (const file of workflowForm.newFiles) {
      const upload = await uploadCodResolutionEvidence(workflowDialog.driverId, file);
      if (!upload.success) {
        await removeCodResolutionEvidence(uploadedPaths);
        setResolutionError('Không thể tải ảnh minh chứng. Trạng thái xử lý chưa được lưu.');
        setResolvingDriverKeys(previous => { const next = new Set(previous); next.delete(driverKey); return next; });
        return;
      }
      uploadedPaths.push(upload.path);
    }

    const attachments = [...workflowForm.attachments, ...uploadedPaths];
    const result = await saveCodSuspicionDriverResolution({
      driverId: workflowDialog.driverId,
      suspicionType: workflowDialog.suspicionType,
      contactChannel: workflowForm.contactChannel,
      note: workflowForm.note,
      attachments,
      findingOutcome: workflowForm.findingOutcome,
      enforcementStatus: workflowForm.findingOutcome === 'violation' ? workflowForm.enforcementStatus : null
    });
    setResolvingDriverKeys(previous => { const next = new Set(previous); next.delete(driverKey); return next; });

    if (!result.success) {
      await removeCodResolutionEvidence(uploadedPaths);
      setResolutionError('Không thể lưu trạng thái xử lý. Tài xế vẫn ở Cần xác minh; vui lòng thử lại.');
      return;
    }

    await removeCodResolutionEvidence(workflowForm.removedAttachments);
    setResolutions(previous => new Map(previous).set(driverKey, result.row));
    setWorkflowDialog(null);
  };

  const handleUndoDriverResolution = async (driver) => {
    const driverKey = getCodSuspicionDriverKey(driver);
    if (resolvingDriverKeys.has(driverKey)) return;
    setResolutionError('');
    setResolvingDriverKeys(previous => new Set(previous).add(driverKey));
    const result = await undoCodSuspicionDriverResolution(driver);
    setResolvingDriverKeys(previous => { const next = new Set(previous); next.delete(driverKey); return next; });
    if (!result.success) {
      setResolutionError('Không thể hoàn tác trạng thái xử lý. Vui lòng thử lại.');
      return;
    }
    const attachments = driver.resolution?.attachments || [];
    await removeCodResolutionEvidence(attachments);
    setResolutions(previous => { const next = new Map(previous); next.delete(driverKey); return next; });
  };

  // Chart data: Daily case distribution by endDeliveryDate (chronological, deduped orderCode)
  const dailyCaseChartData = useMemo(() => {
    return aggregateOrdersByEndDeliveryDate(filteredDrivers);
  }, [filteredDrivers]);

  return (
    <div className="report-container cod-suspicion-page">
      
      {/* 1. Header Banner & KPIs: Snapshot Ledger (A3) */}
      <div className="cod-snapshot-ledger">
        {/* Top Ledger Header */}
        <div className="cod-ledger-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                padding: '0.6rem',
                background: 'var(--ghn-orange-light, #fef0eb)',
                color: 'var(--ghn-orange, #f15a22)',
                borderRadius: 'var(--radius-control, 10px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <ShieldAlert size={24} />
            </div>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: isMobile ? '1.15rem' : '1.25rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-heading, "Outfit", sans-serif)',
                  color: 'var(--text-main, #0f172a)',
                  letterSpacing: '-0.01em'
                }}
              >
                ĐƠN NGHI VẤN COD
              </h1>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted, #64748b)' }}>
                Danh sách tài xế và đơn hàng cần rà soát liên quan đến nghi ngờ hành vi ôm COD
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Ledger Metrics */}
        <div className="cod-ledger-metrics">
          <div className="cod-ledger-metric-item cod-ledger-metric-item--drivers">
            <div className="cod-ledger-metric-label">
              TÀI XẾ CẦN XÁC MINH
            </div>
            <div className="cod-ledger-metric-val">
              {kpis.totalDrivers.toLocaleString('vi-VN')}
            </div>
            <div className="cod-ledger-metric-note">
              Đối tượng trực tiếp cần phân công nhân sự rà soát
            </div>
          </div>

          <div className="cod-ledger-metric-item cod-ledger-metric-item--orders">
            <div className="cod-ledger-metric-label">
              TỔNG ĐƠN NGHI VẤN
            </div>
            <div className="cod-ledger-metric-val">
              {kpis.totalOrders.toLocaleString('vi-VN')}
            </div>
            <div className="cod-ledger-metric-note">
              Toàn bộ đơn phát sinh tín hiệu sau bộ lọc
            </div>
          </div>

          <div className="cod-ledger-metric-item cod-ledger-metric-item--cod">
            <div className="cod-ledger-metric-label">
              TỔNG TIỀN COD LIÊN QUAN
            </div>
            <div className="cod-ledger-metric-val">
              {formatCurrencyVND(kpis.totalCod)}
            </div>
            <div className="cod-ledger-metric-note">
              Tiền thu hộ cần đối chiếu xác thực kho & khách
            </div>
          </div>
        </div>
      </div>

      {/* 2. Error Message Notice */}
      {errorMsg && (
        <div
          style={{
            padding: '1rem 1.25rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-control, 10px)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.5rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={20} />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            className="nav-btn-sleek"
            onClick={() => loadData({ forceRefresh: true })}
            style={{ borderColor: 'currentColor', color: '#ef4444' }}
          >
            Thử lại
          </button>
        </div>
      )}

      {/* 3. Paired Investigation Charts (B1) */}
      <div className="cod-charts-grid">
        {/* Chart 1: Số đơn nghi ngờ theo ngày */}
        <div className="cod-chart-card cod-chart-card--daily">
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-heading, "Outfit", sans-serif)',
                  color: 'var(--text-main, #0f172a)'
                }}
              >
                SỐ ĐƠN NGHI NGỜ THEO NGÀY
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', fontFamily: 'var(--font-mono, monospace)' }}>
                Đơn vị: Đơn
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted, #64748b)', marginTop: '0.25rem' }}>
              Theo Ngày kết thúc giao · mỗi mã đơn được tính một lần
            </div>
          </div>

          {dailyCaseChartData.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                color: 'var(--text-muted, #64748b)',
                padding: '2.5rem 1rem'
              }}
            >
              <AlertTriangle size={24} style={{ opacity: 0.5, marginBottom: '0.5rem' }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                Không có đơn có "Ngày kết thúc giao" hợp lệ trong phạm vi lọc.
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: isMobile ? '200px' : '230px', width: '100%' }}>
              <ResponsiveContainer width="100%" height={isMobile ? 220 : 250}>
                <BarChart data={dailyCaseChartData} margin={{ top: 30, right: isMobile ? 8 : 15, left: isMobile ? -24 : -15, bottom: 5 }}>
                  <XAxis
                    dataKey="dateLabel"
                    stroke="var(--text-muted, #64748b)"
                    fontSize={isMobile ? 10 : 11}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={isMobile ? 12 : 8}
                  />
                  <YAxis
                    stroke="var(--text-muted, #64748b)"
                    fontSize={isMobile ? 10 : 11}
                    allowDecimals={false}
                    domain={[0, 'auto']}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-subtle, #f2f7fd)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div
                            style={{
                              background: 'var(--color-slate-950, #0f172a)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              padding: '0.6rem 0.85rem',
                              borderRadius: 'var(--radius-control, 10px)',
                              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                              fontSize: '0.8rem',
                              color: 'var(--color-white, #ffffff)'
                            }}
                          >
                            <div style={{ fontWeight: 600, color: 'var(--color-slate-300, #cbd5e1)', marginBottom: '0.25rem' }}>
                              Ngày {data.fullDateLabel}
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--action-primary, #0ea5c4)' }}>
                              {data.cases} đơn nghi ngờ
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="cases"
                    name="Số đơn nghi ngờ"
                    fill="var(--action-primary, #0ea5c4)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={isMobile ? 32 : 48}
                  >
                    <LabelList
                      dataKey="cases"
                      position="top"
                      fill="var(--text-main, #0f172a)"
                      fontSize={isMobile ? 10 : 11}
                      fontWeight={700}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 2: Top kho giao có đơn nghi vấn */}
        <div className="cod-chart-card cod-chart-card--warehouses">
          <div style={{ marginBottom: '1rem' }}>
            <h2
              style={{
                margin: 0,
                fontSize: '0.92rem',
                fontWeight: 700,
                fontFamily: 'var(--font-heading, "Outfit", sans-serif)',
                color: 'var(--text-main, #0f172a)'
              }}
            >
              TOP KHO GIAO CÓ ĐƠN NGHI VẤN
            </h2>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted, #64748b)', marginTop: '0.25rem' }}>
              Xếp hạng theo số đơn nghi vấn (mẫu số: số tài xế liên quan)
            </div>
          </div>

          {kpis.topWarehouses.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                color: 'var(--text-muted, #64748b)',
                padding: '2.5rem 1rem'
              }}
            >
              <AlertTriangle size={24} style={{ opacity: 0.5, marginBottom: '0.5rem' }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                Không có dữ liệu kho giao trong phạm vi lọc.
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: isMobile ? '200px' : '230px', width: '100%' }}>
              <ResponsiveContainer width="100%" height={isMobile ? 220 : 250}>
                <BarChart
                  data={kpis.topWarehouses.slice(0, 5)}
                  layout="vertical"
                  margin={{ top: 10, right: isMobile ? 38 : 46, left: isMobile ? -10 : 10, bottom: 5 }}
                >
                  <YAxis
                    type="category"
                    dataKey="warehouse"
                    stroke="var(--text-muted, #64748b)"
                    fontSize={isMobile ? 10 : 11}
                    width={isMobile ? 85 : 120}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => val.replace(/^Kho\s+/i, '').slice(0, isMobile ? 11 : 20)}
                  />
                  <XAxis
                    type="number"
                    dataKey="orderCount"
                    domain={[0, 'dataMax']}
                    hide
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-subtle, #f2f7fd)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div
                            style={{
                              background: 'var(--color-slate-950, #0f172a)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              padding: '0.6rem 0.85rem',
                              borderRadius: 'var(--radius-control, 10px)',
                              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                              fontSize: '0.8rem',
                              color: 'var(--color-white, #ffffff)'
                            }}
                          >
                            <div style={{ fontWeight: 700, marginBottom: '0.3rem', color: 'var(--color-slate-50, #f8fafc)' }}>{data.warehouse}</div>
                            <div style={{ color: 'var(--color-slate-300, #cbd5e1)' }}>Số đơn nghi vấn: <strong style={{ color: 'var(--color-white, #ffffff)' }}>{data.orderCount}</strong> đơn</div>
                            <div style={{ color: 'var(--color-slate-300, #cbd5e1)' }}>Số tài xế liên quan: <strong style={{ color: 'var(--color-white, #ffffff)' }}>{data.driverCount}</strong> tài xế</div>
                            <div style={{ color: 'var(--action-primary, #0ea5c4)', marginTop: '0.2rem', fontWeight: 600 }}>
                              Tổng COD: {formatCurrencyVND(data.totalCod)}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="orderCount"
                    name="Số đơn nghi vấn"
                    fill="var(--action-primary-hover, #0b84a0)"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={isMobile ? 18 : 24}
                  >
                    <LabelList
                      dataKey="orderCount"
                      position="right"
                      fill="var(--text-main, #0f172a)"
                      fontSize={isMobile ? 10 : 11}
                      fontWeight={700}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* 4. Durable-resolution queue */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <h2
            style={{
              margin: 0,
              fontSize: '0.92rem',
              fontWeight: 700,
              fontFamily: 'var(--font-heading, "Outfit", sans-serif)',
              color: 'var(--text-main, #0f172a)'
            }}
          >
            DANH SÁCH TÀI XẾ CẦN XÁC MINH
          </h2>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--action-primary, #0ea5c4)',
              background: 'rgba(14, 165, 196, 0.1)',
              padding: '0.15rem 0.5rem',
              borderRadius: 'var(--radius-pill, 999px)'
            }}
          >
            {totalDriverCaseCount} trường hợp
          </span>
        </div>

        <div role="tablist" aria-label="Trạng thái xử lý đơn nghi vấn" style={{ display: 'flex', gap: '0.45rem' }}>
          {resolutionTabs.map(tab => {
            const selected = activeResolutionTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveResolutionTab(tab.id)}
                style={{
                  minHeight: '36px',
                  padding: '0.35rem 0.8rem',
                  borderRadius: 'var(--radius-pill, 999px)',
                  border: selected ? '1px solid var(--action-primary, #0ea5c4)' : '1px solid var(--border, #dce9f7)',
                  background: selected ? 'var(--action-primary, #0ea5c4)' : 'var(--surface, #ffffff)',
                  color: selected ? '#ffffff' : 'var(--text-main, #0f172a)',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {tab.label} <span aria-label={`${resolutionCounts[tab.id]} trường hợp`}>({resolutionCounts[tab.id]})</span>
              </button>
            );
          })}
        </div>

        {isDevAdmin && (
          <>
            <button
              type="button"
              className="cod-workflow-action cod-workflow-action--secondary"
              onClick={() => setManualRunDialogOpen(true)}
              title="Chạy thủ công một lượt chấm điểm SMS AI cho toàn bộ đơn mới hoặc đã thay đổi"
            >
              <Play size={15} /> Chạy chấm điểm SMS thủ công
            </button>
            <button
              type="button"
              className="cod-workflow-action cod-workflow-action--secondary"
              onClick={() => setHistoryPanelOpen(open => !open)}
              title="Xem lịch sử từng batch AI chấm điểm SMS và kết quả theo đơn"
            >
              <Search size={15} /> {historyPanelOpen ? 'Ẩn lịch sử batch SMS' : 'Lịch sử batch SMS'}
            </button>
          </>
        )}
      </div>

      {isDevAdmin && (
        <section className="cod-sms-overview" aria-label="Tổng quan chấm điểm SMS AI">
          <div className="cod-sms-overview__title">
            <strong>Tổng quan chấm điểm SMS AI</strong>
            <span>
              Trạng thái hiện tại của {smsOverview.total} đơn trong snapshot, không phụ thuộc lần chạy nào
              {smsOverview.lastScoredAt && ` · Lần chấm gần nhất: ${formatDateTimeVN(smsOverview.lastScoredAt)}`}
            </span>
          </div>
          {isSmsLoading ? (
            <span className="cod-sms-overview__note">Đang tải kết quả chấm...</span>
          ) : smsAssessmentsFailed ? (
            <span className="cod-sms-overview__note cod-sms-overview__note--error">Không tải được kết quả chấm SMS, chưa thể tổng hợp.</span>
          ) : (
            <div className="cod-sms-overview__stats">
              {SMS_OVERVIEW_BUCKETS.map(stat => {
                const count = smsOverview.buckets[stat.key].length;
                const isOpen = smsOverviewBucket === stat.key;
                return (
                  <button
                    key={stat.key}
                    type="button"
                    disabled={count === 0}
                    aria-expanded={isOpen}
                    onClick={() => setSmsOverviewBucket(isOpen ? null : stat.key)}
                    className={`cod-sms-overview__stat cod-sms-overview__stat--${stat.level}${count ? '' : ' is-zero'}${isOpen ? ' is-open' : ''}`}
                  >
                    <strong>{count}</strong> {stat.label}
                    {count > 0 && <ChevronDown size={13} className="cod-sms-overview__chevron" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
          {smsOverviewBucket && !isSmsLoading && !smsAssessmentsFailed && (
            <div className="cod-sms-overview__list">
              <table>
                <thead>
                  <tr>
                    <th>Mã đơn</th>
                    <th>Tài xế</th>
                    <th>Loại</th>
                    <th>Kho giao</th>
                    <th>Điểm SMS</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {smsOverview.buckets[smsOverviewBucket].map(({ order, assessment }) => {
                    const badge = getSmsScoreBadge(assessment);
                    return (
                      <tr key={getCodSmsCaseKey(order)}>
                        <td className="is-mono">{order.orderCode}</td>
                        <td>
                          <span className="is-mono">{order.driverId}</span>
                          <span className="cod-sms-overview__muted"> · {order.driverName}</span>
                        </td>
                        <td>{order.suspicionType}</td>
                        <td>{order.warehouseName}</td>
                        <td>
                          <span className={`cod-sms-badge cod-sms-badge--${badge.level}`}>{badge.text}</span>
                          {assessment?.technicalError && (
                            <div className="cod-sms-overview__error">
                              {assessment.technicalError.message} <code>{assessment.technicalError.code}</code>
                            </div>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="cod-sms-action-btn"
                            onClick={() => openSmsModal(order, assessment)}
                            aria-label={`Xem chi tiết SMS cho đơn ${order.orderCode}`}
                          >
                            <MessageSquare size={13} />
                            <span>Chi tiết</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {isDevAdmin && historyPanelOpen && (
        <CodSmsRunHistoryPanel driverNameById={driverNameById} refreshKey={smsRunsRefreshKey} />
      )}

      {resolutionError && (
        <div role="alert" style={{ marginBottom: '0.85rem', padding: '0.75rem 1rem', color: 'var(--danger-fg, #a13b2a)', background: 'var(--danger-bg, #f7d9d4)', border: '1px solid rgba(161, 59, 42, 0.3)', borderRadius: 'var(--radius-control, 10px)' }}>
          {resolutionError} <button type="button" onClick={() => loadData({ forceRefresh: true })} style={{ marginLeft: '0.5rem', color: 'inherit', fontWeight: 700, textDecoration: 'underline', background: 'transparent', border: 0, cursor: 'pointer' }}>Tải lại</button>
        </div>
      )}

      {isDevAdmin && smsError && (
        <div
          role="alert"
          style={{
            marginBottom: '0.85rem',
            padding: '0.75rem 1rem',
            color: 'var(--danger-fg, #a13b2a)',
            background: 'var(--danger-bg, #f7d9d4)',
            border: '1px solid rgba(161, 59, 42, 0.3)',
            borderRadius: 'var(--radius-control, 10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>{smsError}</span>
          </div>
          <button
            type="button"
            onClick={() => loadData({ forceRefresh: true })}
            style={{
              color: 'inherit',
              fontWeight: 700,
              textDecoration: 'underline',
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Thử lại
          </button>
        </div>
      )}

      {isSmsLoading && !isLoading && (
        <div
          role="status"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            marginBottom: '0.85rem',
            padding: '0.35rem 0.75rem',
            borderRadius: 'var(--radius-pill, 999px)',
            background: 'var(--surface-subtle, #f2f7fd)',
            border: '1px solid var(--border, #dce9f7)',
            color: 'var(--action-primary, #0ea5c4)',
            fontSize: '0.78rem',
            fontWeight: 600
          }}
        >
          <LoaderCircle size={14} className="is-spinning" />
          <span>Đang tải mức độ nghi ngờ...</span>
        </div>
      )}


      {searchQuery && (
        <div className="cod-search-context" role="status">
          <span className="cod-search-context__icon" aria-hidden="true"><Search size={16} /></span>
          <span className="cod-search-context__copy">
            Đang hiển thị kết quả cho <strong>{searchQuery}</strong>
          </span>
          <button type="button" className="cod-search-context__clear" onClick={onClearSearch}>
            <X size={15} aria-hidden="true" /> Xóa tìm kiếm
          </button>
        </div>
      )}

      {/* 6. Driver Accordion List */}
      <div className="cod-driver-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {isLoading && !hasLoaded && visibleDrivers.length === 0 ? (
          <div
            style={{
              position: 'relative',
              minHeight: '260px',
              background: 'var(--card-bg, #ffffff)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden'
            }}
          >
            <LoadingScreen fullScreen={false} />
          </div>
        ) : visibleDrivers.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '4rem 1rem',
              background: 'var(--card-bg, #ffffff)',
              borderRadius: '12px',
              border: '1px solid var(--border)'
            }}
          >
            <CheckCircle2 size={36} style={{ color: '#10b981', marginBottom: '0.75rem' }} />
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {!dataEnabled
                ? 'Local preview không tải dữ liệu COD live'
                : activeResolutionTab === 'resolved'
                ? 'Chưa có đơn nào đã cập nhật xử lý'
                : activeResolutionTab === 'non_violation'
                  ? 'Chưa có đơn nào được kết luận không vi phạm'
                  : 'Không có đơn nào cần xác minh'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              {!dataEnabled
                ? 'Đăng nhập qua Supabase để tìm và mở hồ sơ tài xế hoặc mã đơn theo quyền được cấp.'
                : suspicionType !== 'ALL' || warehouse !== 'ALL' || alertLevel !== 'ALL' || searchQuery
                ? 'Không tìm thấy kết quả phù hợp với điều kiện lọc hiện tại. Thử đặt lại bộ lọc.'
                : activeResolutionTab === 'resolved'
                  ? 'Bao gồm các trường hợp có vi phạm đang xử lý hoặc đã xử lý theo chế tài.'
                  : activeResolutionTab === 'non_violation'
                    ? 'Chỉ Dev Admin thấy các trường hợp đã được kết luận không vi phạm.'
                    : 'Hệ thống không ghi nhận đơn nào cần xác minh trong kỳ kiểm tra.'}
            </div>
          </div>
        ) : (
          visibleDrivers.map((driver, idx) => {
            const driverKey = getCodSuspicionDriverKey(driver);
            const accordionKey = `${activeResolutionTab}:${driverKey}`;
            const isExpanded = expandedDrivers.has(accordionKey);
            const driverTypeColor = TYPE_COLORS[driver.suspicionType] || 'var(--ghn-orange)';
            const driverAlertLevel = isDevAdmin ? getAlertLevel(driver.maxScore) : driver.effectiveAlertLevel || getAlertLevel(driver.maxScore);

            return (
              <div
                key={driverKey}
                ref={(element) => {
                  if (element) driverCardRefs.current.set(driverKey, element);
                  else driverCardRefs.current.delete(driverKey);
                }}
                className="cod-driver-card"
                style={{
                  background: 'var(--card-bg, #ffffff)',
                  borderRadius: '12px',
                  border: isExpanded ? '1.5px solid var(--ghn-blue, #1e40af)' : '1px solid var(--border, #e2e8f0)',
                  boxShadow: isExpanded ? '0 4px 16px rgba(0,0,0,0.06)' : '0 2px 6px rgba(0,0,0,0.02)',
                  overflow: 'hidden',
                  transition: 'border 0.2s ease, box-shadow 0.2s ease'
                }}
              >
                {/* Driver Summary Header (Accordion Trigger) */}
                <button
                  type="button"
                  className="cod-driver-summary-trigger"
                  onClick={() => handleToggleExpandDriver(accordionKey)}
                  aria-expanded={isExpanded}
                  style={{
                    width: '100%',
                    padding: isMobile ? '0.85rem 1rem' : '1.1rem 1.4rem',
                    background: isExpanded ? 'var(--surface-hover, rgba(0,0,0,0.02))' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: isMobile ? '0.6rem' : '1rem',
                    color: 'var(--text-main)'
                  }}
                >
                  <div className="cod-driver-identity">
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        color: 'var(--text-muted)'
                      }}
                    >
                      {idx + 1}
                    </div>

                    <div className="cod-driver-primary">
                      <div className="cod-driver-name-row">
                        <span
                          className="cod-driver-alert"
                          style={{ color: driverAlertLevel.color, background: driverAlertLevel.background }}
                        >
                          {driverAlertLevel.label}
                        </span>
                        <strong style={{ fontSize: '1.05rem', color: 'var(--text-main)' }}>
                          {driver.driverName}
                        </strong>
                        <span
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            background: 'rgba(0,0,0,0.06)',
                            color: 'var(--text-muted)'
                          }}
                        >
                          ID: {driver.driverId}
                        </span>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.6rem',
                            borderRadius: '6px',
                            color: driverTypeColor,
                            background: `${driverTypeColor}15`,
                            border: `1px solid ${driverTypeColor}30`
                          }}
                        >
                          {driver.suspicionType}
                        </span>
                      </div>

                      <div className="cod-driver-meta">
                        {driver.driverId} <span aria-hidden="true">·</span> {driver.warehouses.join(', ') || 'Chưa rõ kho'}
                      </div>
                    </div>
                  </div>

                  {isDevAdmin && (() => {
                    const smsLabel = getDriverSmsLabel(summarizeCodSmsAssessments(driver.orders, smsAssessments));
                    return (
                      <span className={`cod-driver-sms-summary cod-sms-badge--${smsLabel.level}`}>
                        {smsLabel.text}
                      </span>
                    );
                  })()}

                  <div
                    className="cod-driver-summary-metrics"
                  >
                    <div className="cod-driver-metric">
                      <div className="cod-driver-metric-label">Số đơn</div>
                      <div className="cod-driver-metric-value">
                        {driver.orderCount} đơn
                      </div>
                    </div>

                    <div className="cod-driver-metric cod-driver-metric--cod">
                      <div className="cod-driver-metric-label">Tổng COD</div>
                      <div className="cod-driver-metric-value">
                        {formatCurrencyVND(driver.totalCod)}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '0.4rem',
                        borderRadius: '6px',
                        background: isExpanded ? 'rgba(0,0,0,0.06)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-muted)'
                      }}
                    >
                      <ChevronDown size={20} className={`cod-accordion-chevron ${isExpanded ? 'is-expanded' : ''}`} />
                    </div>
                  </div>
                </button>

                {/* Expanded Details: Order Table */}
                <div className={`cod-driver-details ${isExpanded ? 'is-expanded' : ''}`} aria-hidden={!isExpanded}>
                  <div className="cod-driver-details-inner">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        DANH SÁCH ĐƠN NGHI VẤN LIÊN QUAN ({driver.orders.length} ĐƠN)
                        {driver.isOrphan && (
                          <span style={{ display: 'block', marginTop: '0.3rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted, #64748b)' }}>
                            Tài xế không còn đơn nghi vấn nào trong lần đồng bộ gần nhất — hiển thị theo lịch sử xử lý đã lưu.
                          </span>
                        )}
                      </div>
                      {driver.resolution?.status === 'resolved' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ color: driver.resolution.finding_outcome === 'non_violation' ? 'var(--text-muted, #64748b)' : 'var(--success-fg, #0f6e56)', fontSize: '0.78rem', fontWeight: 700 }}>
                            {getResolutionLabel(driver.resolution)} · {CONTACT_CHANNELS.find(([value]) => value === driver.resolution.contact_channel)?.[1] || 'kênh khác'}
                          </span>
                          {canManageResolutions && (
                            <>
                              {/* Editing calls upsert_cod_suspicion_driver_resolution, which requires
                                  a matching row in kas_cod_suspicion_data — an orphan driver has none
                                  (it dropped out of the latest sync), so only Undo is safe here. */}
                              {!driver.isOrphan && (
                                <button type="button" className="cod-workflow-action cod-workflow-action--secondary" onClick={() => openWorkflowDialog(driver)}><Pencil size={15} /> Chỉnh sửa</button>
                              )}
                              <button type="button" className="cod-workflow-action cod-workflow-action--danger" onClick={() => handleUndoDriverResolution(driver)} disabled={resolvingDriverKeys.has(getCodSuspicionDriverKey(driver))}><RotateCcw size={15} /> Hoàn tác / xóa</button>
                            </>
                          )}
                        </div>
                      ) : canManageResolutions ? (
                        <button type="button" className="cod-workflow-action cod-workflow-action--primary" onClick={() => openWorkflowDialog(driver)}>
                          <CheckCircle2 size={16} /> Xử lý toàn bộ {driver.orderCount} đơn
                        </button>
                      ) : null}
                    </div>

                    {isMobile && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--action-primary, #0ea5c4)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 500 }}>
                        <span>← Cuộn ngang để xem đầy đủ chi tiết đơn →</span>
                      </div>
                    )}

                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <table
                        style={{
                          width: '100%',
                          minWidth: isDevAdmin ? '920px' : '750px',
                          borderCollapse: 'collapse',
                          fontSize: '0.82rem',
                          color: 'var(--text-main)'
                        }}
                      >
                        <thead>
                          <tr style={{ background: 'var(--surface-hover, rgba(0,0,0,0.03))', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontWeight: 700 }}>Mã đơn</th>
                            <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontWeight: 700 }}>Trạng thái</th>
                            <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 700 }}>Tiền COD</th>
                            <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontWeight: 700 }}>Kho giao</th>
                            <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontWeight: 700 }}>Ngày kết thúc</th>
                            <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontWeight: 700 }}>Mức độ cảnh báo</th>
                            {isDevAdmin && (
                              <>
                                <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontWeight: 700 }}>Điểm SMS (AI)</th>
                                <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontWeight: 700 }}>Thao tác</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {driver.orders.map((order) => {
                            const orderAlertLevel = isDevAdmin
                              ? getAlertLevel(order.totalScore)
                              : smsThreshold === null
                                ? getAlertLevel(order.totalScore)
                                : getOrderEffectiveAlertLevel(order, smsAssessments, smsThreshold);
                            const smsKey = getCodSmsCaseKey({
                              suspicionType: order.suspicionType,
                              driverId: order.driverId,
                              orderCode: order.orderCode
                            });
                            const smsAssessment = smsAssessments.get(smsKey);
                            const smsBadge = getSmsScoreBadge(smsAssessment);

                            return (
                              <tr
                                key={order.orderCode}
                                style={{
                                  borderBottom: '1px solid var(--border)',
                                  transition: 'background 0.15s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.02))'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                {/* Mã đơn */}
                                <td style={{ padding: '0.65rem 0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  {order.orderCode}
                                </td>

                                {/* Trạng thái */}
                                <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                                  {order.orderStatus.toLowerCase() === 'delivered' ? 'Giao thành công' : order.orderStatus}
                                </td>

                                {/* COD */}
                                <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  {formatCurrencyVND(order.codAmount)}
                                </td>

                                {/* Kho giao */}
                                <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                                  {order.warehouseName}
                                </td>

                                {/* Ngày kết thúc */}
                                <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                                  {formatDateVN(order.endDeliveryDate)}
                                </td>

                                {/* Mức độ cảnh báo (SQL) */}
                                <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  <span
                                    style={{
                                      fontWeight: 800,
                                      padding: '0.2rem 0.5rem',
                                      borderRadius: '6px',
                                      background: orderAlertLevel.background,
                                      color: orderAlertLevel.color
                                    }}
                                  >
                                    {orderAlertLevel.label}
                                  </span>
                                </td>

                                {isDevAdmin && (
                                  <>
                                    {/* Điểm SMS (AI) */}
                                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                      <span className={`cod-sms-badge cod-sms-badge--${smsBadge.level}`}>
                                        {smsBadge.text}
                                      </span>
                                    </td>

                                    {/* Thao tác */}
                                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                      <button
                                        type="button"
                                        className="cod-sms-action-btn"
                                        onClick={() => openSmsModal(order, smsAssessment)}
                                        title={`Xem chi tiết SMS cho đơn ${order.orderCode}`}
                                        aria-label={`Xem chi tiết SMS cho đơn ${order.orderCode}`}
                                      >
                                        <MessageSquare size={13} />
                                        <span>Xem chi tiết SMS</span>
                                      </button>
                                    </td>
                                  </>
                                )}

                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <ModalDialog
        isOpen={Boolean(workflowDialog)}
        onClose={() => !resolvingDriverKeys.has(getCodSuspicionDriverKey(workflowDialog || {})) && setWorkflowDialog(null)}
        className="cod-workflow-modal"
        titleId="cod-workflow-title"
        descriptionId="cod-workflow-description"
        dismissible={!resolvingDriverKeys.has(getCodSuspicionDriverKey(workflowDialog || {}))}
      >
        {workflowDialog && (
          <form
            onSubmit={(event) => { event.preventDefault(); handleSaveDriverResolution(); }}
            onPaste={(event) => {
              const pastedFiles = Array.from(event.clipboardData?.items || [])
                .filter(item => item.kind === 'file')
                .map(item => item.getAsFile())
                .filter(Boolean);
              if (pastedFiles.length) {
                event.preventDefault();
                addEvidenceFiles(pastedFiles);
              }
            }}
          >
            <header className="cod-workflow-modal__header">
              <div className="cod-workflow-modal__icon"><MessageSquare size={22} /></div>
              <div>
                <h2 id="cod-workflow-title">{workflowDialog.resolution ? 'Cập nhật xử lý tài xế' : 'Ghi nhận xử lý tài xế'}</h2>
                <p>{workflowDialog.driverName} · {workflowDialog.orderCount} đơn {workflowDialog.suspicionType}</p>
              </div>
              <button type="button" className="cod-workflow-modal__close" onClick={() => setWorkflowDialog(null)} aria-label="Đóng"><X size={20} /></button>
            </header>

            <p id="cod-workflow-description" className="cod-workflow-modal__intro">Xác nhận này sẽ áp dụng cho toàn bộ đơn nghi vấn đang hiển thị của tài xế. Dữ liệu nguồn KAS-221 không bị chỉnh sửa.</p>

            <label className="cod-workflow-field">
              <span>Kết quả xác minh <b aria-hidden="true">*</b></span>
              <select
                value={workflowForm.findingOutcome}
                onChange={(event) => setWorkflowForm(previous => ({
                  ...previous,
                  findingOutcome: event.target.value,
                  enforcementStatus: event.target.value === 'violation' ? (previous.enforcementStatus || 'in_progress') : null
                }))}
                required
              >
                <option value="violation">Có vi phạm</option>
                <option value="non_violation">Không vi phạm</option>
              </select>
            </label>

            {workflowForm.findingOutcome === 'violation' && (
              <label className="cod-workflow-field">
                <span>Tình trạng xử lý <b aria-hidden="true">*</b></span>
                <select value={workflowForm.enforcementStatus || 'in_progress'} onChange={(event) => setWorkflowForm(previous => ({ ...previous, enforcementStatus: event.target.value }))} required>
                  <option value="in_progress">Đang xử lý</option>
                  <option value="disciplinary_action">Đã xử lý theo chế tài</option>
                </select>
              </label>
            )}

            <label className="cod-workflow-field">
              <span>Kênh đã trao đổi <b aria-hidden="true">*</b></span>
              <select value={workflowForm.contactChannel} onChange={(event) => setWorkflowForm(previous => ({ ...previous, contactChannel: event.target.value }))} required>
                {CONTACT_CHANNELS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>

            <label className="cod-workflow-field">
              <span>Ghi chú</span>
              <textarea rows="4" maxLength="4000" value={workflowForm.note} onChange={(event) => setWorkflowForm(previous => ({ ...previous, note: event.target.value }))} placeholder="Nội dung trao đổi, người phối hợp, kết quả xác nhận…" />
            </label>

            <section className="cod-workflow-evidence" aria-label="Ảnh minh chứng">
              <div>
                <strong>Ảnh minh chứng</strong>
                <span>Dán trực tiếp bằng Ctrl + V hoặc chọn tối đa 5 ảnh JPG, PNG, WEBP (5 MB/ảnh).</span>
              </div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => { addEvidenceFiles(event.target.files); event.target.value = ''; }} />
              <button type="button" className="cod-evidence-dropzone" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus size={20} /> Chọn ảnh hoặc dán ảnh tại đây
              </button>
              {(workflowForm.attachments.length > 0 || workflowForm.newFiles.length > 0) && (
                <ul className="cod-evidence-list">
                  {workflowForm.attachments.map((path) => (
                    <li key={path}><span>{path.split('/').pop()}</span><button type="button" onClick={() => setWorkflowForm(previous => ({ ...previous, attachments: previous.attachments.filter(item => item !== path), removedAttachments: [...previous.removedAttachments, path] }))} aria-label="Xóa ảnh đã lưu"><Trash2 size={15} /></button></li>
                  ))}
                  {workflowForm.newFiles.map((file, index) => (
                    <li key={`${file.name}-${index}`}><span>{file.name}</span><button type="button" onClick={() => setWorkflowForm(previous => ({ ...previous, newFiles: previous.newFiles.filter((_, fileIndex) => fileIndex !== index) }))} aria-label={`Bỏ ${file.name}`}><X size={15} /></button></li>
                  ))}
                </ul>
              )}
            </section>

            <label className="cod-workflow-skip">
              <input type="checkbox" defaultChecked={typeof window !== 'undefined' && window.localStorage.getItem('cod-suspicion-skip-preflight') === 'true'} onChange={(event) => window.localStorage.setItem('cod-suspicion-skip-preflight', String(event.target.checked))} />
              <span><b>Không hỏi lại</b><small>Bỏ bước nhắc xác nhận riêng ở lần xử lý sau; form lưu kênh trao đổi và ghi chú vẫn luôn hiện.</small></span>
            </label>

            <footer className="cod-workflow-modal__footer">
              <button type="button" className="cod-workflow-action cod-workflow-action--secondary" onClick={() => setWorkflowDialog(null)}>Hủy</button>
              <button type="submit" className="cod-workflow-action cod-workflow-action--primary" disabled={resolvingDriverKeys.has(getCodSuspicionDriverKey(workflowDialog))}>
                {resolvingDriverKeys.has(getCodSuspicionDriverKey(workflowDialog)) ? <><LoaderCircle className="is-spinning" size={16} /> Đang lưu…</> : <><CheckCircle2 size={16} /> Lưu xử lý</>}
              </button>
            </footer>
          </form>
        )}
      </ModalDialog>

      {/* Modal chi tiết đánh giá SMS AI */}
      <ModalDialog
        isOpen={Boolean(smsDetailModal)}
        onClose={closeSmsModal}
        className="cod-sms-modal"
        titleId="cod-sms-modal-title"
        descriptionId="cod-sms-modal-description"
      >
        {smsDetailModal && (
          <div className="cod-sms-modal__content">
            <header className="cod-sms-modal__header">
              <div className="cod-sms-modal__icon">
                <MessageSquare size={22} />
              </div>
              <div>
                <h2 id="cod-sms-modal-title">Chi tiết đánh giá SMS AI</h2>
                <p id="cod-sms-modal-description">
                  Đơn <strong>{smsDetailModal.order.orderCode}</strong> · {smsDetailModal.order.driverName} ({smsDetailModal.order.suspicionType})
                </p>
              </div>
              <button
                type="button"
                className="cod-sms-modal__close"
                onClick={closeSmsModal}
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </header>

            <div className="cod-sms-modal__body">
              {/* Thẻ tóm tắt thông tin đơn */}
              <div className="cod-sms-modal__meta-strip">
                <div className="cod-sms-modal__meta-item">
                  <span className="cod-sms-modal__meta-label">Kho giao</span>
                  <span className="cod-sms-modal__meta-value">{smsDetailModal.order.warehouseName}</span>
                </div>
                <div className="cod-sms-modal__meta-item">
                  <span className="cod-sms-modal__meta-label">Tiền COD</span>
                  <span className="cod-sms-modal__meta-value">{formatCurrencyVND(smsDetailModal.order.codAmount)}</span>
                </div>
                <div className="cod-sms-modal__meta-item">
                  <span className="cod-sms-modal__meta-label">Cảnh báo SQL</span>
                  <span
                    className="cod-sms-modal__meta-value"
                    style={{ color: getAlertLevel(smsDetailModal.order.totalScore).color, fontWeight: 700 }}
                  >
                    {getAlertLevel(smsDetailModal.order.totalScore).label} ({smsDetailModal.order.totalScore}đ)
                  </span>
                </div>
              </div>

              {smsDetailModal.assessment ? (
                <>
                  {/* Điểm & Mức độ tin cậy */}
                  <div className="cod-sms-modal__score-card">
                    <div className="cod-sms-modal__score-main">
                      <div className="cod-sms-modal__score-figure">
                        <span className="cod-sms-modal__score-num">
                          {smsDetailModal.assessment.smsScore ?? '—'}
                        </span>
                        <span className="cod-sms-modal__score-max">/9</span>
                      </div>
                      <div className="cod-sms-modal__score-info">
                        <div className="cod-sms-modal__score-heading">
                          Điểm nghi vấn SMS (AI)
                        </div>
                        <div className="cod-sms-modal__score-badge-wrap">
                          <span className={`cod-sms-badge cod-sms-badge--${getSmsScoreBadge(smsDetailModal.assessment).level}`}>
                            {getSmsScoreBadge(smsDetailModal.assessment).text}
                          </span>
                          {smsDetailModal.assessment.confidence && (
                            <span className="cod-sms-modal__confidence-sub">
                              Mức độ tin cậy: <strong>{formatSmsConfidence(smsDetailModal.assessment.confidence)}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Mẫu hình phát hiện */}
                    <div className="cod-sms-modal__section">
                      <div className="cod-sms-modal__section-title">Mẫu hình phát hiện:</div>
                      {Array.isArray(smsDetailModal.assessment.detectedPatterns) && smsDetailModal.assessment.detectedPatterns.length > 0 ? (
                        <div className="cod-sms-modal__patterns-list">
                          {smsDetailModal.assessment.detectedPatterns.map(patternKey => (
                            <div key={patternKey} className="cod-sms-modal__pattern-tag">
                              <CheckCircle2 size={14} className="cod-sms-modal__pattern-icon" />
                              <span>{SMS_PATTERN_LABELS[patternKey] || patternKey}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="cod-sms-modal__empty-patterns">
                          Không phát hiện mẫu hình nghi vấn trong nội dung SMS.
                        </div>
                      )}
                    </div>

                    {/* Giải thích từ AI */}
                    {smsDetailModal.assessment.explanation && (
                      <div className="cod-sms-modal__section">
                        <div className="cod-sms-modal__section-title">Nhận định phân tích từ AI:</div>
                        <div className="cod-sms-modal__explanation">
                          {smsDetailModal.assessment.explanation}
                        </div>
                      </div>
                    )}

                    {/* Metadata audit */}
                    <div className="cod-sms-modal__audit-meta">
                      <span>Thời gian chấm: <strong>{formatDateTimeVN(smsDetailModal.assessment.scoredAt)}</strong></span>
                      {smsDetailModal.assessment.model && (
                        <span>Mô hình: <strong>{smsDetailModal.assessment.model}</strong></span>
                      )}
                      {smsDetailModal.assessment.rubricVersion && (
                        <span>Rubric: <strong>{smsDetailModal.assessment.rubricVersion}</strong></span>
                      )}
                    </div>
                  </div>

                  {/* Khu vực Bằng chứng SMS */}
                  <div className="cod-sms-modal__evidence-card">
                    <div className="cod-sms-modal__evidence-header">
                      <strong>Bằng chứng SMS nguyên văn</strong>
                    </div>

                    {!isDevAdmin ? (
                      <div className="cod-sms-modal__evidence-notice">
                        <div className="cod-sms-modal__notice-icon">
                          <ShieldAlert size={18} />
                        </div>
                        <div>
                          <div className="cod-sms-modal__notice-title">Bằng chứng SMS chỉ dành cho Dev Admin</div>
                          <div className="cod-sms-modal__notice-desc">
                            Nội dung tin nhắn SMS nguyên văn được giới hạn quyền truy cập theo quy định bảo vệ dữ liệu nội bộ.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="cod-sms-modal__evidence-dev-content">
                        {smsDetailModal.assessment.status === 'no_evidence' ? (
                          <div className="cod-sms-modal__evidence-empty">
                            Không có SMS nào được ghi nhận làm bằng chứng.
                          </div>
                        ) : smsDetailModal.assessment.status === 'pending' ? (
                          <div className="cod-sms-modal__evidence-empty">
                            Đơn này chưa được chấm điểm, chưa có bằng chứng để hiển thị.
                          </div>
                        ) : smsDetailModal.assessment.status === 'failed' ? (
                          <div className="cod-sms-modal__evidence-empty">
                            Lượt chấm điểm bị lỗi, không có bằng chứng để hiển thị.
                          </div>
                        ) : (
                          <>
                            {evidenceState.isLoading && (
                              <div className="cod-sms-modal__evidence-loading">
                                <LoadingScreen fullScreen={false} />
                              </div>
                            )}

                            {evidenceState.error && (
                              <div className="cod-sms-modal__evidence-error">
                                <AlertTriangle size={18} />
                                <span>{evidenceState.error}</span>
                                <button
                                  type="button"
                                  className="cod-workflow-action cod-workflow-action--secondary"
                                  onClick={() => loadEvidenceForModal(smsDetailModal.order, { forceRefresh: true })}
                                  style={{ marginLeft: 'auto', padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                                >
                                  <RotateCcw size={13} /> Thử lại
                                </button>
                              </div>
                            )}

                            {!evidenceState.isLoading && !evidenceState.error && evidenceState.evidence && (
                              <>
                                {evidenceState.evidence.length > 0 ? (
                                  <div className="cod-sms-modal__evidence-quotes">
                                    {evidenceState.evidence.map((quote, idx) => (
                                      <div key={idx} className="cod-sms-modal__quote-item">
                                        <span className="cod-sms-modal__quote-idx">#{idx + 1}</span>
                                        <div className="cod-sms-modal__quote-text">{quote}</div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="cod-sms-modal__evidence-empty">
                                    Không có SMS nào được ghi nhận làm bằng chứng.
                                  </div>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="cod-sms-modal__unscored-state">
                  <Info size={28} style={{ color: 'var(--text-muted)' }} />
                  <h3>Đơn hàng này chưa có kết quả chấm điểm SMS AI</h3>
                  <p>
                    Hệ thống sàng lọc chưa ghi nhận lượt phân tích SMS cho đơn hàng này. Kết quả sẽ tự động cập nhật khi có đợt chấm điểm mới.
                  </p>
                </div>
              )}
            </div>

            <footer className="cod-sms-modal__footer">
              <button
                type="button"
                className="cod-workflow-action cod-workflow-action--secondary"
                onClick={closeSmsModal}
              >
                Đóng
              </button>
            </footer>
          </div>
        )}
      </ModalDialog>

      {/* Chạy chấm điểm SMS AI thủ công (Dev Admin) */}
      <ModalDialog
        isOpen={manualRunDialogOpen}
        onClose={closeManualRunDialog}
        className="cod-sms-modal"
        titleId="cod-sms-manual-run-title"
        descriptionId="cod-sms-manual-run-description"
        dismissible={!manualRunState.isRunning}
      >
        {manualRunDialogOpen && (
          <div className="cod-sms-modal__content">
            <header className="cod-sms-modal__header">
              <div className="cod-sms-modal__icon">
                <Play size={22} />
              </div>
              <div>
                <h2 id="cod-sms-manual-run-title">Chạy chấm điểm SMS AI thủ công</h2>
                <p id="cod-sms-manual-run-description">
                  Quét toàn bộ đơn mới hoặc thay đổi kể từ lần chấm gần nhất, đồng thời tự động chấm lại các đơn đang lỗi.
                </p>
              </div>
              {!manualRunState.isRunning && (
                <button type="button" className="cod-sms-modal__close" onClick={closeManualRunDialog} aria-label="Đóng">
                  <X size={20} />
                </button>
              )}
            </header>

            <div className="cod-sms-modal__body">
              {!manualRunState.isRunning && !manualRunState.result && !manualRunState.error && !manualRunState.aborted && (
                <>
                  <div className="cod-sms-modal__unscored-state">
                    <AlertTriangle size={28} style={{ color: 'var(--warning-fg, #92400e)' }} />
                    <h3>Thao tác này gọi mô hình AI thật, phát sinh chi phí.</h3>
                    <p>
                      Đơn đã chấm điểm và chưa thay đổi sẽ được bỏ qua tự động (không tính phí lại).
                      Đơn mới, đã thay đổi, hoặc trước đó lỗi/treo sẽ được chấm lại — bao gồm cả
                      việc buộc chấm lại các đơn vẫn còn ở trạng thái lỗi sau lượt quét.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <button
                      type="button"
                      onClick={() => setManualRunMode('all')}
                      className="cod-workflow-action"
                      style={{
                        flex: 1,
                        background: manualRunMode === 'all' ? 'var(--ghn-orange)' : 'var(--card-bg)',
                        color: manualRunMode === 'all' ? 'white' : 'var(--text-main)'
                      }}
                    >
                      Tất cả đơn
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualRunMode('cases')}
                      className="cod-workflow-action"
                      style={{
                        flex: 1,
                        background: manualRunMode === 'cases' ? 'var(--ghn-orange)' : 'var(--card-bg)',
                        color: manualRunMode === 'cases' ? 'white' : 'var(--text-main)'
                      }}
                    >
                      Chọn đơn cụ thể
                    </button>
                  </div>

                  {manualRunMode === 'cases' && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <input
                        type="text"
                        value={manualRunSearch}
                        onChange={e => setManualRunSearch(e.target.value)}
                        placeholder="Tìm theo mã đơn, ID tài xế hoặc tên tài xế..."
                        style={{
                          padding: '0.5rem 0.75rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                          fontSize: '0.85rem'
                        }}
                      />

                      {manualRunSearch.trim() && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <span>{manualRunSearchResults.length} kết quả</span>
                          {manualRunSearchResults.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setManualRunSelectedKeys(prev => {
                                  const next = new Map(prev);
                                  manualRunSearchResults.forEach(order => {
                                    next.set(getCodSmsCaseKey(order), order);
                                  });
                                  return next;
                                });
                              }}
                              style={{ border: 'none', background: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
                            >
                              Chọn tất cả kết quả đang lọc
                            </button>
                          )}
                        </div>
                      )}

                      {manualRunSearchResults.length > 0 && (
                        <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                          {manualRunSearchResults.map(order => {
                            const key = getCodSmsCaseKey(order);
                            const checked = manualRunSelectedKeys.has(key);
                            return (
                              <label
                                key={key}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  padding: '0.4rem 0.6rem',
                                  fontSize: '0.8rem',
                                  borderBottom: '1px solid var(--border)',
                                  cursor: 'pointer'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    setManualRunSelectedKeys(prev => {
                                      const next = new Map(prev);
                                      if (checked) next.delete(key); else next.set(key, order);
                                      return next;
                                    });
                                  }}
                                />
                                <span>{order.orderCode}</span>
                                <span style={{ color: 'var(--text-muted)' }}>
                                  {order.driverName} ({order.driverId}) · {order.suspicionType}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {manualRunSelectedKeys.size > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {[...manualRunSelectedKeys.entries()].map(([key, order]) => (
                            <span
                              key={key}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '999px',
                                background: 'var(--surface-hover)',
                                fontSize: '0.75rem'
                              }}
                            >
                              {order.orderCode}
                              <button
                                type="button"
                                onClick={() => setManualRunSelectedKeys(prev => {
                                  const next = new Map(prev);
                                  next.delete(key);
                                  return next;
                                })}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex' }}
                                aria-label={`Bỏ chọn ${order.orderCode}`}
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                            Đã chọn {manualRunSelectedKeys.size} đơn
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {manualRunState.isRunning && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '1rem 0' }}>
                  <div className="cod-sms-modal__evidence-loading" style={{ justifyContent: 'center' }}>
                    <LoaderCircle size={20} className="is-spinning" />
                    <span>
                      {manualRunProgress?.total
                        ? `Đang chấm điểm SMS AI: ${manualRunProgress.processed}/${manualRunProgress.total} đơn (trang ${manualRunProgress.page ?? 1})...`
                        : manualRunProgress?.processed
                          ? `Đang chấm điểm SMS AI: đã xử lý ${manualRunProgress.processed} đơn...`
                          : 'Đang chạy chấm điểm SMS AI, có thể mất vài phút...'}
                    </span>
                  </div>
                  {manualRunProgress?.total > 0 && (
                    <div style={{ height: '6px', borderRadius: '999px', background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, Math.round((manualRunProgress.processed / manualRunProgress.total) * 100))}%`,
                        background: 'var(--ghn-orange)',
                        transition: 'width 0.2s ease'
                      }} />
                    </div>
                  )}
                  <button
                    type="button"
                    className="cod-workflow-action cod-workflow-action--secondary"
                    onClick={handleStopManualBatch}
                    style={{ alignSelf: 'center' }}
                  >
                    Dừng
                  </button>
                </div>
              )}

              {!manualRunState.isRunning && manualRunState.aborted && (
                <div className="cod-sms-modal__audit-meta" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem' }}>
                  <span>Đã dừng theo yêu cầu — các đơn đã xử lý trước đó vẫn được giữ nguyên.</span>
                  <span>Đã xử lý trong lượt này: <strong>{manualRunProgress?.processed ?? 0}</strong></span>
                </div>
              )}

              {!manualRunState.isRunning && manualRunState.error && (
                <div className="cod-sms-modal__evidence-error">
                  <AlertTriangle size={18} />
                  <span>{manualRunState.error}</span>
                </div>
              )}

              {!manualRunState.isRunning && manualRunState.result && (
                <div className="cod-sms-modal__audit-meta" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem' }}>
                  <span>Đã chấm mới: <strong>{manualRunState.result.scored ?? 0}</strong></span>
                  <span>Không có bằng chứng: <strong>{manualRunState.result.noEvidence ?? 0}</strong></span>
                  <span>Lỗi chấm điểm: <strong>{manualRunState.result.failed ?? 0}</strong></span>
                  <span>Bỏ qua (không đổi từ lần trước): <strong>{manualRunState.result.skippedUnchanged ?? 0}</strong></span>
                  {manualRunState.result.forceRetried > 0 && (
                    <span>Trong đó buộc chấm lại đơn lỗi: <strong>{manualRunState.result.forceRetried}</strong></span>
                  )}
                  <span>Tổng số đơn xét trong lượt này: <strong>{manualRunState.result.found ?? 0}</strong></span>
                </div>
              )}
            </div>

            <footer className="cod-sms-modal__footer">
              {manualRunState.isRunning ? null : manualRunState.result ? (
                <button
                  type="button"
                  className="cod-workflow-action cod-workflow-action--primary"
                  onClick={closeManualRunDialog}
                >
                  Đóng
                </button>
              ) : manualRunState.aborted ? (
                <>
                  <button
                    type="button"
                    className="cod-workflow-action cod-workflow-action--secondary"
                    onClick={closeManualRunDialog}
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    className="cod-workflow-action cod-workflow-action--primary"
                    onClick={handleRunManualBatch}
                  >
                    <Play size={16} /> Chạy tiếp
                  </button>
                </>
              ) : manualRunState.error ? (
                <>
                  <button
                    type="button"
                    className="cod-workflow-action cod-workflow-action--secondary"
                    onClick={closeManualRunDialog}
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    className="cod-workflow-action cod-workflow-action--primary"
                    onClick={handleRunManualBatch}
                  >
                    <RotateCcw size={16} /> Thử lại
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="cod-workflow-action cod-workflow-action--secondary"
                    onClick={closeManualRunDialog}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="cod-workflow-action cod-workflow-action--primary"
                    onClick={handleRunManualBatch}
                    disabled={manualRunMode === 'cases' && manualRunSelectedKeys.size === 0}
                  >
                    <Play size={16} /> Chạy ngay
                  </button>
                </>
              )}
            </footer>
          </div>
        )}
      </ModalDialog>

    </div>
  );
}
