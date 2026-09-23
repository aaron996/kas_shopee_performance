import React, { useEffect, useState } from 'react';
import { fetchCodSmsThreshold, saveCodSmsThreshold } from '../utils/codSmsThresholdClient.js';

export default function CodSmsThresholdSettings() {
  const [current, setCurrent] = useState(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  async function load() {
    setStatus('loading');
    setMessage('');
    try {
      const value = await fetchCodSmsThreshold();
      setCurrent(value);
      setDraft(String(value.threshold));
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setMessage(error.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function save(value) {
    if (!Number.isInteger(value) || value < 1 || value > 9) {
      setMessage('Mốc điểm SMS phải là số nguyên từ 1 đến 9.');
      return;
    }
    setStatus('saving');
    setMessage('');
    try {
      const saved = await saveCodSmsThreshold(value);
      setCurrent(saved);
      setDraft(String(saved.threshold));
      setStatus('ready');
      setMessage(value === 1 ? 'Đã khôi phục mốc mặc định 1 điểm.' : 'Đã lưu mốc điểm SMS.');
    } catch (error) {
      setStatus('ready');
      setMessage(error.message);
    }
  }

  return (
    <section className="cod-threshold-settings" aria-labelledby="cod-threshold-title">
      <h2 id="cod-threshold-title">Mốc điểm SMS để nâng mức nghi ngờ</h2>
      <p>Chỉ áp dụng khi mức theo SQL là Vừa. Đổi mốc không chấm SMS lại hoặc thay điểm đã lưu.</p>
      {status === 'loading' && <p role="status">Đang tải mốc đang áp dụng…</p>}
      {status === 'error' && <p role="alert">{message} <button type="button" onClick={load}>Thử lại</button></p>}
      {current && status !== 'error' && status !== 'loading' && (
        <>
          <p>Mốc đang áp dụng: <strong>{current.threshold} điểm</strong></p>
          <p className="cod-threshold-meta">{current.updatedAt ? `Cập nhật: ${new Date(current.updatedAt).toLocaleString('vi-VN')}` : 'Mặc định'}{current.updatedBy ? ` · Người sửa: ${current.updatedBy}` : ''}</p>
          <label htmlFor="cod-sms-threshold-input">Mốc mới (1–9)</label>
          <div className="cod-threshold-actions">
            <input id="cod-sms-threshold-input" type="number" min="1" max="9" step="1" value={draft} disabled={status === 'saving'} onChange={event => { setDraft(event.target.value); setMessage(''); }} />
            <button type="button" className="nav-btn primary" disabled={status === 'saving' || draft === String(current.threshold)} onClick={() => save(Number(draft))}>Lưu</button>
            <button type="button" className="btn-secondary" disabled={status === 'saving' || current.threshold === 1} onClick={() => save(1)}>Khôi phục mặc định</button>
          </div>
          {status === 'saving' && <p role="status">Đang lưu…</p>}
          {message && <p role="status">{message}</p>}
        </>
      )}
    </section>
  );
}
