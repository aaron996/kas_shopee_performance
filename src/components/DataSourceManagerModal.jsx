import React, { useState } from 'react';
import { FileSpreadsheet, Upload, RefreshCw, X, CheckCircle2, AlertCircle } from 'lucide-react';
import Papa from 'papaparse';

export default function DataSourceManagerModal({ 
  isOpen, 
  onClose, 
  onUpdatePickData, 
  onUpdateDeliData, 
  onResetDefault 
}) {
  const [pickTabStatus, setPickTabStatus] = useState('Dữ liệu mặc định (Gid 1312031199)');
  const [deliTabStatus, setDeliTabStatus] = useState('Dữ liệu mặc định (Gid 940798880)');
  const [rawCsvText, setRawCsvText] = useState('');
  const [targetTab, setTargetTab] = useState('pick');
  const [msg, setMsg] = useState('');

  if (!isOpen) return null;

  const handleFileUpload = (e, tabType) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          if (tabType === 'pick') {
            onUpdatePickData(results.data);
            setPickTabStatus(`Đã tải CSV: ${file.name} (${results.data.length} dòng)`);
          } else {
            onUpdateDeliData(results.data);
            setDeliTabStatus(`Đã tải CSV: ${file.name} (${results.data.length} dòng)`);
          }
          setMsg(`Tải tập tin ${file.name} thành công!`);
        }
      },
      error: (err) => {
        setMsg(`Lỗi khi đọc file CSV: ${err.message}`);
      }
    });
  };

  const handleParseRawCsv = () => {
    if (!rawCsvText.trim()) {
      setMsg('Vui lòng dán văn bản CSV vào khung bên dưới.');
      return;
    }

    Papa.parse(rawCsvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          if (targetTab === 'pick') {
            onUpdatePickData(results.data);
            setPickTabStatus(`Đã cập nhật CSV dán (${results.data.length} dòng)`);
          } else {
            onUpdateDeliData(results.data);
            setDeliTabStatus(`Đã cập nhật CSV dán (${results.data.length} dòng)`);
          }
          setMsg(`Dán dữ liệu CSV thành công (${results.data.length} dòng)!`);
          setRawCsvText('');
        }
      }
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileSpreadsheet size={20} />
            Quản Lý Nguồn Dữ Liệu Sheet & CSV
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ background: '#e6f0fa', border: '1px solid #0063AA', padding: '0.85rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
            <div style={{ fontWeight: 700, color: '#004b82', marginBottom: '0.3rem' }}>
              Thông Tin Spreadsheet Đã Lưu Trong Skill:
            </div>
            <div>• <strong>Spreadsheet ID:</strong> <code>1eZCDlKCrZVZAac6j-kBbKPgEmIQcRlTabAFzsl1zwGA</code></div>
            <div>• <strong>Tab 1 (Pick):</strong> Gid <code>1312031199</code> — {pickTabStatus}</div>
            <div>• <strong>Tab 2 (Deli):</strong> Gid <code>940798880</code> — {deliTabStatus}</div>
            <div>• <strong>Tab 3 (Ca1):</strong> Gid <code>1405399014</code></div>
          </div>

          {msg && (
            <div style={{ background: '#EAF3DE', color: '#0F6E56', padding: '0.65rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem', fontWeight: 600 }}>
              {msg}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            {/* Pick CSV Upload */}
            <div style={{ border: '1px dashed #cbd5e1', padding: '1rem', borderRadius: '8px', background: '#f8fafc' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem', color: '#1e293b' }}>
                1. Upload CSV Lấy Hàng (Pick)
              </div>
              <input 
                type="file" 
                accept=".csv" 
                onChange={(e) => handleFileUpload(e, 'pick')}
                style={{ fontSize: '0.8rem' }} 
              />
            </div>

            {/* Deli CSV Upload */}
            <div style={{ border: '1px dashed #cbd5e1', padding: '1rem', borderRadius: '8px', background: '#f8fafc' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem', color: '#1e293b' }}>
                2. Upload CSV Giao Hàng (Deli)
              </div>
              <input 
                type="file" 
                accept=".csv" 
                onChange={(e) => handleFileUpload(e, 'deli')}
                style={{ fontSize: '0.8rem' }} 
              />
            </div>
          </div>

          {/* Dán trực tiếp văn bản CSV */}
          <div style={{ border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '8px' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>3. Hoặc dán trực tiếp dữ liệu CSV từ SQL / Google Sheet:</span>
              <select 
                value={targetTab} 
                onChange={e => setTargetTab(e.target.value)}
                className="filter-select"
                style={{ fontSize: '0.8rem' }}
              >
                <option value="pick">Cập nhật Tab Pick (Lấy hàng)</option>
                <option value="deli">Cập nhật Tab Deli (Giao hàng)</option>
              </select>
            </div>

            <textarea
              className="summary-textarea"
              style={{ height: '140px' }}
              placeholder="Dán nội dung CSV (bao gồm header cột report_date, region, hub, client_name, mau_pu...)..."
              value={rawCsvText}
              onChange={e => setRawCsvText(e.target.value)}
            />

            <button className="btn-secondary" style={{ marginTop: '0.5rem' }} onClick={handleParseRawCsv}>
              <Upload size={14} /> Parse & Áp Dụng Dữ Liệu
            </button>
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button className="btn-secondary" onClick={onResetDefault}>
            <RefreshCw size={14} /> Reset Về Dữ Liệu Chuẩn
          </button>
          
          <button className="nav-btn primary" onClick={onClose}>
            Hoàn Tất
          </button>
        </div>
      </div>
    </div>
  );
}
