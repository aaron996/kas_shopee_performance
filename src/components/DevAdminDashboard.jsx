import React, { useState, useEffect } from 'react';
import { X, Activity, Users, Monitor, Calendar, ShieldAlert } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

export default function DevAdminDashboard({ isOpen, onClose, onlineUsers }) {
  const [accessLogs, setAccessLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchAccessLogs();
    }
  }, [isOpen]);

  const fetchAccessLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('access_logs')
        .select('*')
        .order('accessed_at', { ascending: false })
        .limit(100);

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

  if (!isOpen) return null;

  // Process logs for chart (last 7 days)
  const today = new Date();
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

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{ width: '90%', maxWidth: '1000px', background: 'var(--surface)', color: 'var(--text-main)' }}
      >
        <div className="modal-header" style={{ background: 'var(--ghn-blue)' }}>
          <h2 className="modal-title" style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={20} />
            DEV ADMIN DASHBOARD
          </h2>
          <button className="modal-close" onClick={onClose} style={{ color: 'white' }}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '2rem' }}>
          
          {/* Top KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div className="kpi-card" style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ padding: '0.8rem', background: 'rgba(241, 90, 34, 0.1)', color: 'var(--ghn-orange)', borderRadius: '10px' }}>
                  <Activity size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>TỔNG SỐ LƯỢT TRUY CẬP</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)' }}>{accessLogs.length}</div>
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>*Thống kê từ 100 lần truy cập gần nhất</div>
            </div>

            <div className="kpi-card" style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ padding: '0.8rem', background: 'var(--good-green-bg)', color: 'var(--good-green-text)', borderRadius: '10px' }}>
                  <Users size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>ĐANG ONLINE LÚC NÀY</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--good-green-text)' }}>{onlineUsers.length}</div>
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>*Đang theo dõi qua Realtime Presence</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Online Users List */}
            <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', fontWeight: 700, color: 'var(--text-main)' }}>
                DANH SÁCH USER ONLINE ({onlineUsers.length})
              </div>
              <div style={{ padding: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
                {onlineUsers.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>Không có ai đang online.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {onlineUsers.map((u, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: 'var(--surface-hover)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 5px #10b981' }}></div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>{u.email}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Bắt đầu phiên: {new Date(u.online_at).toLocaleTimeString('vi-VN')}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Access Logs List */}
            <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)', fontWeight: 700, color: 'var(--text-main)' }}>
                LỊCH SỬ TRUY CẬP GẦN NHẤT
              </div>
              <div style={{ padding: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
                {isLoading ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>Đang tải log...</div>
                ) : accessLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>Chưa có lịch sử truy cập (hoặc chưa tạo bảng).</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {accessLogs.slice(0, 50).map((log, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                        <Monitor size={16} color="var(--text-muted)" />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem' }}>{log.email}</div>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {new Date(log.accessed_at).toLocaleString('vi-VN')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
