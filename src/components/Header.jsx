import React from 'react';
import { Layers, MessageSquareText, Filter, ArrowRightLeft, LogOut, UserCheck, Sun, Moon } from 'lucide-react';

export default function Header({ 
  activeTab, 
  setActiveTab, 
  clientFilter, 
  setClientFilter, 
  expandAllHubs,
  setExpandAllHubs,
  onOpenSummary, 
  currentUser,
  onLogout,
  isDarkMode,
  setIsDarkMode
}) {
  const tabs = [
    { id: 'report1', label: '4 chỉ số nationwide', desc: 'Ma trận 4 chỉ số toàn quốc', icon: Layers },
    { id: 'report5', label: '% ca 1 theo lane', desc: '% đơn về hub trước 09:00 sáng', icon: ArrowRightLeft }
  ];

  return (
    <header className="navbar">
      <div className="nav-header">
        <div className="brand-title" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img 
            src="/ghn-logo.png" 
            alt="GHN Logistics" 
            style={{ 
              height: '70px', 
              background: '#ffffff', 
              padding: '6px 12px', 
              borderRadius: '12px', 
              boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              objectFit: 'contain'
            }} 
          />
          <div>
            <div className="brand-name" style={{ fontSize: '1.4rem', fontWeight: 800 }}>Báo Cáo Điều Hành Shopee</div>
          </div>
        </div>

        <div className="nav-actions">
          {currentUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.15)', padding: '0.35rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', border: '1px solid rgba(255,255,255,0.25)' }}>
              <UserCheck size={14} style={{ color: '#4ADE80' }} />
              <span>{currentUser.email}</span>
              {currentUser.isDevAdmin && (
                <span style={{ background: '#F15A22', color: 'white', fontSize: '0.65rem', padding: '0.05rem 0.35rem', borderRadius: '8px', fontWeight: 'bold', marginLeft: '0.2rem' }}>DEV ADMIN</span>
              )}
            </div>
          )}

          {/* Nút Chuyển Đổi Giao Diện Sáng / Tối */}
          <button 
            className="nav-btn" 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            title={isDarkMode ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
            style={{ background: isDarkMode ? '#f59e0b' : 'rgba(255,255,255,0.18)', color: isDarkMode ? '#000' : '#fff', fontWeight: 600, border: 'none' }}
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            <span>{isDarkMode ? 'Giao Diện Sáng' : 'Giao Diện Tối'}</span>
          </button>

          <button className="nav-btn" onClick={onOpenSummary}>
            <MessageSquareText size={16} />
            Nhận Xét D-1 vs D-8
          </button>

          <button className="nav-btn" onClick={onLogout} title="Đăng xuất khỏi tài khoản">
            <LogOut size={15} />
            Đăng Xuất
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
      <div className="filter-bar" style={{ marginTop: '0.75rem', borderRadius: '8px' }}>
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

          {/* Mở đóng Hub toggle (Chỉ hiển thị với tab 4 chỉ số) */}
          {activeTab === 'report1' && (
            <button 
              className={`nav-btn ${expandAllHubs ? 'primary' : ''}`}
              onClick={() => setExpandAllHubs(!expandAllHubs)}
              style={{ marginLeft: '1rem', padding: '0.4rem 0.8rem', background: expandAllHubs ? 'var(--ghn-blue)' : '#f1f5f9', color: expandAllHubs ? 'white' : '#475569', border: '1px solid #cbd5e1' }}
            >
              {expandAllHubs ? 'Thu Gọn Về Vùng' : 'Mở Tất Cả Hubs'}
            </button>
          )}
        </div>

        <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span>D-1: <strong>{d1DateFormatted || '...'}</strong></span>
          <span>•</span>
          <span>Tuần WTD: <strong>Tuần {weekNum || '...'}</strong></span>
        </div>
      </div>
    </header>
  );
}
