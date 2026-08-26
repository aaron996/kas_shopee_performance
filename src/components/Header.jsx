import React, { useState, useRef, useEffect } from 'react';
import { Filter, MapPin, CheckSquare, Square, Download, MessageSquareText, Layers, ShieldCheck, LogOut, Search } from 'lucide-react';
// Icon DATA cho các nút đổi trạng thái (sync, fullscreen, theme) — morphicons
// chỉ nhận IconNode từ `lucide`, xem src/components/ui/MorphIcon.jsx.
import {
  Maximize2 as Maximize2Data,
  Minimize2 as Minimize2Data,
  Sun as SunData,
  Moon as MoonData,
  RefreshCw as RefreshCwData,
  Check as CheckData
} from 'lucide';
import MorphIcon from './ui/MorphIcon';
import { MIEN_REGIONS } from '../data/defaultDataset';

export default function Header({
  setActiveTab,
  activeTab,
  clientFilter,
  setClientFilter,
  selectedRegions,
  setSelectedRegions,
  allHubTypes,
  selectedHubTypes,
  setSelectedHubTypes,
  d1DateFormatted,
  syncStatus,
  lastSyncedAt,
  onOpenSummary,
  onOpenPalette,
  currentUser,
  onLogout,
  isDarkMode,
  setIsDarkMode,
  density,
  setDensity,
  isFullscreen,
  setIsFullscreen,
  onRetryData
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

  const allRegions = React.useMemo(() => Object.values(MIEN_REGIONS).flat(), []);

  // Nút "Tải lại" có 3 trạng thái nhưng chỉ 2 hình: đang tải và lỗi đều là
  // RefreshCw (khác nhau ở class quay), xong thì là Check. Tách ra biến để 2
  // bản mobile/desktop bên dưới không lặp lại cùng một ternary 3 lần.
  const syncIsLoading = syncStatus?.kind === 'loading';
  const syncIsDone = syncStatus?.kind === 'live' || syncStatus?.kind === 'default';
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

  // "Cập nhật lúc HH:MM" — trước đây chỉ tab Leadtime hiện giờ đồng bộ
  // (syncedAt riêng của nó), 2 tab còn lại không cho biết số đang xem có mới
  // hay không. Hiện chung ở Header cho MỌI tab, tính từ lần sync THÀNH CÔNG
  // gần nhất (App.jsx: lastSyncedAt), không phải D-1 (ngày nghiệp vụ).
  const lastSyncedLabel = React.useMemo(() => {
    if (!lastSyncedAt) return null;
    const d = lastSyncedAt instanceof Date ? lastSyncedAt : new Date(lastSyncedAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }, [lastSyncedAt]);
  
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

  return (
    <header className={`navbar app-header ${isMobileFiltersOpen ? 'mobile-filters-open' : ''}`}>
      <div className="mobile-header-row">
        <div className="mobile-header-title">
          <strong>BCĐH Shopee</strong>
          <span>D-1: {d1DateFormatted || 'Đang cập nhật'}{lastSyncedLabel ? ` · cập nhật ${lastSyncedLabel}` : ''}</span>
        </div>
        <div className="mobile-header-actions">
          <button className="mobile-icon-btn" onClick={onRetryData} disabled={syncIsLoading} title="Tải lại dữ liệu" aria-label="Tải lại dữ liệu">
            {/* Bỏ .pop-success: keyframe đó chạy từ opacity 0 → 1, tức là
                animation LÚC MOUNT. Giờ icon không remount nữa (cùng một
                <MorphIcon>, chỉ đổi prop icon) nên nó sẽ không bao giờ chạy
                lại — chính cú morph RefreshCw → Check là animation "xong" rồi. */}
            <MorphIcon
              icon={syncIsDone ? CheckData : RefreshCwData}
              size={18}
              className={syncIsLoading ? 'is-spinning' : undefined}
              style={syncIsDone ? { color: '#0F6E56' } : undefined}
            />
          </button>
          <button className="mobile-icon-btn" onClick={onOpenSummary} title="Nhận xét D-1" aria-label="Nhận xét D-1">
            <MessageSquareText size={18} />
          </button>
          <button className="mobile-icon-btn" onClick={onOpenPalette} title="Tìm nhanh" aria-label="Tìm nhanh (tab, client, vùng)">
            <Search size={18} />
          </button>
          <button className={`mobile-filter-trigger ${isMobileFiltersOpen ? 'active' : ''}`} onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)} aria-expanded={isMobileFiltersOpen}>
            <Filter size={18} /> <span>Bộ lọc</span>
          </button>
        </div>
      </div>
      {syncStatus?.kind === 'error' && (
        <div className="mobile-data-error" role="status">
          Không tải được dữ liệu mới. Đang hiển thị dữ liệu gần nhất. <button onClick={onRetryData}>Thử lại</button>
        </div>
      )}
      <div className="filter-group-sleek" style={{ width: '100%', justifyContent: 'space-between' }}>
        
        {/* Left Side: Context / Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <div className="filter-item">
            <Filter size={14} className="filter-icon" />
            <span className="filter-label-text">Client:</span>
            <select 
              className="filter-select-sleek"
              value={clientFilter} 
              onChange={(e) => setClientFilter(e.target.value)}
            >
              <option value="SPB">SPB</option>
              <option value="SPE">SPE</option>
              <option value="ALL">Toàn Bộ (SPB + SPE)</option>
            </select>
          </div>

          {/* Vùng + Loại Hub chỉ áp cho dữ liệu Pick/Deli/Ca1 (grain hub). Tab
              Leadtime ở grain tỉnh-tỉnh, 2 bộ lọc này không tác động gì nên phải
              ẩn thay vì để sáng cho người dùng tưởng đã lọc (audit B9). */}
          {!hideRegionHubFilters && <>
          <div className="filter-divider"></div>

          <div className="filter-item">
            <MapPin size={14} className="filter-icon" />
            <span className="filter-label-text">Vùng:</span>
            <div className="custom-dropdown" ref={regionMenuRef}>
              <button 
                type="button"
                className="dropdown-toggle-sleek" 
                onClick={() => setIsRegionMenuOpen(!isRegionMenuOpen)}
                aria-expanded={isRegionMenuOpen}
                aria-controls="region-filter-menu"
                title={selectedRegions.length === allRegions.length ? "Đã chọn tất cả vùng" : `Đã chọn ${selectedRegions.length} vùng`}
              >
                <span>{selectedRegions.length === allRegions.length ? "Tất Cả Vùng" : `Đã chọn (${selectedRegions.length})`}</span>
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
          </div>

          <div className="filter-divider"></div>

          <div className="filter-item">
            <Layers size={14} className="filter-icon" />
            <span className="filter-label-text">Loại Hub:</span>
            <div className="custom-dropdown" ref={hubTypeMenuRef}>
              <button 
                type="button"
                className="dropdown-toggle-sleek" 
                onClick={() => setIsHubTypeMenuOpen(!isHubTypeMenuOpen)}
                aria-expanded={isHubTypeMenuOpen}
                aria-controls="hub-type-filter-menu"
                title={selectedHubTypes.length === allHubTypes.length ? "Đã chọn tất cả loại Hub" : `Đã chọn ${selectedHubTypes.length} loại Hub`}
              >
                <span>{selectedHubTypes.length === allHubTypes.length ? "Tất Cả Loại" : `Đã chọn (${selectedHubTypes.length})`}</span>
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
          </div>
          </>}

        </div>

        {/* Right Side: View Controls & Export */}
        {/* Layout lives in .header-actions so breakpoints can adjust it — the
            header is a fixed 52px row, so wrapping has to be controlled. */}
        <div className="header-actions">
          <div className="meta-date-sleek">
            <span>D-1: <strong>{d1DateFormatted || '...'}</strong></span>
            {lastSyncedLabel && (
              <span className="meta-synced-at" title="Giờ đồng bộ dữ liệu thành công gần nhất">
                · cập nhật {lastSyncedLabel}
              </span>
            )}
          </div>

          <div className="filter-divider"></div>

          <button
            className={`nav-btn-sleek ${syncStatus?.kind === 'error' ? 'data-retry-warning' : ''}`}
            onClick={onRetryData}
            disabled={syncIsLoading}
            title={syncStatus?.kind === 'error' ? 'Không tải được dữ liệu mới — bấm để thử lại' : 'Tải lại dữ liệu'}
          >
            <MorphIcon
              icon={syncIsDone ? CheckData : RefreshCwData}
              size={14}
              className={syncIsLoading ? 'is-spinning' : undefined}
              style={syncIsDone ? { color: '#0F6E56' } : undefined}
            />
            <span style={{ marginLeft: '0.3rem' }}>
              {syncStatus?.kind === 'error'
                ? 'Thử lại dữ liệu'
                : syncStatus?.kind === 'loading'
                ? 'Đang tải...'
                : syncStatus?.kind === 'live'
                ? 'Đã đồng bộ'
                : 'Tải lại'}
            </span>
          </button>

          <button className="nav-btn-sleek" onClick={onOpenSummary} title="Nhận Xét D-1 (Summary)" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.6rem' }}>
            <MessageSquareText size={14} /> <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>Nhận Xét D-1</span>
          </button>

          <button className="nav-btn-sleek" onClick={onOpenPalette} title="Tìm nhanh: tab, client, vùng (Cmd/Ctrl+K)" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.6rem' }}>
            <Search size={14} /> <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>Tìm nhanh</span>
            <kbd className="cmdk-kbd" style={{ marginLeft: '0.15rem' }}>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>

          <button type="button" className="density-toggle-sleek" onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')} title="Bật để xem dữ liệu dày hơn" role="switch" aria-checked={density === 'compact'}>
             <span className={density === 'comfortable' ? 'active' : ''}>Thoáng</span>
             <div className={`switch ${density === 'compact' ? 'on' : 'off'}`}>
                <div className="slider"></div>
             </div>
             <span className={density === 'compact' ? 'active' : ''}>Dày</span>
          </button>

          <button 
            className="nav-btn-sleek"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Thoát toàn màn hình' : 'Mở rộng toàn màn hình'}
            style={{ padding: '0.25rem 0.4rem' }}
          >
            <MorphIcon icon={isFullscreen ? Minimize2Data : Maximize2Data} size={15} />
          </button>

          <button 
            className="nav-btn-sleek primary"
            onClick={() => window.dispatchEvent(new CustomEvent('export-csv'))}
            title="Tải bảng dữ liệu dạng CSV"
            style={{ background: '#0F6E56', borderColor: '#0F6E56', padding: '0.25rem 0.6rem' }}
          >
            <Download size={14} style={{ marginRight: '0.3rem' }} /> <span>Xuất CSV</span>
          </button>

          {/* Mobile-only: the desktop sidebar (theme, dev admin, logout) is
              hidden below 768px, so surface those controls here instead. */}
          <div className="mobile-only-controls">
            <button
              className="nav-btn-sleek"
              onClick={() => setIsDarkMode(!isDarkMode)}
              title={isDarkMode ? 'Giao diện Sáng' : 'Giao diện Tối'}
              style={{ padding: '0.25rem 0.4rem' }}
            >
              <MorphIcon icon={isDarkMode ? SunData : MoonData} size={15} />
            </button>

            {currentUser?.isDevAdmin && (
              <button
                className="nav-btn-sleek"
                onClick={() => setActiveTab('dev-admin')}
                title="Dev Admin"
                style={{ padding: '0.25rem 0.4rem', color: '#0F6E56' }}
              >
                <ShieldCheck size={15} />
              </button>
            )}

            <button
              className="nav-btn-sleek"
              onClick={onLogout}
              title="Đăng xuất"
              style={{ padding: '0.25rem 0.4rem' }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>

      </div>
    </header>
  );
}
