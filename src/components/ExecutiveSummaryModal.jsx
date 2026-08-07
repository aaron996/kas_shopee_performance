import React, { useState } from 'react';
import { Copy, Check, MessageSquareText, X } from 'lucide-react';
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
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MessageSquareText size={20} />
            Mẫu Nhận Xét Executive D-1 vs D-8 (Gửi Telegram Group)
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.85rem' }}>
            Đoạn tóm tắt được tự động sinh theo đúng quy chuẩn 06/08/2026 (Không dùng emoji, so sánh D-1 với đúng cùng thứ tuần trước D-8, kèm Top 3 Vùng 1st thấp nhất).
          </p>

          <textarea 
            className="summary-textarea"
            readOnly
            value={summaryText}
          />
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Đóng
          </button>
          <button className="nav-btn primary" onClick={handleCopy}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Đã Sao Chép!' : 'Sao Chép Nội Dung'}
          </button>
        </div>
      </div>
    </div>
  );
}
