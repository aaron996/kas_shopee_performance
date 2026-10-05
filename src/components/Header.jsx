import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Filter, LogOut, MapPin, ShieldCheck, Warehouse } from 'lucide-react';
import IconButton from './ui/IconButton';
import MultiSelectDropdown from './ui/MultiSelectDropdown';
import HeaderPopover from './ui/HeaderPopover';
import { MIEN_REGIONS } from '../data/defaultDataset';

export default function Header({
  setActiveTab, activeTab, clientFilter, setClientFilter,
  selectedRegions, setSelectedRegions, allHubTypes, selectedHubTypes, setSelectedHubTypes,
  onResetFilters, d1DateFormatted, fdD1DateFormatted, syncStatus, lastSyncedAt,
  onOpenSummary, onOpenPalette, currentUser, onLogout, isDarkMode,
  setIsDarkMode, density, setDensity, isFullscreen, setIsFullscreen,
  onRetryData, canExport, exportContext, codSuspicionFilters, setCodSuspicionFilters, codSuspicionWarehouses, codSuspicionProvinces
}) {
  const hideRegionHubFilters = ['report3', 'report-insight', 'cod-suspicion'].includes(activeTab);
  const [popover, setPopover] = useState(null);
  const headerRef = useRef(null);
  const allRegions = useMemo(() => Object.values(MIEN_REGIONS).flat(), []);
  const supportsExport = ['home', 'report1', 'report5'].includes(activeTab);
  const exportCsv = () => window.dispatchEvent(new CustomEvent('open-export-dialog', { detail: exportContext }));
  const exportLabel = `Xuất CSV · ${exportContext?.['Phạm vi Client']} · ${exportContext?.['Khoảng dữ liệu']}`;
  useEffect(() => { setPopover(null); }, [activeTab]);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return undefined;
    const measure = () => document.documentElement.style.setProperty('--app-header-height', `${header.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--app-header-height'); };
  }, []);
  const lastSyncedLabel = useMemo(() => {
    if (!lastSyncedAt) return null;
    const date = lastSyncedAt instanceof Date ? lastSyncedAt : new Date(lastSyncedAt);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }, [lastSyncedAt]);
  const hasDistinctFdDate = Boolean(fdD1DateFormatted && d1DateFormatted && fdD1DateFormatted !== d1DateFormatted);
  const isLoading = syncStatus?.kind === 'loading';
  const syncSummary = isLoading ? 'Đang đồng bộ dữ liệu' : syncStatus?.kind === 'error' ? 'Chưa tải được dữ liệu mới' : `Dữ liệu tới ${d1DateFormatted || 'chưa xác định'}`;
  const toggle = (value, selected, setter) => setter(selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value]);
  const regionSummary = selectedRegions.length === allRegions.length ? 'Tất cả vùng' : selectedRegions.length ? `${selectedRegions.length}/${allRegions.length} vùng được chọn` : 'Chưa chọn vùng nào';
  const hubSummary = selectedHubTypes.length === allHubTypes.length ? 'Tất cả loại Hub' : selectedHubTypes.length ? `${selectedHubTypes.length}/${allHubTypes.length} loại Hub được chọn` : 'Chưa chọn loại Hub nào';
  const sharedPopover = { state: popover, setState: setPopover };
  return <header ref={headerRef} className="navbar app-header compact-header">
    <div className="compact-mobile-brand"><strong>BCĐH Shopee</strong><div className="compact-mobile-settings">
      <IconButton icon={isDarkMode ? 'Sun' : 'Moon'} label={isDarkMode ? 'Giao diện sáng' : 'Giao diện tối'} onClick={() => setIsDarkMode(!isDarkMode)} />
      {currentUser?.isDevAdmin && <button className="nav-btn-sleek icon-btn" aria-label="Dev Admin" onClick={() => setActiveTab('dev-admin')}><ShieldCheck size={18} /></button>}
      <button className="nav-btn-sleek icon-btn" aria-label="Đăng xuất" onClick={onLogout}><LogOut size={18} /></button>
    </div></div>
    <div className="compact-header-toolbar">
      {activeTab !== 'cod-suspicion' && <div className="scope-filter-cluster" role="group" aria-label="Bộ lọc Client, Vùng và Loại Hub">
        {activeTab !== 'report5' && <HeaderPopover {...sharedPopover} name="client" icon="UsersRound" label="Client" summary={clientFilter === 'ALL' ? 'SPB + SPE' : clientFilter} badge={clientFilter === 'ALL' ? undefined : '•'}>
          <fieldset className="scope-options"><legend className="sr-only">Chọn Client</legend>{[['SPB', 'SPB'], ['SPE', 'SPE'], ['ALL', 'Toàn bộ · SPB + SPE']].map(([value, label]) => <label key={value} className="scope-option"><input type="radio" name="scope-client" value={value} checked={clientFilter === value} onChange={() => setClientFilter(value)} /><span>{label}</span></label>)}</fieldset>
        </HeaderPopover>}
        {!hideRegionHubFilters && <>
          <HeaderPopover {...sharedPopover} name="region" icon="MapPin" label="Vùng" summary={regionSummary} badge={selectedRegions.length === allRegions.length ? undefined : selectedRegions.length}>
            <label className="scope-option scope-select-all"><input type="checkbox" checked={selectedRegions.length === allRegions.length} onChange={() => setSelectedRegions(selectedRegions.length === allRegions.length ? [] : [...allRegions])} /><span>Chọn tất cả vùng</span></label>
            <div className="scope-options-scroll">{Object.entries(MIEN_REGIONS).map(([mien, regions]) => <fieldset key={mien} className="scope-options"><legend>{mien}</legend>{regions.map(region => <label key={region} className="scope-option"><input type="checkbox" checked={selectedRegions.includes(region)} onChange={() => toggle(region, selectedRegions, setSelectedRegions)} /><span>{region}</span></label>)}</fieldset>)}</div>
          </HeaderPopover>
          <HeaderPopover {...sharedPopover} name="hub" icon="Warehouse" label="Loại Hub" summary={hubSummary} badge={selectedHubTypes.length === allHubTypes.length ? undefined : selectedHubTypes.length}>
            <label className="scope-option scope-select-all"><input type="checkbox" checked={selectedHubTypes.length === allHubTypes.length} onChange={() => setSelectedHubTypes(selectedHubTypes.length === allHubTypes.length ? [] : [...allHubTypes])} /><span>Chọn tất cả loại Hub</span></label>
            <div className="scope-options-scroll">{allHubTypes.map(type => <label key={type} className="scope-option"><input type="checkbox" checked={selectedHubTypes.includes(type)} onChange={() => toggle(type, selectedHubTypes, setSelectedHubTypes)} /><span>{type}</span></label>)}</div>
            <button className="popover-text-action" type="button" onClick={onResetFilters}>Đặt lại Vùng và Loại Hub</button>
          </HeaderPopover>
        </>}
      </div>}
          {activeTab === 'cod-suspicion' && (
            <div className="header-cod-filters" aria-label="Bộ lọc đơn nghi vấn COD">
              <div className="hdr-field">
                <Filter size={14} className="filter-icon" />
                <span className="hdr-field-label">Loại:</span>
                <select className="filter-select-sleek" aria-label="Lọc theo loại nghi ngờ" value={codSuspicionFilters.suspicionType} onChange={(e) => setCodSuspicionFilters(prev => ({ ...prev, suspicionType: e.target.value }))}>
                  <option value="ALL">Tất cả loại nghi ngờ</option>
                  <option value="Gối đầu COD">Gối đầu COD</option>
                  <option value="Rút ruột">Rút ruột</option>
                </select>
              </div>
              <div className="hdr-field">
                <Warehouse size={14} className="filter-icon" />
                <span className="hdr-field-label">Kho:</span>
                <MultiSelectDropdown label="Kho" singleSelect searchable placeholder="Tìm tên kho…"
                  options={[{ value: 'ALL', label: `Tất cả các kho (${codSuspicionWarehouses.length})` }, ...codSuspicionWarehouses.map(value => ({ value, label: value }))]}
                  value={[codSuspicionFilters.warehouse]}
                  onChange={([warehouse]) => setCodSuspicionFilters(prev => ({ ...prev, warehouse }))} />
              </div>
              <div className="hdr-field">
                <MapPin size={14} className="filter-icon" />
                <span className="hdr-field-label">Tỉnh thành:</span>
                <MultiSelectDropdown label="Tỉnh thành" singleSelect searchable placeholder="Tìm tỉnh thành…"
                  options={[{ value: 'ALL', label: `Tất cả tỉnh thành (${codSuspicionProvinces.length})` }, ...codSuspicionProvinces.map(value => ({ value, label: value }))]}
                  value={[codSuspicionFilters.province]}
                  onChange={([province]) => setCodSuspicionFilters(prev => ({ ...prev, province }))} />
              </div>
            </div>
          )}

      <div className="compact-header-actions">
        <HeaderPopover {...sharedPopover} name="sync" icon="RefreshCw" label="Đồng bộ dữ liệu" summary={syncSummary} align="right" status={isLoading ? 'is-loading' : syncStatus?.kind === 'error' ? 'is-error' : 'is-current'}>
          <dl className="sync-details"><div><dt>{hasDistinctFdDate ? 'Pickup/Giao tới' : 'Dữ liệu tới'}</dt><dd>{d1DateFormatted || 'Chưa có dữ liệu'}</dd></div>{hasDistinctFdDate && <div><dt>FD tới</dt><dd>{fdD1DateFormatted}</dd></div>}<div><dt>Đồng bộ gần nhất</dt><dd>{lastSyncedLabel || 'Chưa xác định'}</dd></div></dl>
          {syncStatus?.kind === 'error' && <p className="sync-error-note">Chưa tải được dữ liệu mới. Bạn có thể thử đồng bộ lại.</p>}
          <button type="button" className="nav-btn-sleek popover-sync-action" onClick={onRetryData} disabled={isLoading}>{isLoading ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}</button>
        </HeaderPopover>
        <IconButton icon="MessageSquareText" label="Nhận xét D-1" onClick={onOpenSummary} />
        <IconButton icon="Search" label="Tìm toàn hệ thống" detail="Tìm báo cáo, Hub và đơn hàng · Ctrl K" onClick={onOpenPalette} />
        <IconButton className="desktop-header-action" icon="Rows3" label={density === 'compact' ? 'Chuyển sang bảng thoáng' : 'Chuyển sang bảng dày'} onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')} aria-pressed={density === 'compact'} />
        <IconButton className="desktop-header-action" icon={isFullscreen ? 'Minimize2' : 'Maximize2'} label={isFullscreen ? 'Thoát toàn màn hình' : 'Mở rộng toàn màn hình'} onClick={() => setIsFullscreen(!isFullscreen)} aria-pressed={isFullscreen} />
        {supportsExport && <IconButton className="primary" icon="Download" label={exportLabel} disabled={!canExport} onClick={exportCsv} />}
      </div>
    </div>
  </header>;
}
