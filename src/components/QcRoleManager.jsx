import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Search, RefreshCw, UserCheck, UserX, AlertCircle, CheckCircle2 } from 'lucide-react';
import { adminListUsersQcRoles, adminSetUserQcRole } from '../utils/codSuspicionClient';
import { formatDateTimeVN } from '../utils/codSuspicionProcessor';

export default function QcRoleManager() {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [processingUserId, setProcessingUserId] = useState(null);

  const fetchUsers = useCallback(async (search = '') => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await adminListUsersQcRoles(search);
      if (res.success) {
        setUsers(res.users || []);
      } else {
        setErrorMsg('Không thể tải danh sách tài khoản. Đảm bảo bạn đang đăng nhập bằng tài khoản Dev Admin (vinhlt@ghn.vn).');
      }
    } catch (err) {
      console.error('Error fetching users in QcRoleManager:', err);
      setErrorMsg('Lỗi kết nối khi tải danh sách người dùng.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchUsers, searchTerm]);

  const handleToggleRole = async (user) => {
    const targetAction = !user.has_qc;
    const confirmText = targetAction
      ? `Bạn có chắc chắn muốn CẤP quyền QC (truy cập module Đơn nghi vấn COD) cho "${user.email}"?`
      : `Bạn có chắc chắn muốn GỠ quyền QC của tài khoản "${user.email}"?`;

    if (!window.confirm(confirmText)) return;

    setProcessingUserId(user.user_id);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await adminSetUserQcRole(user.user_id, user.email, targetAction);
      if (res.success) {
        setSuccessMsg(
          targetAction
            ? `Đã cấp quyền QC thành công cho ${user.email}.`
            : `Đã gỡ quyền QC của ${user.email}.`
        );
        // Refresh list
        fetchUsers(searchTerm);
      } else {
        setErrorMsg(res.error || 'Cập nhật quyền thất bại.');
      }
    } catch (err) {
      console.error('Error updating QC role:', err);
      setErrorMsg('Lỗi thực thi cập nhật quyền.');
    } finally {
      setProcessingUserId(null);
    }
  };

  const qcCount = users.filter(u => u.has_qc).length;

  return (
    <div className="qc-role-manager" style={{ animation: 'fadeIn 0.25s ease-out' }}>
      
      {/* Header Info */}
      <div
        style={{
          background: 'var(--card-bg, #ffffff)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ShieldCheck size={22} color="var(--ghn-orange, #f26522)" />
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
              QUẢN TRỊ QUYỀN QC (KAS-221 ĐƠN NGHI VẤN COD)
            </h2>
          </div>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Chỉ người dùng có role QC mới có thể đọc bảng <code>kas_cod_suspicion_data</code> và thấy tab "Đơn nghi vấn COD".
            Kiểm soát bằng RLS và RPC server-side.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#10b981',
              fontWeight: 700,
              fontSize: '0.85rem'
            }}
          >
            Đang có {qcCount} tài khoản QC
          </div>

          <button
            type="button"
            className="nav-btn-sleek"
            onClick={() => fetchUsers(searchTerm)}
            disabled={isLoading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RefreshCw size={14} className={isLoading ? 'is-spinning' : ''} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Notice Messages */}
      {errorMsg && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#ef4444',
            marginBottom: '1rem',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            color: '#10b981',
            marginBottom: '1rem',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Search Input Bar */}
      <div
        style={{
          background: 'var(--card-bg, #ffffff)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          padding: '1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}
      >
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            className="filter-input-sleek"
            placeholder="Tìm theo email người dùng..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', paddingLeft: '34px', fontSize: '0.88rem' }}
          />
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Hiển thị tối đa 100 tài khoản trong hệ thống
        </span>
      </div>

      {/* Users Table */}
      <div
        style={{
          background: 'var(--card-bg, #ffffff)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--surface-hover, rgba(0,0,0,0.03))', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.8rem 1rem', textAlign: 'left', fontWeight: 700 }}>Email tài khoản</th>
                <th style={{ padding: '0.8rem 1rem', textAlign: 'center', fontWeight: 700 }}>Trạng thái QC</th>
                <th style={{ padding: '0.8rem 1rem', textAlign: 'center', fontWeight: 700 }}>Thời điểm cấp</th>
                <th style={{ padding: '0.8rem 1rem', textAlign: 'left', fontWeight: 700 }}>Người cấp</th>
                <th style={{ padding: '0.8rem 1rem', textAlign: 'right', fontWeight: 700 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && users.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={20} className="is-spinning" style={{ display: 'inline', marginRight: '0.5rem' }} />
                    Đang tải danh sách người dùng...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Không tìm thấy người dùng nào phù hợp.
                  </td>
                </tr>
              ) : (
                users.map(user => {
                  const isProcessing = processingUserId === user.user_id;
                  const isPrimaryDevAdmin = user.email.toLowerCase() === 'vinhlt@ghn.vn';

                  return (
                    <tr
                      key={user.user_id}
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      {/* Email */}
                      <td style={{ padding: '0.8rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ color: 'var(--text-main)' }}>{user.email}</strong>
                          {isPrimaryDevAdmin && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                padding: '0.1rem 0.4rem',
                                borderRadius: '4px',
                                background: 'rgba(74, 222, 128, 0.15)',
                                color: '#16a34a'
                              }}
                            >
                              DEV ADMIN
                            </span>
                          )}
                        </div>
                      </td>

                      {/* QC Status */}
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                        {user.has_qc ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '6px',
                              background: 'rgba(16, 185, 129, 0.12)',
                              color: '#10b981',
                              fontWeight: 700,
                              fontSize: '0.78rem'
                            }}
                          >
                            <UserCheck size={14} />
                            ĐÃ CẤP QC
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '6px',
                              background: 'rgba(0,0,0,0.05)',
                              color: 'var(--text-muted)',
                              fontWeight: 600,
                              fontSize: '0.78rem'
                            }}
                          >
                            Chưa có quyền
                          </span>
                        )}
                      </td>

                      {/* Granted At */}
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {user.granted_at ? formatDateTimeVN(user.granted_at) : (isPrimaryDevAdmin ? 'Mặc định (Seed)' : '-')}
                      </td>

                      {/* Granted By */}
                      <td style={{ padding: '0.8rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {user.granted_by || (isPrimaryDevAdmin ? 'Hệ thống' : '-')}
                      </td>

                      {/* Action Button */}
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'right' }}>
                        {isPrimaryDevAdmin ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Không thể gỡ
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="nav-btn-sleek"
                            onClick={() => handleToggleRole(user)}
                            disabled={isProcessing}
                            style={{
                              fontSize: '0.78rem',
                              padding: '0.35rem 0.75rem',
                              color: user.has_qc ? '#ef4444' : '#10b981',
                              borderColor: user.has_qc ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'
                            }}
                          >
                            {isProcessing ? (
                              'Đang lưu...'
                            ) : user.has_qc ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <UserX size={13} /> Gỡ quyền QC
                              </span>
                            ) : (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <UserCheck size={13} /> Cấp quyền QC
                              </span>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
