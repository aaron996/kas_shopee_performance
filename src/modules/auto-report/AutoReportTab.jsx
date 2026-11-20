import React, { useCallback, useEffect, useState } from 'react';
import LoadingScreen from '../../components/LoadingScreen.jsx';
import { fetchReverseReport } from '../../utils/reverseReportClient.js';
import { ReverseLtcTable, ReverseVolTable, ReverseBacklogTable } from './ReverseReportTables.jsx';
import './reverseReport.css';

// Tab "Báo cáo tự động": xem lại đúng ba bảng được gửi vào group Telegram (SPE Reverse). Không có bộ lọc riêng —
// client cố định, header không hiện Client/Vùng/Loại Hub (scopeSupport.js). docs/reverse-auto-report.md.
// Trạng thái chờ khởi tạo từ render đầu; refresh giữ dữ liệu cũ; lỗi cho thử lại.
export default function AutoReportTab({ dataEnabled = true }) {
  const [state, setState] = useState({ status: dataEnabled ? 'loading' : 'ready', model: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!dataEnabled) return undefined;
    const controller = new AbortController();
    setState(prev => ({ ...prev, status: prev.model ? 'refreshing' : 'loading', error: null }));
    fetchReverseReport(controller.signal)
      .then(model => setState({ status: 'ready', model, error: null }))
      .catch(error => {
        if (controller.signal.aborted) return;
        setState(prev => ({ status: 'error', model: prev.model, error: error.message }));
      });
    return () => controller.abort();
  }, [dataEnabled, attempt]);

  const retry = useCallback(() => setAttempt(n => n + 1), []);
  const { status, model, error } = state;

  if (status === 'loading') return <LoadingScreen variant="page" />;
  if (status === 'error' && !model) {
    return (
      <div className="rar-state" role="alert">
        <p>{error}</p>
        <button type="button" className="popover-text-action" onClick={retry}>Thử lại</button>
      </div>
    );
  }
  return (
    <div className="rar-tab" aria-busy={status === 'refreshing'}>
      {status === 'error' && (
        <div className="rar-state" role="alert">
          <p>{error} Đang hiển thị dữ liệu đã tải trước đó.</p>
          <button type="button" className="popover-text-action" onClick={retry}>Thử lại</button>
        </div>
      )}
      <p className="rar-tab-intro">SPE Reverse · ba bảng gửi vào group Telegram mỗi ngày.</p>
      {model?.tables
        ? <><div className="rar-scroll"><ReverseLtcTable tables={model.tables} /></div><div className="rar-scroll"><ReverseVolTable tables={model.tables} /></div></>
        : <p className="rar-state">Chưa có lịch sử Reverse trong 10 ngày gần nhất.</p>}
      {model?.backlog
        ? <div className="rar-scroll"><ReverseBacklogTable table={model.backlog} /></div>
        : <p className="rar-state">Chưa có snapshot backlog Reverse.</p>}
    </div>
  );
}
