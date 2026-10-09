import React, { useEffect, useRef, useState } from 'react';
import { LogOut, Pin, PinOff, UserCheck, ShieldCheck } from 'lucide-react';
import SelectionIndicator from './ui/SelectionIndicator';
import AnimatedIcon from './ui/AnimatedIcon';
import { navigationModules, MODULE_GROUP_LABELS } from '../modules/moduleRegistry.jsx';

export default function Sidebar({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
  isDarkMode,
  setIsDarkMode,
  onOpenPalette
}) {
  const pinStorageKey = currentUser?.email
    ? `ghn_sidebar_pinned:${currentUser.email.trim().toLowerCase()}`
    : null;
  const [isPinned, setIsPinned] = useState(() => {
    try {
      // An account without a saved choice starts expanded and pinned.
      return !pinStorageKey || localStorage.getItem(pinStorageKey) !== 'false';
    } catch {
      return true;
    }
  });
  const [isHovered, setIsHovered] = useState(false);
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false);
  const closeTimer = useRef(null);
  const isCollapsed = !isPinned && !isHovered && !hasKeyboardFocus;

  useEffect(() => {
    if (!pinStorageKey) return;
    try {
      localStorage.setItem(pinStorageKey, String(isPinned));
    } catch {
      // Pinning still works when browser storage is unavailable.
    }
  }, [isPinned, pinStorageKey]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const handlePointerEnter = (event) => {
    if (event.pointerType === 'touch') return;
    clearTimeout(closeTimer.current);
    setIsHovered(true);
  };

  const handlePointerLeave = () => {
    clearTimeout(closeTimer.current);
    // Allow a brief trip outside the panel without flickering shut.
    closeTimer.current = setTimeout(() => setIsHovered(false), 160);
  };

  const handleHomeClick = () => {
    setActiveTab('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const tabs = navigationModules('sidebar', currentUser);
  const groupedTabs = tabs.filter(tab => tab.group);
  const standaloneTabs = tabs.filter(tab => !tab.group);
  const groupOrder = [];
  groupedTabs.forEach(tab => {
    if (!groupOrder.includes(tab.group)) groupOrder.push(tab.group);
  });
  const UserInfo = currentUser?.isDevAdmin ? 'button' : 'div';

  const renderTabButton = (tab) => {
    return (
      <button
        key={tab.id}
        aria-label={tab.label}
        data-tooltip={tab.label}
        data-tooltip-detail={tab.description}
        aria-current={activeTab === tab.id ? 'page' : undefined}
        className={`sidebar-nav-item ${activeTab === tab.id ? 'active' : ''}`}
        onClick={() => setActiveTab(tab.id)}
      >
        <AnimatedIcon name={tab.motionIcon} />
        <span className="nav-label">{tab.label}</span>
      </button>
    );
  };

  return (
    <aside
      id="app-sidebar"
      className={`app-sidebar ${isCollapsed ? 'collapsed' : ''}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      onPointerDownCapture={() => setHasKeyboardFocus(false)}
      onFocusCapture={(event) => {
        if (event.target.matches(':focus-visible')) setHasKeyboardFocus(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHasKeyboardFocus(false);
      }}
    >
      <div className="sidebar-brand-container" style={{ position: 'relative' }}>
        <button type="button" className="sidebar-brand" onClick={handleHomeClick} aria-label="Tổng quan GHN">
          <img
            src="/ghn-icon.svg"
            alt="GHN"
            className="sidebar-logo"
          />
          <div className="sidebar-brand-text">
            <div className="brand-name">GHN</div>
            <div className="brand-subtitle">PERFORMANCE</div>
          </div>
        </button>

        {/* Compact pin control beside the brand. */}
        <button
          type="button"
          className="sidebar-pin-btn"
          onClick={() => setIsPinned(pinned => !pinned)}
          data-tooltip={isPinned ? 'Bỏ ghim thanh bên' : 'Ghim thanh bên'}
          data-tooltip-detail={isPinned ? 'Tự mở khi rê chuột vào, thu lại khi rời chuột' : 'Giữ thanh bên luôn mở'}
          aria-label="Ghim thanh bên"
          aria-controls="app-sidebar"
          aria-pressed={isPinned}
        >
          {isPinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
        </button>
      </div>

      <div className="sidebar-command-search-wrap">
        <button
          type="button"
          className="sidebar-command-search"
          onClick={onOpenPalette}
          data-tooltip="Tìm toàn hệ thống" data-tooltip-detail="Tìm báo cáo, Hub và đơn hàng · Ctrl K"
          aria-label="Tìm toàn hệ thống"
        >
          <AnimatedIcon name="Search" />
          <span>Tìm kiếm</span>
          <kbd className="sidebar-command-kbd">Ctrl K</kbd>
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <SelectionIndicator value={activeTab} collapsed={isCollapsed} />
        {groupOrder.map(group => (
          <div key={group} className="sidebar-nav-group">
            <div className="sidebar-nav-group-title">{MODULE_GROUP_LABELS[group] || group}</div>
            {groupedTabs.filter(tab => tab.group === group).map(renderTabButton)}
          </div>
        ))}
        {/* Mobile ONLY Dev Button */}
        {currentUser?.isDevAdmin && (
          <button
            className={`sidebar-nav-item mobile-only ${activeTab === 'dev-admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('dev-admin')}
            style={{ color: '#4ADE80' }}
          >
            <ShieldCheck size={18} />
            <span title="Dev">Dev</span>
          </button>
        )}
      </nav>

      <div style={{ flex: 1 }}></div>

      {/* Standalone tabs (e.g. BXH) sit right above the footer/theme toggle */}
      {standaloneTabs.length > 0 && (
        <nav className="sidebar-nav sidebar-nav-standalone">
          {standaloneTabs.map(renderTabButton)}
        </nav>
      )}

      {/* Footer Settings & Profile */}
      <div className="sidebar-footer">

        {/* Theme Toggle */}
        <button
          type="button"
          className="sidebar-footer-btn"
          onClick={() => setIsDarkMode(!isDarkMode)}
          aria-label={isDarkMode ? 'Giao diện sáng' : 'Giao diện tối'} data-tooltip={isDarkMode ? 'Giao diện sáng' : 'Giao diện tối'}
          aria-pressed={isDarkMode}
        >
          <AnimatedIcon name={isDarkMode ? "Sun" : "Moon"} />
          <span>{isDarkMode ? 'Sáng' : 'Tối'}</span>
        </button>

        {/* User Profile */}
        {currentUser && (
          <div className="sidebar-user">
            <UserInfo
              className={`user-info-badge ${activeTab === 'dev-admin' ? 'active-admin' : ''}`}
              onClick={currentUser.isDevAdmin ? () => setActiveTab('dev-admin') : undefined}
              {...(currentUser.isDevAdmin ? { type: 'button' } : {})}
              style={{ cursor: currentUser.isDevAdmin ? 'pointer' : 'default', background: activeTab === 'dev-admin' ? 'rgba(74, 222, 128, 0.1)' : '' }}
              title={currentUser.isDevAdmin ? "Mở Dev Panel" : ""}
            >
              <UserCheck size={16} style={{ color: '#4ADE80' }} />
              <div className="user-info-text" style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="user-email">{currentUser.email.split('@')[0]}</span>
                <span className="dev-admin-tag-small">{currentUser.role === 'admin' ? 'ADMIN' : currentUser.isDevAdmin ? 'DEV' : 'USER'}</span>
              </div>
            </UserInfo>
            <button className="logout-btn" onClick={onLogout} title="Đăng xuất">
              <LogOut size={16} />
            </button>
          </div>
        )}

      </div>
    </aside>
  );
}
