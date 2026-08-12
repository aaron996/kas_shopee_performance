import React, { useState, useEffect } from 'react';
import { Activity, Users, Monitor, ShieldAlert, BarChart2 } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

export default function DevAdminDashboard({ onlineUsers }) {
  const [accessLogs, setAccessLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAccessLogs();
  }, []);

  const fetchAccessLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('access_logs')
        .select('*')
        .order('accessed_at', { ascending: false })
        .limit(300);

      if (error) {
        console.error('Error fetching access logs:', error);
      } else {
        setAccessLogs(data || []);
      }
    } catch (err) {
      console.error('Failed to load logs', err);
    } finally {
      setIsLoading(false);
    }
  };

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
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', background: 'var(--ghn-blue)', padding: '1.5rem', borderRadius: '12px', color: 'white', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
        <ShieldAlert size={32} />
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>CỔNG QUẢN TRỊ DEV ADMIN</h1>
          <p style={{ margin: 0, opacity: 0.8, fontSize: '0.9rem' }}>Theo dõi lưu lượng truy cập và người dùng đang hoạt động theo thời gian thực</p>
        </div>
      </div>
      
      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="kpi-card" style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ padding: '1rem', background: 'rgba(241, 90, 34, 0.1)', color: 'var(--ghn-orange)', borderRadius: '12px' }}>
              <Activity size={28} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>TỔNG LƯỢT TRUY CẬP GẦN ĐÂY</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)' }}>{accessLogs.length}</div>
            </div>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>*Thống kê từ 300 lần truy cập gần nhất</div>
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

      {/* Daily Chart */}
      <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '2rem', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BarChart2 size={18} /> THỐNG KÊ LƯỢT TRUY CẬP (7 NGÀY QUA)
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
                      transition: 'height 1s cubic-bezier(0.16, 1, 0.3, 1)',
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
            LỊCH SỬ TRUY CẬP (300 LẦN GẦN NHẤT)
          </div>
          <div style={{ padding: '1rem', height: '400px', overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0' }}>Đang tải log truy cập...</div>
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
      
    </div>
  );
}
