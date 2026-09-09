import React, { useEffect, useMemo, useRef } from 'react';
import { Check, Download, LogOut, MessageSquareText, RefreshCw, Rows3, Search, ShieldCheck } from 'lucide-react';
import { Maximize2, Minimize2, Moon, Sun } from 'lucide';
import { MorphIcon } from 'morphicons/react';

export default function Header({
  setActiveTab, activeTab, d1DateFormatted, syncStatus, lastSyncedAt,
  onOpenSummary, onOpenPalette, currentUser, onLogout, isDarkMode,
  setIsDarkMode, density, setDensity, isFullscreen, setIsFullscreen,
  onRetryData, onOpenChat, canExport, exportContext
}) {
  const headerRef = useRef(null);
  const supportsExport = activeTab === 'report1' || activeTab === 'report5';
  const exportCsv = () => window.dispatchEvent(new CustomEvent('export-csv', { detail: exportContext }));
  const exportLabel = `Xuất CSV · ${exportContext?.['Phạm vi Client']} · ${exportContext?.['Khoảng dữ liệu']}`;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return undefined;
    const measure = () => document.documentElement.style.setProperty('--app-header-height', `${header.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--app-header-height');
    };
  }, []);

  const lastSyncedLabel = useMemo(() => {
    if (!lastSyncedAt) return null;
    const date = lastSyncedAt instanceof Date ? lastSyncedAt : new Date(lastSyncedAt);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }, [lastSyncedAt]);

  const isLoading = syncStatus?.kind === 'loading';
  const isHealthy = syncStatus?.kind === 'live' || syncStatus?.kind === 'default';
  const freshnessTitle = syncStatus?.kind === 'error'
    ? 'Chưa tải được dữ liệu mới — bấm để thử lại'
    : `Dữ liệu tới D-1${lastSyncedLabel ? `, đồng bộ gần nhất ${lastSyncedLabel}` : ''}. Bấm để tải lại.`;

  const syncIcon = isLoading
    ? <RefreshCw size={15} className="is-spinning" />
    : isHealthy
      ? <Check size={15} />
      : <RefreshCw size={15} />;

  return (
    <header ref={headerRef} className="navbar app-header">
      <div className="mobile-header-row">
        <div className="mobile-header-title">
          <strong>BCĐH Shopee</strong>
          <span>Dữ liệu tới {d1DateFormatted || 'đang cập nhật'}</span>
        </div>
        <div className="mobile-header-actions">
          <button className="mobile-icon-btn" onClick={onRetryData} disabled={isLoading} title={freshnessTitle} aria-label={freshnessTitle}>{syncIcon}</button>
          {currentUser && <button className="mobile-icon-btn" onClick={onOpenChat} title="Mở Trợ lý KAS" aria-label="Mở Trợ lý KAS"><MessageSquareText size={18} /></button>}
          <button className="mobile-icon-btn" onClick={onOpenSummary} title="Nhận xét D-1" aria-label="Nhận xét D-1"><MessageSquareText size={18} /></button>
          <button className="mobile-icon-btn" onClick={onOpenPalette} title="Chuyển nhanh báo cáo" aria-label="Chuyển nhanh báo cáo"><Search size={18} /></button>
          {supportsExport && <button className="mobile-icon-btn mobile-primary-action" onClick={exportCsv} disabled={!canExport} title={exportLabel} aria-label={exportLabel}><Download size={18} /></button>}
        </div>
      </div>

      <div className="filter-group-sleek">
        <div className="header-scope">
          <button className="command-search-field" onClick={onOpenPalette} title="Chuyển nhanh báo cáo (Cmd/Ctrl+K)" aria-label="Chuyển nhanh báo cáo">
            <Search size={16} />
            <span>Tìm và chuyển báo cáo...</span>
            <kbd className="cmdk-kbd">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
        </div>

        <div className="header-actions">
          <button type="button" className={`freshness-chip ${syncStatus?.kind === 'error' ? 'is-error' : ''}`} onClick={onRetryData} disabled={isLoading} title={freshnessTitle}>
            {syncIcon}
            <span>Dữ liệu tới <strong>{d1DateFormatted || '...'}</strong></span>
            {lastSyncedLabel && <span className="freshness-sub">· đồng bộ {lastSyncedLabel}</span>}
          </button>
          {currentUser && <button type="button" className="nav-btn-sleek chat-trigger" onClick={onOpenChat} title="Mở Trợ lý KAS" aria-label="Mở Trợ lý KAS"><MessageSquareText size={16} /><span className="nav-btn-label">Trợ lý KAS</span></button>}
          <button type="button" className="nav-btn-sleek icon-btn" onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')} title={density === 'compact' ? 'Chuyển sang bảng thoáng' : 'Chuyển sang bảng dày'} aria-label={density === 'compact' ? 'Chuyển sang bảng thoáng' : 'Chuyển sang bảng dày'} aria-pressed={density === 'compact'}>
            <Rows3 size={16} />
          </button>
          <button type="button" className="nav-btn-sleek icon-btn" onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? 'Thoát toàn màn hình' : 'Mở rộng toàn màn hình'} aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Mở rộng toàn màn hình'} aria-pressed={isFullscreen}><MorphIcon icon={isFullscreen ? Minimize2 : Maximize2} size={16} reducedMotion="user" /></button>
          {supportsExport && <button className="nav-btn-sleek primary" onClick={exportCsv} disabled={!canExport} title={exportLabel}><Download size={15} /> <span>Xuất CSV</span></button>}
          <div className="mobile-only-controls">
            <button type="button" className="nav-btn-sleek icon-btn" onClick={() => setIsDarkMode(!isDarkMode)} title={isDarkMode ? 'Giao diện sáng' : 'Giao diện tối'} aria-label={isDarkMode ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} aria-pressed={isDarkMode}><MorphIcon icon={isDarkMode ? Sun : Moon} size={16} reducedMotion="user" /></button>
            {currentUser?.isDevAdmin && <button className="nav-btn-sleek icon-btn" onClick={() => setActiveTab('dev-admin')} title="Dev Admin" aria-label="Dev Admin"><ShieldCheck size={16} /></button>}
            <button className="nav-btn-sleek icon-btn" onClick={onLogout} title="Đăng xuất" aria-label="Đăng xuất"><LogOut size={16} /></button>
          </div>
        </div>
      </div>
    </header>
  );
}
