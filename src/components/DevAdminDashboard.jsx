import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Users, Monitor, ShieldAlert, BarChart2, Download, RefreshCw, Bot } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import AiOperationsDashboard from './AiOperationsDashboard';

const PAGE_SIZE = 1000;

function escapeCsvValue(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function DevAdminDashboard({ onlineUsers }) {
  const [adminTab, setAdminTab] = useState('ai-ops'); // 'ai-ops' | 'access'
  const [accessLogs, setAccessLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    fetchAccessLogs();
  }, []);

  const fetchAccessLogs = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const logs = [];
      for (let page = 0; page < 100; page++) {
        const from = page * PAGE_SIZE;
        const { data, error } = await supabase
          .from('access_logs')
          .select('email, accessed_at, left_at')
          .order('accessed_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        logs.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }
      setAccessLogs(logs);
    } catch (err) {
      console.error('Failed to load logs', err);
      setLoadError('Không thể tải lịch sử truy cập. Kiểm tra quyền Dev Admin trong Supabase rồi thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const userSummary = useMemo(() => {
    const users = new Map();
    accessLogs.forEach((log) => {
      const timestamp = new Date(log.accessed_at).getTime();
      // left_at được ghi qua heartbeat ~60s/lần khi tab còn mở, nên độ dài
      // phiên chỉ là ước lượng (sai số trong khoảng độ dài heartbeat), không
      // phải thời lượng chính xác tới giây.
      const durationMs = log.left_at ? new Date(log.left_at).getTime() - timestamp : null;
      const previous = users.get(log.email);
      if (!previous) {
        users.set(log.email, {
          email: log.email,
          visits: 1,
          firstSeen: timestamp,
          lastSeen: timestamp,
          durationSumMs: durationMs > 0 ? durationMs : 0,
          durationSamples: durationMs > 0 ? 1 : 0,
        });
        return;
      }
      previous.visits += 1;
      previous.firstSeen = Math.min(previous.firstSeen, timestamp);
      previous.lastSeen = Math.max(previous.lastSeen, timestamp);
      if (durationMs > 0) {
        previous.durationSumMs += durationMs;
        previous.durationSamples += 1;
      }
    });
    return [...users.values()]
      .map((user) => ({
        ...user,
        avgDurationMs: user.durationSamples ? user.durationSumMs / user.durationSamples : null,
      }))
      .sort((a, b) => b.lastSeen - a.lastSeen);
  }, [accessLogs]);

  const formatDateTime = (value) => new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short', timeStyle: 'medium'
  }).format(new Date(value));

  const formatDuration = (ms) => {
    if (!ms || ms <= 0) return 'Chưa đủ dữ liệu';
    const totalMinutes = Math.round(ms / 60000);
    if (totalMinutes < 1) return '< 1 phút';
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}g ${minutes}p` : `${minutes} phút`;
  };

  const exportUsers = () => downloadCsv(
    'GHN_danh-sach-nguoi-da-truy-cap.csv',
    ['Email', 'Số lượt truy cập', 'Lần đầu truy cập', 'Lần gần nhất', 'Thời lượng TB/phiên'],
    userSummary.map((user) => [user.email, user.visits, formatDateTime(user.firstSeen), formatDateTime(user.lastSeen), formatDuration(user.avgDurationMs)])
  );

  const exportAccessLogs = () => downloadCsv(
    'GHN_lich-su-truy-cap.csv',
    ['Email', 'Thời điểm truy cập', 'Thời điểm rời trang', 'Thời lượng'],
    accessLogs.map((log) => [
      log.email,
      formatDateTime(log.accessed_at),
      log.left_at ? formatDateTime(log.left_at) : '',
      log.left_at ? formatDuration(new Date(log.left_at).getTime() - new Date(log.accessed_at).getTime()) : '',
    ])
  );

  // Process logs for chart (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();

  const dailyCounts = {};
  last7Days.forEach(date => dailyCounts[date] = 0);
  
  accessLogs.forEach(log => {
    const date = log.accessed_at.split('T')[0];
    if (dailyCounts[date] !== undefined) {
      dailyCounts[date]++;
    }
  });

  const maxCount = Math.max(...Object.values(dailyCounts), 10); // Minimum scale is 10

  return (
    <div className="report-container" style={{ padding: '2rem', animation: 'fadeIn 0.3s ease-out', maxWidth: '1400px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', background: 'var(--ghn-blue)', padding: '1.5rem', borderRadius: '12px', color: 'white', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
        <ShieldAlert size={32} />
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>CỔNG QUẢN TRỊ DEV ADMIN</h1>
          <p style={{ margin: 0, opacity: 0.8, fontSize: '0.9rem' }}>Vận hành Chatbot AI, hạn mức Quota theo user và giám sát lưu lượng hệ thống</p>
        </div>
      </div>

      {/* Main Mode Tabs */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        <button
          type="button"
          onClick={() => setAdminTab('ai-ops')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1.25rem',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: adminTab === 'ai-ops' ? 'var(--ghn-blue)' : 'var(--card-bg)',
            color: adminTab === 'ai-ops' ? 'white' : 'var(--text-main)',
            fontWeight: adminTab === 'ai-ops' ? 700 : 500,
            cursor: 'pointer'
          }}
        >
          <Bot size={18} /> VẬN HÀNH CHATBOT (AI OPERATIONS)
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('access')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1.25rem',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: adminTab === 'access' ? 'var(--ghn-blue)' : 'var(--card-bg)',
            color: adminTab === 'access' ? 'white' : 'var(--text-main)',
            fontWeight: adminTab === 'access' ? 700 : 500,
            cursor: 'pointer'
          }}
        >
          <Activity size={18} /> LƯU LƯỢNG HỆ THỐNG
        </button>
      </div>

      {adminTab === 'ai-ops' ? (
        <AiOperationsDashboard />
      ) : (
        <>
      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="kpi-card" style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ padding: '1rem', background: 'rgba(241, 90, 34, 0.1)', color: 'var(--ghn-orange)', borderRadius: '12px' }}>
              <Activity size={28} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>NGƯỜI ĐÃ TỪNG TRUY CẬP</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)' }}>{userSummary.length}</div>
            </div>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Người dùng duy nhất trong toàn bộ lịch sử tải được</div>
        </div>

        <div className="kpi-card" style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ padding: '1rem', background: 'var(--good-green-bg)', color: 'var(--good-green-text)', borderRadius: '12px' }}>
              <Users size={28} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>ĐANG ONLINE LÚC NÀY</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--good-green-text)' }}>{onlineUsers.length}</div>
            </div>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>*Theo dõi trực tiếp qua Supabase Realtime</div>
        </div>
      </div>

      <section style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '2rem', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }} aria-labelledby="known-users-title">
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <span id="known-users-title">NGƯỜI ĐÃ TỪNG TRUY CẬP ({userSummary.length.toLocaleString('vi-VN')})</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>Sắp theo lần truy cập gần nhất</span>
        </div>
        <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Đang tổng hợp danh sách user...</div>
          ) : loadError ? (
            <div style={{ textAlign: 'center', color: 'var(--status-danger-fg)', padding: '2rem' }}>{loadError}</div>
          ) : userSummary.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Chưa có user nào được ghi nhận.</div>
          ) : userSummary.map((user) => (
            <div key={user.email} className="dev-admin-user-row">
              <div style={{ minWidth: 0 }}>
                <strong className="truncate">{user.email}</strong>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Lần đầu: {formatDateTime(user.firstSeen)} · Gần nhất: {formatDateTime(user.lastSeen)} · TB: {formatDuration(user.avgDurationMs)}/phiên</div>
              </div>
              <span className="data-status data-status--default">{user.visits.toLocaleString('vi-VN')} lượt</span>
            </div>
          ))}
        </div>
      </section>

      {/* Daily Chart */}
      <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '2rem', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><BarChart2 size={18} /> THỐNG KÊ LƯỢT TRUY CẬP (7 NGÀY QUA)</span>
          <div className="dev-admin-actions">
            <button type="button" className="btn-secondary" onClick={fetchAccessLogs} disabled={isLoading}><RefreshCw size={14} /> Làm mới</button>
            <button type="button" className="nav-btn primary" onClick={exportUsers} disabled={!userSummary.length}><Download size={14} /> Xuất danh sách user</button>
            <button type="button" className="btn-secondary" onClick={exportAccessLogs} disabled={!accessLogs.length}><Download size={14} /> Xuất lịch sử</button>
          </div>
        </div>
        <div style={{ padding: '2rem', height: '250px', display: 'flex', alignItems: 'flex-end', gap: '1rem' }}>
          {last7Days.map(date => {
            const count = dailyCounts[date];
            const heightPct = (count / maxCount) * 100;
            const dateObj = new Date(date);
            const dateStr = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
            return (
              <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', height: '100%' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                  <div 
                    title={`${count} lượt truy cập`}
                    style={{ 
                      width: '60%', 
                      maxWidth: '40px',
                      background: 'linear-gradient(to top, var(--ghn-blue), #3b82f6)',
                      borderRadius: '4px 4px 0 0',
                      height: `${Math.max(heightPct, 1)}%`,
                      boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }} 
                  />
                </div>
                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{count}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{dateStr}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        {/* Online Users List */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', fontWeight: 700, color: 'var(--text-main)' }}>
            DANH SÁCH ĐANG ONLINE ({onlineUsers.length})
          </div>
          <div style={{ padding: '1rem', height: '400px', overflowY: 'auto' }}>
            {onlineUsers.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0', fontStyle: 'italic' }}>Không có ai đang online.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {onlineUsers.map((u, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'var(--surface-hover)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981', animation: 'pulse 2s infinite' }}></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>{u.email}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Bắt đầu phiên: {new Date(u.online_at).toLocaleTimeString('vi-VN')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Access Logs List */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', fontWeight: 700, color: 'var(--text-main)' }}>
            LỊCH SỬ TRUY CẬP ({accessLogs.length.toLocaleString('vi-VN')} LƯỢT)
          </div>
          <div style={{ padding: '1rem', height: '400px', overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0' }}>Đang tải log truy cập...</div>
            ) : loadError ? (
              <div style={{ textAlign: 'center', color: 'var(--status-danger-fg)', padding: '3rem 1rem' }}>{loadError}</div>
            ) : accessLogs.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0' }}>Chưa có lịch sử truy cập.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {accessLogs.map((log, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.85rem', borderBottom: '1px solid var(--border)' }}>
                    <Monitor size={18} color="var(--text-muted)" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>{log.email}</div>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                      {new Date(log.accessed_at).toLocaleTimeString('vi-VN')}
                      <div style={{ fontSize: '0.7rem' }}>{new Date(log.accessed_at).toLocaleDateString('vi-VN')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      </>
      )}
      
    </div>
  );
}
