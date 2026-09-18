import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldAlert,
  RefreshCw,
  ChevronDown,
  AlertTriangle,
  CheckCircle2
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
  computeSuspicionKPIs,
  getAlertLevel,
  aggregateOrdersByEndDeliveryDate
} from '../utils/codSuspicionProcessor';
import { fetchCodSuspicionData } from '../utils/codSuspicionClient';

const TYPE_COLORS = {
  'Gối đầu COD': 'var(--ghn-orange, #f26522)',
  'Rút ruột': '#8b5cf6'
};

export default function CodSuspicionReport({ filters, onAvailableWarehouses }) {
  const [rawData, setRawData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

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
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetchCodSuspicionData();
      if (res.success) {
        setRawData(res.rows || []);
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
  const normalizedOrders = useMemo(() => {
    return rawData.map(normalizeSuspicionOrder);
  }, [rawData]);

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

        {/* Bottom Ledger Metrics: 3 Columns with Dividers */}
        <div className="cod-ledger-metrics">
          {/* Metric 1 */}
          <div className="cod-ledger-metric-item">
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              TÀI XẾ CẦN XÁC MINH
            </div>
            <div
              className="cod-ledger-metric-val"
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)',
                color: 'var(--text-main, #0f172a)',
                lineHeight: 1.2,
                marginTop: '0.25rem'
              }}
            >
              {kpis.totalDrivers.toLocaleString('vi-VN')}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', marginTop: '0.25rem' }}>
              Đối tượng trực tiếp cần phân công nhân sự rà soát
            </div>
          </div>

          {/* Metric 2 */}
          <div className="cod-ledger-metric-item">
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              TỔNG ĐƠN NGHI VẤN
            </div>
            <div
              className="cod-ledger-metric-val"
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)',
                color: 'var(--text-main, #0f172a)',
                lineHeight: 1.2,
                marginTop: '0.25rem'
              }}
            >
              {kpis.totalOrders.toLocaleString('vi-VN')}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', marginTop: '0.25rem' }}>
              Toàn bộ đơn phát sinh tín hiệu sau bộ lọc
            </div>
          </div>

          {/* Metric 3 */}
          <div className="cod-ledger-metric-item">
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              TỔNG TIỀN COD LIÊN QUAN
            </div>
            <div
              className="cod-ledger-metric-val"
              style={{
                fontSize: '1.8rem',
                fontWeight: 700,
                fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)',
                color: 'var(--text-main, #0f172a)',
                lineHeight: 1.2,
                marginTop: '0.25rem'
              }}
            >
              {formatCurrencyVND(kpis.totalCod)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', marginTop: '0.25rem' }}>
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
            onClick={loadData}
            style={{ borderColor: 'currentColor', color: '#ef4444' }}
          >
            Thử lại
          </button>
        </div>
      )}

      {/* 3. Paired Investigation Charts (B1) */}
      <div className="cod-charts-grid">
        {/* Chart 1: Số case nghi ngờ theo ngày */}
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
                SỐ CASE NGHI NGỜ THEO NGÀY
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', fontFamily: 'var(--font-mono, monospace)' }}>
                Đơn vị: Case
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
                <BarChart data={dailyCaseChartData} margin={{ top: 15, right: isMobile ? 8 : 15, left: isMobile ? -24 : -15, bottom: 5 }}>
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
                              {data.cases} case nghi vấn
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="cases"
                    name="Số case nghi vấn"
                    fill="var(--action-primary, #0ea5c4)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={isMobile ? 32 : 48}
                  />
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

      {/* 4. Driver Accordion Header (Controls "Mở rộng tất cả / Thu gọn" removed) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
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
            {filteredDrivers.length} tài xế
          </span>
        </div>
      </div>

      {/* 6. Driver Accordion List */}
      <div className="cod-driver-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {isLoading && filteredDrivers.length === 0 ? (
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
        ) : filteredDrivers.length === 0 ? (
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
              Không có tài xế nào trong danh sách nghi vấn
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              {suspicionType !== 'ALL' || warehouse !== 'ALL' || alertLevel !== 'ALL'
                ? 'Không tìm thấy kết quả phù hợp với điều kiện lọc hiện tại. Thử đặt lại bộ lọc.'
                : 'Hệ thống không ghi nhận tài xế nào đạt ngưỡng nghi vấn KAS-221 trong kỳ kiểm tra.'}
            </div>
          </div>
        ) : (
          filteredDrivers.map((driver, idx) => {
            const isExpanded = expandedDrivers.has(driver.driverId);
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
                  onClick={() => handleToggleExpandDriver(driver.driverId)}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        DANH SÁCH ĐƠN NGHI VẤN LIÊN QUAN ({driver.orders.length} ĐƠN)
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Sắp theo điểm nghi vấn giảm dần
                      </div>
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
                          minWidth: '680px',
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
                            <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontWeight: 700 }}>Ngày gán giao</th>
                            <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontWeight: 700 }}>Ngày kết thúc</th>
                            <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontWeight: 700 }}>Tổng TG (ngày)</th>
                            <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontWeight: 700 }}>Lý do fail ca 1</th>
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
                                  <span
                                    style={{
                                      padding: '0.15rem 0.5rem',
                                      borderRadius: '4px',
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                      background: order.orderStatus === 'delivered' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                      color: order.orderStatus === 'delivered' ? '#10b981' : '#ef4444'
                                    }}
                                  >
                                    {order.orderStatus}
                                  </span>
                                </td>

                                {/* COD */}
                                <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 700, color: '#10b981', whiteSpace: 'nowrap' }}>
                                  {formatCurrencyVND(order.codAmount)}
                                </td>

                                {/* Kho giao */}
                                <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                                  {order.warehouseName}
                                </td>

                                {/* Ngày gán */}
                                <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                                  {formatDateVN(order.firstDeliveredDate)}
                                </td>

                                {/* Ngày kết thúc */}
                                <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                                  {formatDateVN(order.endDeliveryDate)}
                                </td>

                                {/* Tổng thời gian (ngày) */}
                                <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontWeight: 600 }}>
                                  {order.deliveryDurationDays !== null ? `${order.deliveryDurationDays} ngày` : '-'}
                                </td>

                                {/* Lý do fail ca đầu */}
                                <td
                                  style={{
                                    padding: '0.65rem 0.75rem',
                                    maxWidth: '220px',
                                    whiteSpace: 'normal',
                                    fontSize: '0.78rem',
                                    color: order.firstFailNote === 'Không ghi nhận lý do' ? 'var(--text-muted)' : 'var(--text-main)'
                                  }}
                                  title={order.firstFailNote}
                                >
                                  {order.firstFailNote}
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

    </div>
  );
}
