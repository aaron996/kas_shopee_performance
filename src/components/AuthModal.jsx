import React, { useRef, useState } from 'react';
import { ShieldCheck, AlertCircle, Mail } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import ModalDialog from './ui/ModalDialog';
import StatusNotice from './ui/StatusNotice';

// This controls navigation only. Supabase RLS is the authority that protects
// the Dev Admin data; keep the email check here in sync with its SQL policy.
const DEV_ADMIN_EMAIL = 'vinhlt@ghn.vn';

export function isAllowedEmail(email) {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  return cleanEmail.endsWith('@ghn.vn') || cleanEmail === 'luongthevinh996@gmail.com';
}

export function isDevAdminEmail(email) {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  return cleanEmail === DEV_ADMIN_EMAIL;
}

export default function AuthModal({ isOpen }) {
  const [emailInput, setEmailInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const emailInputRef = useRef(null);

  const triggerShake = () => {
    setIsShaking(true);
    window.setTimeout(() => setIsShaking(false), 400);
  };

  if (!isOpen) return null;

  // Supabase Google OAuth Login
  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (err) {
      setErrorMsg(`Lỗi đăng nhập Google Supabase: ${err.message}`);
      triggerShake();
      setLoading(false);
    }
  };

  // Supabase Email OTP / Passwordless Login
  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const email = emailInput.trim().toLowerCase();
    if (!email) {
      setErrorMsg('Vui lòng nhập địa chỉ email GHN của bạn.');
      triggerShake();
      return;
    }

    if (!isAllowedEmail(email)) {
      setErrorMsg(`⚠️ Truy cập bị từ chối: Tài khoản "${email}" không thuộc danh sách được phép truy cập hệ thống GHN (@ghn.vn). Vui lòng đăng nhập bằng email GHN.`);
      triggerShake();
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin
        }
      });
      if (error) throw error;

      setInfoMsg(`✓ Đã gửi mã liên kết đăng nhập an toàn tới "${email}". Vui lòng kiểm tra hộp thư email của bạn để hoàn tất xác thực Supabase!`);
    } catch (err) {
      setErrorMsg(`Lỗi Supabase Auth: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      dismissible={false}
      initialFocusRef={emailInputRef}
      titleId="auth-dialog-title"
      className={`auth-modal-card ${isShaking ? 'shake-error' : ''}`}
    >
        {/* Custom 3D Artwork Banner */}
        <div style={{ position: 'relative', height: '170px', overflow: 'hidden' }}>
          <img 
            src="/auth_banner.jpg" 
            alt="GHN Smart Logistics Hub" 
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, rgba(0,75,130,0.35) 0%, rgba(11,19,41,0.92) 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '1.25rem 1.5rem',
            color: 'white'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
              <div style={{ background: '#F15A22', padding: '0.4rem', borderRadius: '8px', display: 'flex' }}>
                <ShieldCheck size={20} color="white" />
              </div>
              <h2 id="auth-dialog-title" style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>
                Hệ Thống Báo Cáo Điều Hành
              </h2>
            </div>
            <p style={{ fontSize: '0.82rem', opacity: 0.9, color: '#e2e8f0' }}>
              Xác thực quyền truy cập GHN Restricted (@ghn.vn) qua Supabase Auth
            </p>
          </div>
        </div>

        <div style={{ padding: '1.5rem', background: 'var(--surface)' }}>
          {errorMsg && (
            <StatusNotice tone="danger" style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                <AlertCircle size={16} /> Từ Chối Truy Cập
              </div>
              {errorMsg}
            </StatusNotice>
          )}

          {infoMsg && (
            <StatusNotice tone="success" style={{ marginBottom: '1.25rem', fontWeight: 600 }}>
              {infoMsg}
            </StatusNotice>
          )}

          {/* Google Sign-In button via Supabase */}
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', fontSize: '0.9rem', marginBottom: '1.25rem', background: 'var(--surface-hover)', border: '1px solid var(--border-strong)', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', fontWeight: 600, color: 'var(--text-main)', borderRadius: '10px' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" style={{ marginRight: '0.5rem' }}>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Đăng Nhập Bằng Email GHN Google
          </button>

          <div style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.85rem 0', position: 'relative' }}>
            <span style={{ background: 'var(--surface)', padding: '0 0.6rem', position: 'relative', zIndex: 1, color: 'var(--text-muted)' }}>hoặc nhận link OTP qua Email</span>
            <div style={{ borderBottom: '1px solid var(--border)', position: 'absolute', top: '50%', width: '100%', left: 0 }}></div>
          </div>

          <form onSubmit={handleEmailSignIn}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="auth-email" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main, #334155)', marginBottom: '0.4rem' }}>
                Địa chỉ Email GHN:
              </label>
              <input
                ref={emailInputRef}
                id="auth-email"
                type="email"
                className="filter-input"
                style={{ width: '100%', padding: '0.65rem 0.85rem', fontSize: '0.9rem', borderRadius: '8px' }}
                placeholder="Ví dụ: vinhlt@ghn.vn..."
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                disabled={loading}
              />
            </div>

            <button type="submit" className="nav-btn primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', fontSize: '0.9rem', borderRadius: '10px' }}>
              <Mail size={18} /> Gửi Magic Link Đăng Nhập
            </button>
          </form>
        </div>
    </ModalDialog>
  );
}
