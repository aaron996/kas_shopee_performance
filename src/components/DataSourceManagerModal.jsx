import React, { useState } from 'react';
import { FileSpreadsheet, Upload, RefreshCw, X, Radio, ExternalLink, Database } from 'lucide-react';
import Papa from 'papaparse';
import { syncAllGoogleSheetTabs } from '../utils/googleSheetsSync';
import { fetchSupabaseSheetSync } from '../utils/supabaseSheetSync';
import ModalDialog from './ui/ModalDialog';
import StatusNotice from './ui/StatusNotice';

export default function DataSourceManagerModal({
  isOpen,
  onClose,
  onUpdatePickData,
  onUpdateDeliData,
  onUpdateCa1Data,
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

  const handleSyncFromSupabase = async () => {
    setIsSyncing(true);
    setMsg('Đang tải dữ liệu đã đồng bộ từ Supabase (do Apps Script đẩy lên)...');

    const res = await fetchSupabaseSheetSync();
    setIsSyncing(false);

    if (res.success) {
      onUpdatePickData(res.pickData);
      onUpdateDeliData(res.deliData);
      if (res.ca1Data && onUpdateCa1Data) onUpdateCa1Data(res.ca1Data);
      setPickTabStatus(`Supabase: ${res.pickData.length} dòng`);
      setDeliTabStatus(`Supabase: ${res.deliData.length} dòng`);
      setMsg(`✓ Đã tải từ Supabase thành công ${res.pickData.length} dòng Pick và ${res.deliData.length} dòng Deli! (Cập nhật lúc: ${res.updatedAt || 'N/A'})`);
    } else if (res.error === 'NO_SYNCED_DATA') {
      setMsg('⚠️ Chưa có dữ liệu nào trong bảng Supabase "sheet_sync_data". Cần cài Apps Script đồng bộ trước — xem docs/google-sheet-supabase-sync.md.');
    } else {
      setMsg(`Lỗi kết nối Supabase: ${res.error}`);
    }
  };

  const handleSyncLive = async () => {
    setIsSyncing(true);
    setMsg('Đang tải dữ liệu trực tiếp từ Google Sheet (CSV public)...');

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
        setMsg('⚠️ Google Sheet này không còn public ("Anyone with link can view") — GHN đã chặn share ra ngoài nên cách đọc CSV trực tiếp này sẽ không còn hoạt động cho sheet nội bộ. Dùng nút "Sync từ Supabase" ở trên (cần cài Apps Script trước) hoặc upload CSV thủ công ở dưới.');
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
    <ModalDialog isOpen={isOpen} onClose={onClose} titleId="data-source-title" className="data-source-modal-card">
        <div className="modal-header">
          <div id="data-source-title" className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileSpreadsheet size={20} />
            Quản Lý Nguồn Dữ Liệu Google Sheet & CSV
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Đóng quản lý nguồn dữ liệu">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Supabase Sync Box — primary live source */}
          <div style={{ background: 'var(--good-green-bg)', border: '1px solid var(--good-green-text)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
            <div style={{ fontWeight: 700, color: 'var(--good-green-text)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Database size={15} /> 1. Sync Từ Supabase (nguồn Live chính thức)
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
              Apps Script gắn trên Google Sheet tự đẩy dữ liệu vào Supabase theo lịch — không phụ thuộc quyền
              "Anyone with link" đã bị GHN chặn. Xem <code>docs/google-sheet-supabase-sync.md</code> để cài đặt lần đầu.
            </div>
            <button className="nav-btn primary" onClick={handleSyncFromSupabase} disabled={isSyncing}>
              <Database size={15} /> {isSyncing ? 'Đang Tải...' : 'Sync Từ Supabase'}
            </button>
          </div>

          {/* Legacy Live Google Sheet Box (public CSV — only works for sheets still shared "Anyone with link") */}
          <div style={{ background: 'var(--info-box-bg)', border: '1px solid var(--info-box-border)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
            <div style={{ fontWeight: 700, color: 'var(--info-box-text)', marginBottom: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>2. (Legacy) Tải Trực Tiếp Từ Google Sheet Public</span>
              <a 
                href={`https://docs.google.com/spreadsheets/d/${customSheetId}/edit`} 
                target="_blank" 
                rel="noreferrer"
                style={{ color: 'var(--info-box-text)', display: 'flex', alignItems: 'center', gap: '0.2rem', textDecoration: 'none', fontWeight: 'bold' }}
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

            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              * Lưu ý: cách này cần Google Sheet ở chế độ <strong>"Anyone with link can view"</strong> — GHN đã chặn share kiểu này ra ngoài, nên chỉ dùng được cho sheet test/độc lập khác, không dùng được cho sheet nội bộ nữa. Sheet nội bộ hãy dùng mục 1 ở trên.
            </div>
          </div>

          {msg && (
            <StatusNotice
              tone={msg.includes('⚠️') || msg.includes('Lỗi') ? 'warning' : 'success'}
              style={{ marginBottom: '1rem', fontWeight: 600 }}
            >
              {msg}
            </StatusNotice>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            {/* Pick CSV Upload */}
            <div style={{ border: '1px dashed var(--border-strong)', padding: '1rem', borderRadius: '8px', background: 'var(--surface-hover)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                3. Upload File CSV Pick ({pickTabStatus})
              </div>
              <input 
                type="file" 
                accept=".csv" 
                onChange={(e) => handleFileUpload(e, 'pick')}
                style={{ fontSize: '0.8rem' }} 
              />
            </div>

            {/* Deli CSV Upload */}
            <div style={{ border: '1px dashed var(--border-strong)', padding: '1rem', borderRadius: '8px', background: 'var(--surface-hover)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                4. Upload File CSV Deli ({deliTabStatus})
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
          <div style={{ border: '1px solid var(--border)', padding: '1rem', borderRadius: '8px', background: 'var(--surface-hover)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>5. Dán văn bản CSV copy từ Google Sheet / SQL:</span>
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
    </ModalDialog>
  );
}
