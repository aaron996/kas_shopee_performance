import React from 'react';
import { Layers, ArrowRightLeft, LogOut, UserCheck, Sun, Moon, LayoutDashboard, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';

export default function Sidebar({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
  isDarkMode,
  setIsDarkMode,
  onOpenDevAdmin,
  isCollapsed,
  onToggleCollapse
}) {
  const handleHomeClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const tabs = [
    { id: 'report1', label: '1. 4 chỉ số nationwide', icon: Layers },
    { id: 'report5', label: '2. % Ca 1 theo lane', icon: ArrowRightLeft }
  ];

  return (
    <aside className={`app-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand-container" style={{ position: 'relative' }}>
        <div className="sidebar-brand" onClick={handleHomeClick} title="Trở về đầu trang">
          <img 
            src="/ghn-logo.png" 
            alt="GHN" 
            className="sidebar-logo"
          />
          <div className="sidebar-brand-text">
            <div className="brand-name">BCĐH Shopee</div>
            <div className="brand-subtitle">Performance System</div>
          </div>
        </div>
        
        {/* Sidebar Toggle Button at Top Right */}
        <button 
          className="sidebar-toggle-btn top-toggle"
          onClick={onToggleCollapse}
          title={isCollapsed ? "Mở rộng Sidebar" : "Thu gọn Sidebar"}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-nav-title">BÁO CÁO</div>
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`sidebar-nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={18} />
              <span title={tab.label}>{tab.label}</span>
            </button>
          );
        })}
        {/* Mobile ONLY Dev Admin Button */}
        {currentUser?.isDevAdmin && (
          <button
            className="sidebar-nav-item mobile-only"
            onClick={onOpenDevAdmin}
            style={{ color: '#4ADE80' }}
          >
            <ShieldCheck size={18} />
            <span title="Dev Admin">Dev Admin</span>
          </button>
        )}
      </nav>

      <div style={{ flex: 1 }}></div>

      {/* Footer Settings & Profile */}
      <div className="sidebar-footer">
        
        {/* Theme Toggle */}
        <button 
          className="sidebar-footer-btn" 
          onClick={() => setIsDarkMode(!isDarkMode)} 
          title={isDarkMode ? 'Giao diện Sáng' : 'Giao diện Tối'}
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          <span>{isDarkMode ? 'Sáng' : 'Tối'}</span>
        </button>

        {/* User Profile */}
        {currentUser && (
          <div className="sidebar-user">
            <div 
              className="user-info-badge"
              onClick={currentUser.isDevAdmin ? onOpenDevAdmin : undefined}
              style={{ cursor: currentUser.isDevAdmin ? 'pointer' : 'default' }}
              title={currentUser.isDevAdmin ? "Mở Dev Admin Dashboard" : ""}
            >
              <UserCheck size={16} style={{ color: '#4ADE80' }} />
              <div className="user-info-text" style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="user-email">{currentUser.email.split('@')[0]}</span>
                {currentUser.isDevAdmin && (
                  <span className="dev-admin-tag-small">DEV ADMIN</span>
                )}
              </div>
            </div>
            <button className="logout-btn" onClick={onLogout} title="Đăng xuất">
              <LogOut size={16} />
            </button>
          </div>
        )}

      </div>
    </aside>
  );
}
