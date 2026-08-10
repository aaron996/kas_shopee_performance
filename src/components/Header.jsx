import React from 'react';
import { Layers, MessageSquareText, Filter, ArrowRightLeft, LogOut, UserCheck, Sun, Moon, Search, Copy, Check } from 'lucide-react';

export default function Header({ 
  activeTab, 
  setActiveTab, 
  clientFilter, 
  setClientFilter, 
  expandAllHubs,
  setExpandAllHubs,
  d1DateFormatted,
  weekNum,
  onOpenSummary, 
  currentUser,
  onLogout,
  isDarkMode,
  setIsDarkMode,
  searchTerm,
  setSearchTerm,
  onCopyZaloQuick
}) {
  const [copiedQuick, setCopiedQuick] = React.useState(false);

  const handleQuickCopy = () => {
    if (onCopyZaloQuick) {
      onCopyZaloQuick();
      setCopiedQuick(true);
      setTimeout(() => setCopiedQuick(false), 2000);
    }
  };

  const tabs = [
    { id: 'report1', label: '1. 4 chỉ số nationwide', desc: 'Ma trận 4 chỉ số toàn quốc', icon: Layers },
    { id: 'report5', label: '2. % Ca 1 theo lane', desc: '% đơn về hub trước 09:00 sáng', icon: ArrowRightLeft }
  ];

  return (
    <header className="navbar">
      <div className="nav-header">
        <div className="brand-title">
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

          {/* Quick Copy Zalo Brief Button */}
          <button 
            className="nav-btn quick-zalo-btn" 
            onClick={handleQuickCopy}
            title="Copy tóm tắt chỉ số D-1 định dạng đẹp mắt gửi nhóm Zalo/Telegram"
          >
            {copiedQuick ? <Check size={15} style={{ color: '#4ADE80' }} /> : <Copy size={15} />}
            <span>{copiedQuick ? 'Đã Copy Zalo!' : 'Copy Zalo Brief'}</span>
          </button>

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

      {/* Sub-header Filter & Search Bar */}
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

          {/* Live Search Input */}
          <div className="search-input-wrapper">
            <Search size={14} className="search-icon" />
            <input 
              type="text" 
              className="search-input" 
              placeholder="Tìm tên Hub, Vùng, Seller..." 
              value={searchTerm || ''}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="clear-search-btn" onClick={() => setSearchTerm('')}>×</button>
            )}
          </div>
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

