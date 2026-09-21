import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ShieldAlert,
  RefreshCw,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Pencil,
  RotateCcw,
  Trash2,
  ImagePlus,
  X,
  MessageSquare,
  LoaderCircle
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
  normalizeSuspicionOrder,
  groupOrdersByDriver,
  sortDrivers,
  filterDriverGroups,
  filterDriverGroupsByResolutionStatus,
  getCodSuspicionDriverKey,
  computeSuspicionKPIs,
  getAlertLevel,
  aggregateOrdersByEndDeliveryDate
} from '../utils/codSuspicionProcessor';
import {
  fetchCodSuspicionData,
  fetchCodSuspicionCaseResolutions,
  saveCodSuspicionDriverResolution,
  undoCodSuspicionDriverResolution,
  uploadCodResolutionEvidence,
  removeCodResolutionEvidence
} from '../utils/codSuspicionClient';
import ModalDialog from './ui/ModalDialog';

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

function getResolutionLabel(resolution) {
  if (resolution?.finding_outcome === 'non_violation') return 'Không vi phạm';
  return resolution?.enforcement_status === 'disciplinary_action' ? 'Đã xử lý theo chế tài' : 'Đang xử lý';
}

export default function CodSuspicionReport({ filters, onAvailableWarehouses, canManageResolutions = false }) {
  const [rawData, setRawData] = useState([]);
  const [resolutions, setResolutions] = useState(() => new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [resolutionError, setResolutionError] = useState('');
  const [activeResolutionTab, setActiveResolutionTab] = useState('pending');
  const [resolvingDriverKeys, setResolvingDriverKeys] = useState(() => new Set());
  const [workflowDialog, setWorkflowDialog] = useState(null);
  const [workflowForm, setWorkflowForm] = useState({ findingOutcome: 'violation', enforcementStatus: 'in_progress', contactChannel: 'telegram', note: '', attachments: [], removedAttachments: [], newFiles: [] });
  const fileInputRef = useRef(null);

  const { suspicionType = 'ALL', warehouse = 'ALL', alertLevel = 'ALL' } = filters || {};

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

  // Fetch data
  const loadData = useCallback(async ({ forceRefresh = false } = {}) => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const [sourceResult, resolutionResult] = await Promise.all([
        fetchCodSuspicionData({ forceRefresh }),
        fetchCodSuspicionCaseResolutions()
      ]);
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
    } catch (err) {
      console.error('Error in CodSuspicionReport loadData:', err);
      setErrorMsg('Đã xảy ra lỗi khi kết nối Supabase. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Normalize all rows
  const normalizedOrders = useMemo(() => rawData.map(raw => {
    const order = normalizeSuspicionOrder(raw);
    return {
      ...order,
      resolution: resolutions.get(getCodSuspicionDriverKey(order)) || null
    };
  }), [rawData, resolutions]);

  // Group all rows by driver and sort default
  const allDriverGroups = useMemo(() => {
    const grouped = groupOrdersByDriver(normalizedOrders);
    return sortDrivers(grouped);
  }, [normalizedOrders]);

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
    return filterDriverGroups(allDriverGroups, {
      suspicionType,
      warehouse,
      alertLevel
    });
  }, [allDriverGroups, suspicionType, warehouse, alertLevel]);

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

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)' }}>
            Quy chuẩn sàng lọc KAS-221
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
      </div>

      {resolutionError && (
        <div role="alert" style={{ marginBottom: '0.85rem', padding: '0.75rem 1rem', color: 'var(--danger-fg, #a13b2a)', background: 'var(--danger-bg, #f7d9d4)', border: '1px solid rgba(161, 59, 42, 0.3)', borderRadius: 'var(--radius-control, 10px)' }}>
          {resolutionError} <button type="button" onClick={() => loadData({ forceRefresh: true })} style={{ marginLeft: '0.5rem', color: 'inherit', fontWeight: 700, textDecoration: 'underline', background: 'transparent', border: 0, cursor: 'pointer' }}>Tải lại</button>
        </div>
      )}

      {!canManageResolutions && (
        <div role="status" style={{ marginBottom: '0.85rem', padding: '0.75rem 1rem', color: 'var(--warning-fg, #92400e)', background: 'var(--warning-bg, #fef3c7)', border: '1px solid rgba(146, 64, 14, 0.25)', borderRadius: 'var(--radius-control, 10px)' }}>
          Bạn chỉ có quyền xem dữ liệu nguồn. Chỉ Dev Admin được xác nhận xử lý đơn.
        </div>
      )}

      {/* 6. Driver Accordion List */}
      <div className="cod-driver-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {isLoading && visibleDrivers.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '4rem 1rem',
              background: 'var(--card-bg, #ffffff)',
              borderRadius: '12px',
              border: '1px solid var(--border)'
            }}
          >
            <RefreshCw size={28} className="is-spinning" style={{ color: 'var(--ghn-orange)' }} />
            <div style={{ marginTop: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Đang tải danh sách tài xế và đơn nghi vấn...
            </div>
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
              {activeResolutionTab === 'resolved'
                ? 'Chưa có đơn nào đã cập nhật xử lý'
                : activeResolutionTab === 'non_violation'
                  ? 'Chưa có đơn nào được kết luận không vi phạm'
                  : 'Không có đơn nào cần xác minh'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              {suspicionType !== 'ALL' || warehouse !== 'ALL' || alertLevel !== 'ALL'
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
            const accordionKey = `${activeResolutionTab}:${driver.driverId}`;
            const isExpanded = expandedDrivers.has(accordionKey);
            const driverTypeColor = TYPE_COLORS[driver.suspicionType] || 'var(--ghn-orange)';
            const driverAlertLevel = getAlertLevel(driver.maxScore);

            return (
              <div
                key={driver.driverId}
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
                      </div>
                      {driver.resolution?.status === 'resolved' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ color: driver.resolution.finding_outcome === 'non_violation' ? 'var(--text-muted, #64748b)' : 'var(--success-fg, #0f6e56)', fontSize: '0.78rem', fontWeight: 700 }}>
                            {getResolutionLabel(driver.resolution)} · {CONTACT_CHANNELS.find(([value]) => value === driver.resolution.contact_channel)?.[1] || 'kênh khác'}
                          </span>
                          {canManageResolutions && (
                            <>
                              <button type="button" className="cod-workflow-action cod-workflow-action--secondary" onClick={() => openWorkflowDialog(driver)}><Pencil size={15} /> Chỉnh sửa</button>
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
                          minWidth: '760px',
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
                          </tr>
                        </thead>
                        <tbody>
                          {driver.orders.map((order) => {
                            const orderAlertLevel = getAlertLevel(order.totalScore);
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

                                {/* Mức độ cảnh báo */}
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

    </div>
  );
}
