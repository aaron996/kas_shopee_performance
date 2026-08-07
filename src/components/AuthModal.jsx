import React, { useState } from 'react';
import { ShieldCheck, LogIn, AlertCircle, Lock, Mail, Radio } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

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
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);

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
      return;
    }

    if (!isAllowedEmail(email)) {
      setErrorMsg(`⚠️ Truy cập bị từ chối: Tài khoản "${email}" không thuộc danh sách được phép truy cập hệ thống GHN (@ghn.vn). Vui lòng đăng nhập bằng email GHN.`);
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
    <div className="modal-backdrop" style={{ zIndex: 2000 }}>
      <div className="modal-card" style={{ maxWidth: '460px', padding: '0', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg, #004b82 0%, #0063AA 100%)', padding: '1.5rem', color: 'white', textAlign: 'center' }}>
          <div style={{ background: '#F15A22', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem auto', boxShadow: '0 4px 12px rgba(241, 90, 34, 0.4)' }}>
            <ShieldCheck size={28} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 700 }}>
            Supabase Security Authentication
          </h2>
          <p style={{ fontSize: '0.82rem', opacity: 0.9, marginTop: '0.2rem' }}>
            Đăng nhập tài khoản Google / GHN qua Supabase Auth
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

          {infoMsg && (
            <div style={{ background: '#EAF3DE', border: '1px solid #0F6E56', color: '#0F6E56', padding: '0.85rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.83rem', lineHeight: '1.4', fontWeight: 600 }}>
              {infoMsg}
            </div>
          )}

          {/* Google Sign-In button via Supabase */}
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', fontSize: '0.9rem', marginBottom: '1.25rem', background: '#ffffff', border: '1px solid #cbd5e1', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', fontWeight: 600 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" style={{ marginRight: '0.4rem' }}>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Đăng Nhập Bằng Google (Supabase Auth)
          </button>

          <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8', margin: '0.75rem 0', position: 'relative' }}>
            <span style={{ background: 'white', padding: '0 0.5rem', position: 'relative', zIndex: 1 }}>hoặc đăng nhập bằng Email OTP</span>
            <div style={{ borderBottom: '1px solid #e2e8f0', position: 'absolute', top: '50%', width: '100%', left: 0 }}></div>
          </div>

          <form onSubmit={handleEmailSignIn}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
                Địa chỉ Email:
              </label>
              <input
                type="email"
                className="filter-input"
                style={{ width: '100%', padding: '0.65rem 0.85rem', fontSize: '0.9rem' }}
                placeholder="Nhập địa chỉ email của bạn..."
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                disabled={loading}
              />
            </div>

            <button type="submit" className="nav-btn primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', fontSize: '0.9rem' }}>
              <Mail size={18} /> Gửi Magic Link Đăng Nhập
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
