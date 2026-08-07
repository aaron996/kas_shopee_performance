import React, { useState } from 'react';
import { FileSpreadsheet, Upload, RefreshCw, X, Radio, ExternalLink } from 'lucide-react';
import Papa from 'papaparse';
import { syncAllGoogleSheetTabs } from '../utils/googleSheetsSync';

export default function DataSourceManagerModal({ 
  isOpen, 
  onClose, 
  onUpdatePickData, 
  onUpdateDeliData, 
  onResetDefault 
}) {
  const [pickTabStatus, setPickTabStatus] = useState('Gid 1312031199');
  const [deliTabStatus, setDeliTabStatus] = useState('Gid 940798880');
  const [rawCsvText, setRawCsvText] = useState('');
  const [targetTab, setTargetTab] = useState('pick');
  const [msg, setMsg] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [customSheetId, setCustomSheetId] = useState('1eZCDlKCrZVZAac6j-kBbKPgEmIQcRlTabAFzsl1zwGA');

  if (!isOpen) return null;

  const handleSyncLive = async () => {
    setIsSyncing(true);
    setMsg('Đang tải dữ liệu trực tiếp từ Google Sheet...');
    
    const res = await syncAllGoogleSheetTabs(customSheetId.trim());
    setIsSyncing(false);

    if (res.success) {
      onUpdatePickData(res.pickData);
      onUpdateDeliData(res.deliData);
      setPickTabStatus(`Live: ${res.pickData.length} dòng`);
      setDeliTabStatus(`Live: ${res.deliData.length} dòng`);
      setMsg(`✓ Đã tải Live thành công ${res.pickData.length} dòng Pick và ${res.deliData.length} dòng Deli!`);
    } else {
      if (res.error === 'FILE_PRIVATE') {
        setMsg('⚠️ Google Sheet đang cài đặt Riêng tư (Private). Vui lòng chuyển sang "Anyone with link can view" (Bất kỳ ai có liên kết đều có thể xem) để ứng dụng tự động đọc live!');
      } else {
        setMsg(`Lỗi kết nối Google Sheet: ${res.error}`);
      }
    }
  };

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
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '780px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileSpreadsheet size={20} />
            Quản Lý Nguồn Dữ Liệu Google Sheet & CSV
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Live Google Sheet Box */}
          <div style={{ background: '#e6f0fa', border: '1px solid #0063AA', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
            <div style={{ fontWeight: 700, color: '#004b82', marginBottom: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>1. Tải Live Trực Tiếp Từ Google Sheet</span>
              <a 
                href={`https://docs.google.com/spreadsheets/d/${customSheetId}/edit`} 
                target="_blank" 
                rel="noreferrer"
                style={{ color: '#0063AA', display: 'flex', alignItems: 'center', gap: '0.2rem', textDecoration: 'none', fontWeight: 'bold' }}
              >
                Mở Google Sheet <ExternalLink size={13} />
              </a>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="text"
                className="filter-input"
                style={{ flex: 1, fontFamily: 'monospace' }}
                value={customSheetId}
                onChange={e => setCustomSheetId(e.target.value)}
                placeholder="Google Spreadsheet ID..."
              />
              <button className="nav-btn primary" onClick={handleSyncLive} disabled={isSyncing}>
                <Radio size={15} /> {isSyncing ? 'Đang Tải...' : 'Sync Live'}
              </button>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
              * Lưu ý: Để kết nối Live tự động, file Google Sheet cần được cài đặt quyền xem <strong>"Anyone with link can view"</strong> (Bất kỳ ai có liên kết đều có thể xem).
            </div>
          </div>

          {msg && (
            <div style={{ 
              background: msg.includes('⚠️') ? '#FEF3C7' : '#EAF3DE', 
              color: msg.includes('⚠️') ? '#92400E' : '#0F6E56', 
              padding: '0.75rem', 
              borderRadius: '6px', 
              marginBottom: '1rem', 
              fontSize: '0.85rem', 
              fontWeight: 600 
            }}>
              {msg}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            {/* Pick CSV Upload */}
            <div style={{ border: '1px dashed #cbd5e1', padding: '1rem', borderRadius: '8px', background: '#f8fafc' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem', color: '#1e293b' }}>
                2. Upload File CSV Pick ({pickTabStatus})
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
                3. Upload File CSV Deli ({deliTabStatus})
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
              <span>4. Dán văn bản CSV copy từ Google Sheet / SQL:</span>
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
              style={{ height: '120px' }}
              placeholder="Dán nội dung CSV (bao gồm header cột report_date, region, hub, client_name, mau_pu...)..."
              value={rawCsvText}
              onChange={e => setRawCsvText(e.target.value)}
            />

            <button className="btn-secondary" style={{ marginTop: '0.5rem' }} onClick={handleParseRawCsv}>
              <Upload size={14} /> Parse & Áp Dụng Dữ Liệu Dán
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
