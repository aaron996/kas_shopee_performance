import React, { useState, useEffect } from 'react';
import { ShieldCheck, LogIn, AlertCircle, UserCheck, Lock } from 'lucide-react';

const ADMIN_DEVS = ['luongthevinh996@gmail.com', 'vinhlt@ghn.vn'];

export function isAllowedEmail(email) {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  return cleanEmail.endsWith('@ghn.vn') || cleanEmail === 'luongthevinh996@gmail.com';
}

export function isDevAdminEmail(email) {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  return ADMIN_DEVS.includes(cleanEmail);
}

export default function AuthModal({ isOpen, onLoginSuccess }) {
  const [emailInput, setEmailInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    const email = emailInput.trim().toLowerCase();
    if (!email) {
      setErrorMsg('Vui lòng nhập địa chỉ Google / GHN Email của bạn.');
      return;
    }

    if (!isAllowedEmail(email)) {
      setErrorMsg(`⚠️ Truy cập bị từ chối: Tài khoản "${email}" không thuộc danh sách được phép truy cập hệ thống GHN (@ghn.vn). Vui lòng đăng nhập bằng email GHN.`);
      return;
    }

    const userData = {
      email,
      name: email.split('@')[0],
      isDevAdmin: isDevAdminEmail(email),
      loggedInAt: new Date().toISOString()
    };

    localStorage.setItem('ghn_user', JSON.stringify(userData));
    onLoginSuccess(userData);
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 2000 }}>
      <div className="modal-card" style={{ maxWidth: '460px', padding: '0', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg, #004b82 0%, #0063AA 100%)', padding: '1.5rem', color: 'white', textAlign: 'center' }}>
          <div style={{ background: '#F15A22', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem auto', boxShadow: '0 4px 12px rgba(241, 90, 34, 0.4)' }}>
            <ShieldCheck size={28} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 700 }}>
            GHN KAS System Authentication
          </h2>
          <p style={{ fontSize: '0.82rem', opacity: 0.9, marginTop: '0.2rem' }}>
            Đăng nhập tài khoản Google / GHN để xem Báo Cáo Điều Hành
          </p>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {errorMsg && (
            <div style={{ background: '#F7D9D4', border: '1px solid #E8362C', color: '#A13B2A', padding: '0.85rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.83rem', lineHeight: '1.4' }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                <AlertCircle size={16} /> Từ Chối Truy Cập
              </div>
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleLoginSubmit}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
                Email Google / GHN Work Account:
              </label>
              <input
                type="email"
                className="filter-input"
                style={{ width: '100%', padding: '0.65rem 0.85rem', fontSize: '0.9rem' }}
                placeholder="vd: vinhlt@ghn.vn hoặc luongthevinh996@gmail.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '1.25rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 600, color: '#004b82', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Lock size={13} /> Quy định bảo mật truy cập:
              </div>
              • Hệ thống chỉ cho phép email có đuôi <strong>@ghn.vn</strong> và tài khoản Dev (<code>luongthevinh996@gmail.com</code>).
              <br />
              • Quyền <strong>Quản Lý Nguồn Sheet</strong> chỉ dành cho tài khoản Admin/Dev.
            </div>

            <button type="submit" className="nav-btn primary" style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', fontSize: '0.95rem' }}>
              <LogIn size={18} /> Đăng Nhập Hệ Thống GHN
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
