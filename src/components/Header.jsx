import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckSquare, Download, Filter, Layers, LogOut, MapPin, MessageSquareText, RefreshCw, Rows3, Search, ShieldCheck, Square } from 'lucide-react';
import { Maximize2, Minimize2, Moon, Sun } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { MIEN_REGIONS } from '../data/defaultDataset';

export default function Header({
  setActiveTab, activeTab, clientFilter, setClientFilter,
  selectedRegions, setSelectedRegions, allHubTypes, selectedHubTypes, setSelectedHubTypes,
  onResetFilters, d1DateFormatted, fdD1DateFormatted, syncStatus, lastSyncedAt,
  onOpenSummary, onOpenPalette, currentUser, onLogout, isDarkMode,
  setIsDarkMode, density, setDensity, isFullscreen, setIsFullscreen,
  onRetryData, canExport, exportContext
}) {
  // Vùng/Loại Hub chỉ áp cho dữ liệu grain hub (Report 1/2). Tab Leadtime
  // (grain tỉnh-tỉnh) và tab Insight (nationwide, nối cả 2 grain) đều không
  // bị 2 bộ lọc này tác động — ẩn đi thay vì để sáng cho người dùng tưởng đã
  // lọc (cùng lý do đã áp cho tab Leadtime, xem audit B9).
  const hideRegionHubFilters = activeTab === 'report3' || activeTab === 'report-insight';
  const [isRegionMenuOpen, setIsRegionMenuOpen] = useState(false);
  const [isHubTypeMenuOpen, setIsHubTypeMenuOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const regionMenuRef = useRef(null);
  const hubTypeMenuRef = useRef(null);
  const headerRef = useRef(null);

  const allRegions = useMemo(() => Object.values(MIEN_REGIONS).flat(), []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (regionMenuRef.current && !regionMenuRef.current.contains(event.target)) {
        setIsRegionMenuOpen(false);
      }
      if (hubTypeMenuRef.current && !hubTypeMenuRef.current.contains(event.target)) {
        setIsHubTypeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleRegion = (region) => {
    if (selectedRegions.includes(region)) {
      setSelectedRegions(selectedRegions.filter(r => r !== region));
    } else {
      setSelectedRegions([...selectedRegions, region]);
    }
  };

  const handleToggleAllRegions = () => {
    if (selectedRegions.length === allRegions.length) {
      setSelectedRegions([]);
    } else {
      setSelectedRegions([...allRegions]);
    }
  };

  const handleToggleHubType = (type) => {
    if (selectedHubTypes.includes(type)) {
      setSelectedHubTypes(selectedHubTypes.filter(t => t !== type));
    } else {
      setSelectedHubTypes([...selectedHubTypes, type]);
    }
  };

  const handleToggleAllHubTypes = () => {
    if (selectedHubTypes.length === allHubTypes.length) {
      setSelectedHubTypes([]);
    } else {
      setSelectedHubTypes([...allHubTypes]);
    }
  };
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

  const hasDistinctFdDate = Boolean(fdD1DateFormatted && d1DateFormatted && fdD1DateFormatted !== d1DateFormatted);
  const isLoading = syncStatus?.kind === 'loading';
  const isHealthy = syncStatus?.kind === 'live' || syncStatus?.kind === 'default';
  const freshnessTitle = syncStatus?.kind === 'error'
    ? 'Chưa tải được dữ liệu mới — bấm để thử lại'
    : `Dữ liệu ${hasDistinctFdDate ? `OPS tới ${d1DateFormatted}, FD tới ${fdD1DateFormatted}` : `tới D-1${d1DateFormatted ? ` (${d1DateFormatted})` : ''}`}${lastSyncedLabel ? `, đồng bộ gần nhất ${lastSyncedLabel}` : ''}. Bấm để tải lại.`;

  const syncIcon = isLoading
    ? <RefreshCw size={15} className="is-spinning" />
    : isHealthy
      ? <Check size={15} />
      : <RefreshCw size={15} />;

  return (
    <header ref={headerRef} className={`navbar app-header ${isMobileFiltersOpen ? 'mobile-filters-open' : ''}`}>
      <div className="mobile-header-row">
        <div className="mobile-header-title">
          <strong>BCĐH Shopee</strong>
          <span>Dữ liệu tới {d1DateFormatted || 'đang cập nhật'}{hasDistinctFdDate ? ` (FD: ${fdD1DateFormatted})` : ''}</span>
        </div>
        <div className="mobile-header-actions">
          <button className="mobile-icon-btn" onClick={onRetryData} disabled={isLoading} title={freshnessTitle} aria-label={freshnessTitle}>{syncIcon}</button>
          <button className="mobile-icon-btn" onClick={onOpenSummary} title="Nhận xét D-1" aria-label="Nhận xét D-1"><MessageSquareText size={18} /></button>
          <button className="mobile-icon-btn" onClick={onOpenPalette} title="Chuyển nhanh báo cáo" aria-label="Chuyển nhanh báo cáo"><Search size={18} /></button>
          {supportsExport && <button className="mobile-icon-btn mobile-primary-action" onClick={exportCsv} disabled={!canExport} title={exportLabel} aria-label={exportLabel}><Download size={18} /></button>}
          <button className={`mobile-filter-trigger ${isMobileFiltersOpen ? 'active' : ''}`} onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)} aria-expanded={isMobileFiltersOpen}>
            <Filter size={18} /> <span>Bộ lọc</span>
          </button>
        </div>
      </div>

      <div className="filter-group-sleek">
        <div className="header-scope">
          <button className="command-search-field" onClick={onOpenPalette} title="Chuyển nhanh báo cáo (Cmd/Ctrl+K)" aria-label="Chuyển nhanh báo cáo">
            <Search size={16} />
            <span>Tìm và chuyển báo cáo...</span>
            <kbd className="cmdk-kbd">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>

          {activeTab !== 'report5' && (
            <div className="hdr-field">
              <Filter size={14} className="filter-icon" />
              <span className="hdr-field-label">Client:</span>
              <select
                className="filter-select-sleek"
                aria-label="Client"
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
              >
                <option value="SPB">SPB</option>
                <option value="SPE">SPE</option>
                <option value="ALL">Toàn Bộ (SPB + SPE)</option>
              </select>
            </div>
          )}

          {!hideRegionHubFilters && (
            <div className="custom-dropdown" ref={regionMenuRef}>
              <button
                type="button"
                className={`dropdown-toggle-sleek ${selectedRegions.length !== allRegions.length ? 'is-filtered' : ''}`}
                onClick={() => setIsRegionMenuOpen(!isRegionMenuOpen)}
                aria-expanded={isRegionMenuOpen}
                aria-controls="region-filter-menu"
                title={selectedRegions.length === allRegions.length ? 'Đã chọn tất cả vùng' : `Đã chọn ${selectedRegions.length} vùng`}
              >
                <MapPin size={14} />
                <span>{selectedRegions.length === allRegions.length ? 'Tất Cả Vùng' : `Vùng (${selectedRegions.length})`}</span>
              </button>

              {isRegionMenuOpen && (
                <div className="dropdown-menu" id="region-filter-menu">
                  <button type="button" className="dropdown-header" onClick={handleToggleAllRegions} aria-pressed={selectedRegions.length === allRegions.length}>
                    {selectedRegions.length === allRegions.length ? <CheckSquare size={16} className="chk-icon" /> : <Square size={16} className="chk-icon" />}
                    <span style={{ fontWeight: 600 }}>Chọn tất cả vùng</span>
                  </button>
                  <div className="dropdown-divider"></div>

                  <div className="dropdown-scroll-area">
                    {Object.keys(MIEN_REGIONS).map(mien => (
                      <div key={mien} className="dropdown-section">
                        <div className="dropdown-section-title">{mien}</div>
                        {MIEN_REGIONS[mien].map(reg => (
                          <button type="button" key={reg} className="dropdown-item" onClick={() => handleToggleRegion(reg)} aria-pressed={selectedRegions.includes(reg)}>
                            {selectedRegions.includes(reg) ? <CheckSquare size={15} className="chk-icon" /> : <Square size={15} className="chk-icon" />}
                            <span>{reg}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!hideRegionHubFilters && (
            <div className="custom-dropdown" ref={hubTypeMenuRef}>
              <button
                type="button"
                className={`dropdown-toggle-sleek ${selectedHubTypes.length !== allHubTypes.length ? 'is-filtered' : ''}`}
                onClick={() => setIsHubTypeMenuOpen(!isHubTypeMenuOpen)}
                aria-expanded={isHubTypeMenuOpen}
                aria-controls="hub-type-filter-menu"
                title={selectedHubTypes.length === allHubTypes.length ? 'Đã chọn tất cả loại Hub' : `Đã chọn ${selectedHubTypes.length} loại Hub`}
              >
                <Layers size={14} />
                <span>{selectedHubTypes.length === allHubTypes.length ? 'Tất Cả Loại Hub' : `Loại Hub (${selectedHubTypes.length})`}</span>
              </button>

              {isHubTypeMenuOpen && (
                <div className="dropdown-menu" id="hub-type-filter-menu">
                  <button type="button" className="dropdown-header" onClick={handleToggleAllHubTypes} aria-pressed={selectedHubTypes.length === allHubTypes.length}>
                    {selectedHubTypes.length === allHubTypes.length ? <CheckSquare size={16} className="chk-icon" /> : <Square size={16} className="chk-icon" />}
                    <span style={{ fontWeight: 600 }}>Chọn tất cả loại</span>
                  </button>
                  <div className="dropdown-divider"></div>

                  <div className="dropdown-scroll-area">
                    {allHubTypes.map(type => (
                      <button type="button" key={type} className="dropdown-item" onClick={() => handleToggleHubType(type)} aria-pressed={selectedHubTypes.includes(type)}>
                        {selectedHubTypes.includes(type) ? <CheckSquare size={15} className="chk-icon" /> : <Square size={15} className="chk-icon" />}
                        <span style={{ fontWeight: 500 }}>{type}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="header-actions">
          <button type="button" className={`freshness-chip ${syncStatus?.kind === 'error' ? 'is-error' : ''}`} onClick={onRetryData} disabled={isLoading} title={freshnessTitle}>
            {syncIcon}
            <span>
              Dữ liệu tới <strong>{d1DateFormatted || '...'}</strong>
              {hasDistinctFdDate && (
                <small className="freshness-sub" style={{ marginLeft: '4px', opacity: 0.85 }}>
                  (FD: {fdD1DateFormatted})
                </small>
              )}
            </span>
            {lastSyncedLabel && <span className="freshness-sub">· đồng bộ {lastSyncedLabel}</span>}
          </button>
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
      {isMobileFiltersOpen && <div className="mobile-export-actions">
        {!hideRegionHubFilters && <button type="button" className="nav-btn-sleek" onClick={onResetFilters}>Đặt lại bộ lọc</button>}
        {supportsExport && <>
          <span>{exportContext?.['Phạm vi Client']} · {exportContext?.['Khoảng dữ liệu']}</span>
          <button type="button" className="nav-btn-sleek primary" disabled={!canExport} onClick={exportCsv} title={exportLabel}><Download size={16} /> Xuất CSV</button>
        </>}
      </div>}
    </header>
  );
}
