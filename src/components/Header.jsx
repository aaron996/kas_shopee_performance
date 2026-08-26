import React, { useState, useRef, useEffect } from 'react';
import { Filter, CheckSquare, Square, Download, MessageSquareText, ShieldCheck, LogOut, RefreshCw, Search, SlidersHorizontal, AlertTriangle } from 'lucide-react';
// Icon DATA cho các nút đổi trạng thái (sync, fullscreen, theme) — morphicons
// chỉ nhận IconNode từ `lucide`, xem src/components/ui/MorphIcon.jsx. Chỉ
// mobile block + fullscreen + theme toggle còn morph; freshness-chip (Zone 2,
// redesign gần đây) không có trạng thái "thành công" bằng icon riêng nên
// không cần morph — RefreshCw/AlertTriangle tĩnh ở đó đủ.
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
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const regionMenuRef = useRef(null);
  const hubTypeMenuRef = useRef(null);
  const viewMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (regionMenuRef.current && !regionMenuRef.current.contains(event.target)) {
        setIsRegionMenuOpen(false);
      }
      if (hubTypeMenuRef.current && !hubTypeMenuRef.current.contains(event.target)) {
        setIsHubTypeMenuOpen(false);
      }
      if (viewMenuRef.current && !viewMenuRef.current.contains(event.target)) {
        setIsViewMenuOpen(false);
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
      <div className="filter-group-sleek">

        {/* Zone 1 — SCOPE: "dữ liệu tôi đang xem là của ai".
            Chỉ nhóm này còn giữ viền: input thì trông như input, còn nút hành
            động ở Zone 3 đều ghost. Bỏ icon + bỏ divider giữa các filter —
            nhãn chữ đã nói đủ, icon chỉ là lớp trang trí thứ ba trên cùng một
            control. */}
        <div className="header-scope">
          <div className="hdr-field">
            <span className="hdr-field-label">Client</span>
            <select
              className="filter-select-sleek"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              aria-label="Chọn client"
            >
              <option value="SPB">SPB</option>
              <option value="SPE">SPE</option>
              <option value="ALL">SPB + SPE</option>
            </select>
          </div>

          {/* Vùng + Loại Hub chỉ áp cho dữ liệu Pick/Deli/Ca1 (grain hub). Tab
              Leadtime ở grain tỉnh-tỉnh, 2 bộ lọc này không tác động gì nên phải
              ẩn thay vì để sáng cho người dùng tưởng đã lọc (audit B9). */}
          {!hideRegionHubFilters && <>
          <div className="hdr-field">
            <span className="hdr-field-label">Vùng</span>
            <div className="custom-dropdown" ref={regionMenuRef}>
              <button
                type="button"
                className={`dropdown-toggle-sleek ${selectedRegions.length !== allRegions.length ? 'is-filtered' : ''}`}
                onClick={() => setIsRegionMenuOpen(!isRegionMenuOpen)}
                aria-expanded={isRegionMenuOpen}
                aria-controls="region-filter-menu"
                title={selectedRegions.length === allRegions.length ? "Đã chọn tất cả vùng" : `Đã chọn ${selectedRegions.length} vùng`}
              >
                <span>{selectedRegions.length === allRegions.length ? "Tất cả" : `${selectedRegions.length} vùng`}</span>
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

          <div className="hdr-field">
            <span className="hdr-field-label">Loại hub</span>
            <div className="custom-dropdown" ref={hubTypeMenuRef}>
              <button
                type="button"
                className={`dropdown-toggle-sleek ${selectedHubTypes.length !== allHubTypes.length ? 'is-filtered' : ''}`}
                onClick={() => setIsHubTypeMenuOpen(!isHubTypeMenuOpen)}
                aria-expanded={isHubTypeMenuOpen}
                aria-controls="hub-type-filter-menu"
                title={selectedHubTypes.length === allHubTypes.length ? "Đã chọn tất cả loại Hub" : `Đã chọn ${selectedHubTypes.length} loại Hub`}
              >
                <span>{selectedHubTypes.length === allHubTypes.length ? "Tất cả" : `${selectedHubTypes.length} loại`}</span>
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

        {/* Zone 2 + 3 — trạng thái dữ liệu rồi mới tới hành động. */}
        <div className="header-actions">

          {/* Zone 2 — FRESHNESS. Trước đây đây là 2 thứ tách rời nói cùng một
              chuyện: dòng chữ "D-1 … · cập nhật 09:21" và nút "Đã đồng bộ".
              Gộp làm một: dòng chữ CHÍNH LÀ nút tải lại, và cũng là nơi báo
              lỗi (chuyển hổ phách) — thay cho .data-retry-warning cũ. */}
          <button
            type="button"
            className={`freshness-chip ${syncStatus?.kind === 'error' ? 'is-error' : ''} ${syncStatus?.kind === 'loading' ? 'is-loading' : ''}`}
            onClick={onRetryData}
            disabled={syncStatus?.kind === 'loading'}
            title={syncStatus?.kind === 'error'
              ? 'Không tải được dữ liệu mới — bấm để thử lại'
              : `Ngày nghiệp vụ D-1${lastSyncedLabel ? `, đồng bộ lúc ${lastSyncedLabel}` : ''} — bấm để tải lại`}
          >
            {syncStatus?.kind === 'loading' ? (
              <RefreshCw size={13} className="is-spinning" />
            ) : syncStatus?.kind === 'error' ? (
              <AlertTriangle size={13} />
            ) : (
              <RefreshCw size={13} className="freshness-chip-idle-icon" />
            )}
            {syncStatus?.kind === 'error' ? (
              <span className="freshness-text">Lỗi tải · Thử lại</span>
            ) : syncStatus?.kind === 'loading' ? (
              <span className="freshness-text">Đang tải…</span>
            ) : (
              <span className="freshness-text">
                D-1 <strong>{d1DateFormatted || '...'}</strong>
                {lastSyncedLabel && <span className="freshness-sub"> · {lastSyncedLabel}</span>}
              </span>
            )}
          </button>

          <span className="header-sep" aria-hidden="true"></span>

          <button className="nav-btn-sleek" onClick={onOpenSummary} title="Nhận Xét D-1 (Summary)">
            <MessageSquareText size={14} /> <span className="nav-btn-label">Nhận xét D-1</span>
          </button>

          <button className="nav-btn-sleek icon-btn" onClick={onOpenPalette} title="Tìm nhanh: tab, client, vùng" aria-label="Tìm nhanh">
            <Search size={14} />
            <kbd className="cmdk-kbd">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>

          {/* Zone 3 — tuỳ chọn HIỂN THỊ gom vào một popover thay vì nằm rải rác
              trên thanh. Mật độ bảng là preference đặt-một-lần, không đáng
              chiếm ~110px thường trực cạnh các hành động chính. */}
          <div className="custom-dropdown view-menu" ref={viewMenuRef}>
            <button
              type="button"
              className={`nav-btn-sleek icon-btn ${isViewMenuOpen ? 'is-open' : ''}`}
              onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
              aria-expanded={isViewMenuOpen}
              aria-controls="view-options-menu"
              title="Tuỳ chọn hiển thị"
              aria-label="Tuỳ chọn hiển thị"
            >
              <SlidersHorizontal size={15} />
            </button>

            {isViewMenuOpen && (
              <div className="dropdown-menu view-menu-panel" id="view-options-menu">
                <div className="dropdown-section-title">Mật độ bảng</div>
                <div className="segmented" role="group" aria-label="Mật độ bảng">
                  <button
                    type="button"
                    className={density === 'comfortable' ? 'active' : ''}
                    aria-pressed={density === 'comfortable'}
                    onClick={() => setDensity('comfortable')}
                  >Thoáng</button>
                  <button
                    type="button"
                    className={density === 'compact' ? 'active' : ''}
                    aria-pressed={density === 'compact'}
                    onClick={() => setDensity('compact')}
                  >Dày</button>
                </div>
              </div>
            )}
          </div>

          {/* Nút "Tải lại" riêng + 2 nút "Nhận Xét D-1"/"Tìm nhanh" trùng lặp +
              density switch cũ đã bị bỏ trong redesign Zone 2/3 (freshness-chip
              + view-menu phía trên đã gộp hết các chức năng này). MorphIcon cho
              sync (B3 trong plan cũ) không còn chỗ để gắn — freshness-chip
              không có trạng thái "thành công" riêng bằng icon nữa. */}
          <button
            className="nav-btn-sleek icon-btn"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Thoát toàn màn hình' : 'Mở rộng toàn màn hình'}
            aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Mở rộng toàn màn hình'}
            aria-pressed={isFullscreen}
          >
            <MorphIcon icon={isFullscreen ? Minimize2Data : Maximize2Data} size={15} />
          </button>

          <button
            className="nav-btn-sleek primary"
            onClick={() => window.dispatchEvent(new CustomEvent('export-csv'))}
            title="Tải bảng dữ liệu dạng CSV"
          >
            <Download size={14} /> <span className="nav-btn-label">Xuất CSV</span>
          </button>

          {/* Mobile-only: the desktop sidebar (theme, dev admin, logout) is
              hidden below 768px, so surface those controls here instead. */}
          <div className="mobile-only-controls">
            <button
              className="nav-btn-sleek icon-btn"
              onClick={() => setIsDarkMode(!isDarkMode)}
              title={isDarkMode ? 'Giao diện Sáng' : 'Giao diện Tối'}
            >
              <MorphIcon icon={isDarkMode ? SunData : MoonData} size={15} />
            </button>

            {currentUser?.isDevAdmin && (
              <button
                className="nav-btn-sleek icon-btn"
                onClick={() => setActiveTab('dev-admin')}
                title="Dev Admin"
                style={{ color: 'var(--status-success-fg)' }}
              >
                <ShieldCheck size={15} />
              </button>
            )}

            <button
              className="nav-btn-sleek icon-btn"
              onClick={onLogout}
              title="Đăng xuất"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>

      </div>
    </header>
  );
}
