import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldAlert,
  RefreshCw,
  ChevronDown,
  AlertTriangle,
  UserCheck,
  Package,
  BadgeDollarSign,
  CheckCircle2
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell
} from 'recharts';
import {
  formatCurrencyVND,
  formatDateVN,
  normalizeSuspicionOrder,
  groupOrdersByDriver,
  sortDrivers,
  filterDriverGroups,
  computeSuspicionKPIs,
  getAlertLevel
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

  // Expand / Collapse all handlers
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

  const handleExpandAll = () => {
    setExpandedDrivers(new Set(filteredDrivers.map(d => d.driverId)));
  };

  const handleCollapseAll = () => {
    setExpandedDrivers(new Set());
  };

  // Chart data: Distribution by type
  const typeChartData = useMemo(() => {
    return [
      {
        name: 'Gối đầu COD',
        orders: kpis.typeCounts['Gối đầu COD'].orders,
        drivers: kpis.typeCounts['Gối đầu COD'].drivers,
        fill: TYPE_COLORS['Gối đầu COD']
      },
      {
        name: 'Rút ruột',
        orders: kpis.typeCounts['Rút ruột'].orders,
        drivers: kpis.typeCounts['Rút ruột'].drivers,
        fill: TYPE_COLORS['Rút ruột']
      }
    ].filter(item => item.orders > 0 || item.drivers > 0);
  }, [kpis]);

  return (
    <div className="report-container cod-suspicion-page" style={{ padding: '1.5rem', maxWidth: '1600px', margin: '0 auto' }}>
      
      {/* 1. Header Banner */}
      <div
        className="cod-header-banner"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'var(--card-bg, #ffffff)',
          padding: '1.25rem 1.5rem',
          borderRadius: '12px',
          border: '1px solid var(--border, #e2e8f0)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          marginBottom: '1.5rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              padding: '0.85rem',
              background: 'rgba(242, 101, 34, 0.12)',
              color: 'var(--ghn-orange, #f26522)',
              borderRadius: '10px'
            }}
          >
            <ShieldAlert size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)' }}>
                ĐƠN NGHI VẤN COD
              </h1>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Danh sách tài xế và đơn hàng cần rà soát liên quan đến nghi ngờ hành vi ôm COD
            </p>
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
            borderRadius: '10px',
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

      {/* 3. Top KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem',
          marginBottom: '1.5rem'
        }}
      >
        {/* KPI 1: Số tài xế */}
        <div
          className="kpi-card"
          style={{
            background: 'var(--card-bg, #ffffff)',
            padding: '1.25rem',
            borderRadius: '12px',
            border: '1px solid var(--border, #e2e8f0)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <div
            style={{
              padding: '1rem',
              borderRadius: '12px',
              background: 'rgba(242, 101, 34, 0.1)',
              color: 'var(--ghn-orange, #f26522)'
            }}
          >
            <UserCheck size={26} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              TÀI XẾ CẦN XÁC MINH
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.2 }}>
              {kpis.totalDrivers.toLocaleString('vi-VN')}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Theo bộ tiêu chí sàng lọc KAS-221
            </div>
          </div>
        </div>

        {/* KPI 2: Số đơn */}
        <div
          className="kpi-card"
          style={{
            background: 'var(--card-bg, #ffffff)',
            padding: '1.25rem',
            borderRadius: '12px',
            border: '1px solid var(--border, #e2e8f0)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <div
            style={{
              padding: '1rem',
              borderRadius: '12px',
              background: 'rgba(59, 130, 246, 0.1)',
              color: '#3b82f6'
            }}
          >
            <Package size={26} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              TỔNG ĐƠN NGHI VẤN
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.2 }}>
              {kpis.totalOrders.toLocaleString('vi-VN')}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Toàn bộ đơn liên quan của các tài xế
            </div>
          </div>
        </div>

        {/* KPI 3: Tổng COD */}
        <div
          className="kpi-card"
          style={{
            background: 'var(--card-bg, #ffffff)',
            padding: '1.25rem',
            borderRadius: '12px',
            border: '1px solid var(--border, #e2e8f0)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <div
            style={{
              padding: '1rem',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#10b981'
            }}
          >
            <BadgeDollarSign size={26} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              TỔNG TIỀN COD LIÊN QUAN
            </div>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#10b981', lineHeight: 1.2 }}>
              {formatCurrencyVND(kpis.totalCod)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Tiền thu hộ cần đối chiếu kho & khách
            </div>
          </div>
        </div>
      </div>

      {/* 4. Triage Charts Section */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: '1.5rem',
          marginBottom: '1.5rem'
        }}
      >
        {/* Chart 1: Phân bổ theo loại nghi ngờ */}
        <div
          style={{
            background: 'var(--card-bg, #ffffff)',
            padding: '1.25rem',
            borderRadius: '12px',
            border: '1px solid var(--border, #e2e8f0)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
            PHÂN BỔ THEO LOẠI NGHI NGỜ
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            So sánh số đơn và số tài xế giữa "Gối đầu COD" và "Rút ruột"
          </div>

          {typeChartData.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0' }}>
              Không có dữ liệu loại nghi ngờ
            </div>
          ) : (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, height: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeChartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} allowDecimals={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div
                              style={{
                                background: 'var(--card-bg, #1e293b)',
                                border: '1px solid var(--border, #334155)',
                                padding: '0.6rem 0.9rem',
                                borderRadius: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                fontSize: '0.8rem',
                                color: 'var(--text-main)'
                              }}
                            >
                              <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>{data.name}</div>
                              <div>Số đơn nghi vấn: <strong>{data.orders}</strong> đơn</div>
                              <div>Số tài xế liên quan: <strong>{data.drivers}</strong> tài xế</div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="orders" name="Số đơn" radius={[4, 4, 0, 0]}>
                      {typeChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Legend & Summary */}
              <div style={{ width: '160px', paddingLeft: '1rem', borderLeft: '1px solid var(--border)' }}>
                {typeChartData.map(item => (
                  <div key={item.name} style={{ marginBottom: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 600 }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: item.fill }} />
                      <span style={{ color: 'var(--text-main)' }}>{item.name}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '14px', marginTop: '0.1rem' }}>
                      {item.orders} đơn · {item.drivers} tài xế
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chart 2: Top kho giao */}
        <div
          style={{
            background: 'var(--card-bg, #ffffff)',
            padding: '1.25rem',
            borderRadius: '12px',
            border: '1px solid var(--border, #e2e8f0)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
            TOP KHO GIAO CÓ ĐƠN NGHI VẤN
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Xếp hạng theo số đơn nghi vấn (mẫu số: số tài xế liên quan)
          </div>

          {kpis.topWarehouses.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0' }}>
              Không có dữ liệu kho giao
            </div>
          ) : (
            <div style={{ height: '220px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={kpis.topWarehouses.slice(0, 5)}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 30, bottom: 5 }}
                >
                  <XAxis type="number" stroke="var(--text-muted)" fontSize={11} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="warehouse"
                    stroke="var(--text-muted)"
                    fontSize={11}
                    width={130}
                    tickFormatter={(val) => val.replace(/^Kho\s+/i, '')}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div
                            style={{
                              background: 'var(--card-bg, #1e293b)',
                              border: '1px solid var(--border, #334155)',
                              padding: '0.6rem 0.9rem',
                              borderRadius: '8px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              fontSize: '0.8rem',
                              color: 'var(--text-main)'
                            }}
                          >
                            <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>{data.warehouse}</div>
                            <div>Số đơn nghi vấn: <strong>{data.orderCount}</strong> đơn</div>
                            <div>Số tài xế liên quan: <strong>{data.driverCount}</strong> tài xế</div>
                            <div>Tổng COD: <strong>{formatCurrencyVND(data.totalCod)}</strong></div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="orderCount" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* 5. Driver list controls. Filters live in the app header on this tab. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        {/* Actions: Expand / Collapse All */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className="nav-btn-sleek"
            onClick={handleExpandAll}
            disabled={filteredDrivers.length === 0}
            title="Mở rộng xem tất cả đơn của các tài xế"
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem' }}
          >
            Mở rộng tất cả
          </button>
          <button
            type="button"
            className="nav-btn-sleek"
            onClick={handleCollapseAll}
            disabled={filteredDrivers.length === 0 || expandedDrivers.size === 0}
            title="Thu gọn danh sách đơn"
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem' }}
          >
            Thu gọn
          </button>
        </div>
      </div>

      {/* 6. Driver Accordion List */}
      <div className="cod-driver-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                    padding: '1.1rem 1.4rem',
                    background: isExpanded ? 'var(--surface-hover, rgba(0,0,0,0.02))' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    color: 'var(--text-main)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '260px' }}>
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

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
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

                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Kho: {driver.warehouses.join(', ') || 'Chưa rõ kho'}
                      </div>
                    </div>
                  </div>

                  {/* Badges and Metrics on Driver Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Số đơn nghi vấn:</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>
                        {driver.orderCount} đơn
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mức độ cảnh báo:</div>
                      <span style={{ display: 'inline-flex', marginTop: '0.2rem', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, color: driverAlertLevel.color, background: driverAlertLevel.background }}>
                        {driverAlertLevel.label}
                      </span>
                    </div>

                    <div style={{ textAlign: 'right', minWidth: '110px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tổng COD:</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#10b981' }}>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        DANH SÁCH ĐƠN NGHI VẤN LIÊN QUAN ({driver.orders.length} ĐƠN)
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Sắp theo điểm nghi vấn giảm dần
                      </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table
                        style={{
                          width: '100%',
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
