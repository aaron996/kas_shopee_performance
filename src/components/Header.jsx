import React, { useState, useRef, useEffect } from 'react';
import { Layers, MessageSquareText, Filter, ArrowRightLeft, LogOut, UserCheck, Sun, Moon, MapPin, CheckSquare, Square } from 'lucide-react';
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
  setIsDarkMode
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

      {/* Tabs Navigation */}
      <div className="nav-tabs">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Sub-header Filter Bar */}
      <div className="filter-bar">
        <div className="filter-group">
          <div className="filter-label">
            <Filter size={15} /> Scope Client:
          </div>
          <select 
            className="filter-select"
            value={clientFilter} 
            onChange={(e) => setClientFilter(e.target.value)}
          >
            <option value="SPB">SPB (Shopee Bulky)</option>
            <option value="SPE">SPE (Shopee Express)</option>
            <option value="ALL">Toàn Bộ Client (SPB + SPE)</option>
          </select>

          {/* Region Multi-select Filter */}
          <div className="filter-label" style={{ marginLeft: '0.5rem' }}>
            <MapPin size={15} /> Vùng:
          </div>
          <div className="custom-dropdown" ref={regionMenuRef}>
            <button 
              className="dropdown-toggle" 
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

          {/* Mở đóng Hub toggle (Chỉ hiển thị với tab 4 chỉ số & Ca làm việc) */}
          {activeTab === 'report1' && (
            <button 
              className={`nav-btn ${expandAllHubs ? 'primary' : ''}`}
              onClick={() => setExpandAllHubs(!expandAllHubs)}
              style={{ padding: '0.4rem 0.8rem', background: expandAllHubs ? 'var(--ghn-blue)' : '#f1f5f9', color: expandAllHubs ? 'white' : '#475569', border: '1px solid #cbd5e1' }}
            >
              {expandAllHubs ? 'Thu Gọn Về Vùng' : 'Mở Tất Cả Hubs'}
            </button>
          )}
        </div>

        <div className="meta-date-info">
          <span>D-1: <strong>{d1DateFormatted || '...'}</strong></span>
          <span>•</span>
          <span>WTD: <strong>Tuần {weekNum || '...'}</strong></span>
        </div>
      </div>
    </header>
  );
}

