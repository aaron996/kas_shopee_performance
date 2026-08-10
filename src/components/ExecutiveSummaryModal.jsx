import React, { useState } from 'react';
import { Copy, Check, MessageSquareText, X, Share2 } from 'lucide-react';
import { generateExecutiveSummary } from '../utils/dataProcessor';

export default function ExecutiveSummaryModal({ isOpen, onClose, pickRows, deliRows, clientFilter }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const summaryText = generateExecutiveSummary(pickRows, deliRows, clientFilter);

  const handleCopy = () => {
    navigator.clipboard.writeText(summaryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '680px', borderRadius: '16px', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* Custom 3D Artwork Banner */}
        <div style={{ position: 'relative', height: '140px', overflow: 'hidden' }}>
          <img 
            src="/summary_banner.jpg" 
            alt="Executive Analytics Summary" 
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, rgba(0,46,84,0.4) 0%, rgba(15,23,42,0.92) 100%)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            color: 'white'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MessageSquareText size={20} style={{ color: '#F15A22' }} />
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
                  Nhận Xét Điều Hành Executive (D-1 vs D-8)
                </h3>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                Báo cáo tóm tắt quy chuẩn Ban Giám Đốc • So sánh D-1 vs D-8 (cùng thứ tuần trước)
              </div>
            </div>
            <button className="modal-close" onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', padding: '0.35rem', borderRadius: '50%', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ padding: '1.25rem' }}>
          <div style={{ background: 'var(--surface-hover, #f8fafc)', border: '1px solid var(--border, #e2e8f0)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--text-muted, #64748b)' }}>
            💡 <strong>Quy chuẩn báo cáo:</strong> So sánh tăng/giảm chỉ số ngày D-1 so với D-8 (cùng thứ tuần trước), tự động trích xuất Top 3 Vùng có tỷ lệ 1st Pickup / Deli thấp nhất. Có thể dán trực tiếp vào nhóm Zalo / Telegram điều hành.
          </div>

          <textarea 
            className="summary-textarea"
            readOnly
            value={summaryText}
            style={{ borderRadius: '10px' }}
          />
        </div>

        <div className="modal-footer" style={{ padding: '0.85rem 1.25rem' }}>
          <button className="btn-secondary" onClick={onClose}>
            Đóng
          </button>
          <button className="nav-btn primary" onClick={handleCopy} style={{ gap: '0.5rem', padding: '0.55rem 1.1rem', borderRadius: '8px' }}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Đã Sao Chép Zalo!' : 'Sao Chép Nội Dung Zalo / Telegram'}
          </button>
        </div>
      </div>
    </div>
  );
}

