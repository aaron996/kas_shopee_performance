import React from 'react';
import { Layers, FileSpreadsheet, MessageSquareText, RefreshCw, Filter, Search, ArrowRightLeft, Radio } from 'lucide-react';

export default function Header({ 
  activeTab, 
  setActiveTab, 
  clientFilter, 
  setClientFilter, 
  searchTerm, 
  setSearchTerm, 
  onOpenSummary, 
  onOpenDataSource,
  onResetData,
  onSyncLiveSheet,
  isSyncing,
  syncStatus
}) {
  const tabs = [
    { id: 'report1', label: '4 chỉ số nationwide', desc: 'Ma trận 4 chỉ số toàn quốc', icon: Layers },
    { id: 'report5', label: '% ca 1 theo lane', desc: '% đơn về hub trước 09:00 sáng', icon: ArrowRightLeft }
  ];

  return (
    <header className="navbar">
      <div className="nav-header">
        <div className="brand-title">
          <div className="brand-logo">GHN KAS</div>
          <div>
            <div className="brand-name">Báo Cáo Điều Hành Ontime Vùng Giao</div>
            <div className="brand-subtitle">
              GHN Operations System • Sheet: <code>1eZCDlKCrZVZAac...</code>
            </div>
          </div>
        </div>

        <div className="nav-actions">
          <button className="nav-btn primary" onClick={onSyncLiveSheet} disabled={isSyncing}>
            <Radio size={16} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Đang Tải Sheet...' : 'Sync Live Data Google Sheet'}
          </button>

          <button className="nav-btn" onClick={onOpenSummary}>
            <MessageSquareText size={16} />
            Nhận Xét D-1 vs D-8
          </button>
          
          <button className="nav-btn" onClick={onOpenDataSource}>
            <FileSpreadsheet size={16} />
            Quản Lý Nguồn Sheet
          </button>

          <button className="nav-btn" onClick={onResetData} title="Khôi phục dữ liệu mẫu chuẩn">
            <RefreshCw size={15} />
            Reset Sample
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

          <div className="filter-label" style={{ marginLeft: '1rem' }}>
            <Search size={15} /> Tìm kiếm Vùng / Hub:
          </div>
          <input 
            type="text" 
            className="filter-input" 
            placeholder="Gõ mã vùng/hub (vd: HNO, DBB, Cầu Giấy)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '240px' }}
          />
        </div>

        <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span>Status: <strong style={{ color: syncStatus?.isLive ? '#0F6E56' : '#92400E' }}>{syncStatus?.text || 'Ready'}</strong></span>
          <span>•</span>
          <span>D-1: <strong>05/08/2026</strong></span>
          <span>•</span>
          <span>Tuần WTD: <strong>Tuần 32</strong></span>
        </div>
      </div>
    </header>
  );
}
