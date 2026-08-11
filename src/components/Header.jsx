import React, { useState, useRef, useEffect } from 'react';
import { Layers, MessageSquareText, Filter, ArrowRightLeft, LogOut, UserCheck, Sun, Moon, MapPin, CheckSquare, Square, Maximize2, Minimize2, Download } from 'lucide-react';
import { MIEN_REGIONS } from '../data/defaultDataset';

export default function Header({ 
  activeTab, 
  setActiveTab, 
  clientFilter, 
  setClientFilter, 
  selectedRegions,
  setSelectedRegions,
  expandAllHubs,
  setExpandAllHubs,
  d1DateFormatted,
  weekNum,
  onOpenSummary, 
  currentUser,
  onLogout,
  isDarkMode,
  setIsDarkMode,
  density,
  setDensity,
  isFullscreen,
  setIsFullscreen
}) {
  const tabs = [
    { id: 'report1', label: '1. 4 chỉ số nationwide', desc: 'Ma trận 4 chỉ số toàn quốc', icon: Layers },
    { id: 'report5', label: '2. % Ca 1 theo lane', desc: '% đơn về hub trước 09:00 sáng', icon: ArrowRightLeft }
  ];

  const [isRegionMenuOpen, setIsRegionMenuOpen] = useState(false);
  const regionMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (regionMenuRef.current && !regionMenuRef.current.contains(event.target)) {
        setIsRegionMenuOpen(false);
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

  const handleHomeClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="navbar">
      <div className="nav-header">
        <div 
          className="brand-title" 
          onClick={handleHomeClick}
          title="Trở về đầu trang"
        >
          <img 
            src="/ghn-logo.png" 
            alt="GHN Logistics" 
            className="header-brand-logo"
          />
          <div>
            <div className="brand-name">Báo Cáo Điều Hành Shopee</div>
            <div className="brand-subtitle">GHN Performance Management System</div>
          </div>
        </div>

        <div className="nav-actions">
          {currentUser && (
            <div className="user-badge-container">
              <UserCheck size={14} style={{ color: '#4ADE80' }} />
              <span>{currentUser.email}</span>
              {currentUser.isDevAdmin && (
                <span className="dev-admin-tag">DEV ADMIN</span>
              )}
            </div>
          )}

          {/* Theme Toggle Button */}
          <button 
            className="nav-btn theme-toggle-btn" 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            title={isDarkMode ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            <span className="theme-toggle-text">{isDarkMode ? 'Giao Diện Sáng' : 'Giao Diện Tối'}</span>
          </button>

          <button className="nav-btn" onClick={onOpenSummary}>
            <MessageSquareText size={16} />
            <span className="btn-text-responsive">Nhận Xét D-1</span>
          </button>

          <button className="nav-btn" onClick={onLogout} title="Đăng xuất khỏi tài khoản">
            <LogOut size={15} />
            <span className="btn-text-responsive">Đăng Xuất</span>
          </button>
        </div>
      </div>

      {/* Unified Sub-header: Tabs on Left, Filters on Right */}
      <div className="sub-header">
        {/* Tabs Navigation */}
        <div className="nav-tabs-sleek">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`tab-item-sleek ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Filter Controls */}
        <div className="filter-group-sleek">
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

          <div className="filter-divider"></div>

          {/* Region Multi-select Filter */}
          <div className="filter-item">
            <MapPin size={14} className="filter-icon" />
            <span className="filter-label-text">Vùng:</span>
            <div className="custom-dropdown" ref={regionMenuRef}>
              <button 
                className="dropdown-toggle-sleek" 
                onClick={() => setIsRegionMenuOpen(!isRegionMenuOpen)}
                title={selectedRegions.length === allRegions.length ? "Đã chọn tất cả vùng" : `Đã chọn ${selectedRegions.length} vùng`}
              >
                <span>{selectedRegions.length === allRegions.length ? "Tất Cả Vùng" : `Đã chọn (${selectedRegions.length})`}</span>
              </button>

              {isRegionMenuOpen && (
                <div className="dropdown-menu">
                  <div className="dropdown-header" onClick={handleToggleAllRegions}>
                    {selectedRegions.length === allRegions.length ? <CheckSquare size={16} className="chk-icon" /> : <Square size={16} className="chk-icon" />}
                    <span style={{ fontWeight: 600 }}>Chọn tất cả vùng</span>
                  </div>
                  <div className="dropdown-divider"></div>
                  
                  <div className="dropdown-scroll-area">
                    {Object.keys(MIEN_REGIONS).map(mien => (
                      <div key={mien} className="dropdown-section">
                        <div className="dropdown-section-title">{mien}</div>
                        {MIEN_REGIONS[mien].map(reg => (
                          <div key={reg} className="dropdown-item" onClick={() => handleToggleRegion(reg)}>
                            {selectedRegions.includes(reg) ? <CheckSquare size={15} className="chk-icon" /> : <Square size={15} className="chk-icon" />}
                            <span>{reg}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="filter-divider"></div>

          {/* Mở đóng Hub toggle (Chỉ hiển thị với tab 4 chỉ số & Ca làm việc) */}
          {activeTab === 'report1' && (
            <button 
              className={`nav-btn-sleek ${expandAllHubs ? 'primary' : ''}`}
              onClick={() => setExpandAllHubs(!expandAllHubs)}
            >
              {expandAllHubs ? 'Thu Gọn Vùng' : 'Mở Tất Cả Hubs'}
            </button>
          )}

          <div className="meta-date-sleek">
            <span>D-1: <strong>{d1DateFormatted || '...'}</strong></span>
            <span className="dot">•</span>
            <span>WTD: <strong>Tuần {weekNum || '...'}</strong></span>
          </div>

          <div className="filter-divider"></div>

          {/* Density Toggle */}
          <div 
            className="density-toggle-sleek" 
            onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')} 
            title="Bật để xem dữ liệu dày hơn"
          >
             <span className={density === 'comfortable' ? 'active' : ''}>Thoáng</span>
             <div className={`switch ${density === 'compact' ? 'on' : 'off'}`}>
                <div className="slider"></div>
             </div>
             <span className={density === 'compact' ? 'active' : ''}>Dày</span>
          </div>

          {/* Fullscreen & Export */}
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
            <Download size={14} style={{ marginRight: '0.3rem' }} /> <span>Xuất</span>
          </button>
        </div>
      </div>
    </header>
  );
}

