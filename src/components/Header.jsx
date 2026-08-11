import React, { useState, useRef, useEffect } from 'react';
import { Filter, MapPin, CheckSquare, Square, Maximize2, Minimize2, Download, MessageSquareText, Layers } from 'lucide-react';
import { MIEN_REGIONS } from '../data/defaultDataset';

export default function Header({ 
  activeTab, 
  clientFilter, 
  setClientFilter, 
  selectedRegions,
  setSelectedRegions,
  allHubTypes,
  selectedHubTypes,
  setSelectedHubTypes,
  expandAllHubs,
  setExpandAllHubs,
  d1DateFormatted,
  weekNum,
  onOpenSummary, 
  density,
  setDensity,
  isFullscreen,
  setIsFullscreen
}) {
  const [isRegionMenuOpen, setIsRegionMenuOpen] = useState(false);
  const [isHubTypeMenuOpen, setIsHubTypeMenuOpen] = useState(false);
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
    <header className="navbar app-header">
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

          <div className="filter-divider"></div>

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

          <div className="filter-item">
            <Layers size={14} className="filter-icon" />
            <span className="filter-label-text">Loại Hub:</span>
            <div className="custom-dropdown" ref={hubTypeMenuRef}>
              <button 
                className="dropdown-toggle-sleek" 
                onClick={() => setIsHubTypeMenuOpen(!isHubTypeMenuOpen)}
                title={selectedHubTypes.length === allHubTypes.length ? "Đã chọn tất cả loại Hub" : `Đã chọn ${selectedHubTypes.length} loại Hub`}
              >
                <span>{selectedHubTypes.length === allHubTypes.length ? "Tất Cả Loại" : `Đã chọn (${selectedHubTypes.length})`}</span>
              </button>

              {isHubTypeMenuOpen && (
                <div className="dropdown-menu">
                  <div className="dropdown-header" onClick={handleToggleAllHubTypes}>
                    {selectedHubTypes.length === allHubTypes.length ? <CheckSquare size={16} className="chk-icon" /> : <Square size={16} className="chk-icon" />}
                    <span style={{ fontWeight: 600 }}>Chọn tất cả loại</span>
                  </div>
                  <div className="dropdown-divider"></div>
                  
                  <div className="dropdown-scroll-area">
                    {allHubTypes.map(type => (
                      <div key={type} className="dropdown-item" onClick={() => handleToggleHubType(type)}>
                        {selectedHubTypes.includes(type) ? <CheckSquare size={15} className="chk-icon" /> : <Square size={15} className="chk-icon" />}
                        <span style={{ fontWeight: 500 }}>{type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Side: View Controls & Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <div className="meta-date-sleek">
            <span>D-1: <strong>{d1DateFormatted || '...'}</strong></span>
          </div>

          <div className="filter-divider"></div>

          <button className="nav-btn-sleek" onClick={onOpenSummary} title="Nhận Xét D-1 (Summary)" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.6rem' }}>
            <MessageSquareText size={14} /> <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>Nhận Xét D-1</span>
          </button>

          <div className="density-toggle-sleek" onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')} title="Bật để xem dữ liệu dày hơn">
             <span className={density === 'comfortable' ? 'active' : ''}>Thoáng</span>
             <div className={`switch ${density === 'compact' ? 'on' : 'off'}`}>
                <div className="slider"></div>
             </div>
             <span className={density === 'compact' ? 'active' : ''}>Dày</span>
          </div>

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
            <Download size={14} style={{ marginRight: '0.3rem' }} /> <span>Xuất Excel</span>
          </button>
        </div>

      </div>
    </header>
  );
}
