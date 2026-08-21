import React, { useState, useRef, useEffect } from 'react';
import { Filter, MapPin, CheckSquare, Square, Maximize2, Minimize2, Download, MessageSquareText, Layers, Sun, Moon, ShieldCheck, LogOut, RefreshCw, Check } from 'lucide-react';
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
  onOpenSummary,
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
  const isLeadtimeTab = activeTab === 'report3';
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
          <span>D-1: {d1DateFormatted || 'Đang cập nhật'}</span>
        </div>
        <div className="mobile-header-actions">
          <button className="mobile-icon-btn" onClick={onRetryData} disabled={syncStatus?.kind === 'loading'} title="Tải lại dữ liệu" aria-label="Tải lại dữ liệu">
            {syncStatus?.kind === 'loading' ? (
              <RefreshCw size={18} className="is-spinning" />
            ) : syncStatus?.kind === 'live' || syncStatus?.kind === 'default' ? (
              <Check size={18} className="pop-success" style={{ color: '#0F6E56' }} />
            ) : (
              <RefreshCw size={18} />
            )}
          </button>
          <button className="mobile-icon-btn" onClick={onOpenSummary} title="Nhận xét D-1" aria-label="Nhận xét D-1">
            <MessageSquareText size={18} />
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
          {!isLeadtimeTab && <>
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
          </div>

          <div className="filter-divider"></div>

          <button
            className={`nav-btn-sleek ${syncStatus?.kind === 'error' ? 'data-retry-warning' : ''}`}
            onClick={onRetryData}
            disabled={syncStatus?.kind === 'loading'}
            title={syncStatus?.kind === 'error' ? 'Không tải được dữ liệu mới — bấm để thử lại' : 'Tải lại dữ liệu'}
          >
            {syncStatus?.kind === 'loading' ? (
              <RefreshCw size={14} className="is-spinning" />
            ) : syncStatus?.kind === 'live' || syncStatus?.kind === 'default' ? (
              <Check size={14} className="pop-success" style={{ color: '#0F6E56' }} />
            ) : (
              <RefreshCw size={14} />
            )}
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
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
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
              {isDarkMode ? <Sun size={15} /> : <Moon size={15} />}
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
