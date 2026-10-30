import React, { useEffect, useMemo, useRef, useState } from 'react';
import IconButton from './ui/IconButton';
import MultiSelectDropdown from './ui/MultiSelectDropdown';
import HeaderPopover from './ui/HeaderPopover';
import { MIEN_REGIONS } from '../data/defaultDataset';
import { formatRankingHubName } from '../utils/rankingHubName.js';
import { CLIENT_ORDER } from '../utils/clientLabels';

export default function Header({
  activeTab, clientFilter, setClientFilter,
  selectedRegions, setSelectedRegions, allHubTypes, selectedHubTypes, setSelectedHubTypes,
  onResetFilters, d1DateFormatted, fdD1DateFormatted, syncStatus, lastSyncedAt,
  onOpenSummary, onOpenPalette, isDarkMode,
  setIsDarkMode, density, setDensity, isFullscreen, setIsFullscreen,
  onRetryData, isDataStale = false, canExport, exportContext, codSuspicionFilters, setCodSuspicionFilters, codSuspicionWarehouses, codSuspicionRegions = [], codSuspicionProvinces
}) {
  const hideRegionHubFilters = ['report3', 'report-insight', 'cod-suspicion'].includes(activeTab);
  const [popover, setPopover] = useState(null);
  const [rankingControlsHidden, setRankingControlsHidden] = useState(false);
  const headerRef = useRef(null);
  const allRegions = useMemo(() => Object.values(MIEN_REGIONS).flat(), []);
  const supportsExport = ['home', 'report1', 'report5'].includes(activeTab);
  const exportCsv = () => window.dispatchEvent(new CustomEvent('open-export-dialog', { detail: exportContext }));
  const exportLabel = `Xuất CSV · ${exportContext?.['Phạm vi Client']} · ${exportContext?.['Khoảng dữ liệu']}`;
  useEffect(() => { setPopover(null); }, [activeTab]);
  useEffect(() => {
    const onPresentationChange = event => {
      setRankingControlsHidden(Boolean(event.detail?.hidden));
      setPopover(null);
    };
    window.addEventListener('ranking-presentation-change', onPresentationChange);
    return () => window.removeEventListener('ranking-presentation-change', onPresentationChange);
  }, []);
  // The Tổng quan scope chips open these same filters; the triggers are only
  // icons up here, so the chips are where most people reach them on a phone.
  useEffect(() => {
    const openScope = event => {
      const name = event.detail?.name;
      if (name) setPopover({ name, pinned: true });
    };
    window.addEventListener('open-scope-popover', openScope);
    return () => window.removeEventListener('open-scope-popover', openScope);
  }, []);
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
    {/* Phone header is one row. Dev Panel and Đăng xuất live in the "Thêm" menu
        of the bottom nav (the sidebar already carries them on desktop). */}
    {activeTab !== 'ranking' && <div className="compact-mobile-brand"><div className="compact-mobile-settings">
      <IconButton icon={isDarkMode ? 'Sun' : 'Moon'} label={isDarkMode ? 'Giao diện sáng' : 'Giao diện tối'} onClick={() => setIsDarkMode(!isDarkMode)} />
    </div></div>}
    <div className="compact-header-toolbar" role={activeTab === 'ranking' ? 'toolbar' : undefined} aria-label={activeTab === 'ranking' ? 'Điều khiển BXH' : undefined}>
      {activeTab === 'ranking' && <div id="ranking-header-heading" />}
      {/* On Tổng quan the scope chips on the page are the visible trigger, so the
          icons are hidden here — but the popovers stay mounted, because those
          chips open them. */}
      {!['cod-suspicion', 'guide'].includes(activeTab) && <div className={`scope-filter-cluster ${activeTab === 'home' ? 'is-replaced' : ''}`} inert={activeTab === 'ranking' && rankingControlsHidden || undefined} role="group" aria-label="Bộ lọc Client, Vùng và Loại Hub">
        {activeTab !== 'report5' && <HeaderPopover {...sharedPopover} name="client" icon="UsersRound" label="Client" summary={clientFilter} badge="•">
          <fieldset className="scope-options"><legend className="sr-only">Chọn Client</legend>{CLIENT_ORDER.map(c => [c, c]).map(([value, label]) => <label key={value} className="scope-option"><input type="radio" name="scope-client" value={value} checked={clientFilter === value} onChange={() => setClientFilter(value)} /><span>{label}</span></label>)}</fieldset>
        </HeaderPopover>}
        {!hideRegionHubFilters && <>
          <HeaderPopover {...sharedPopover} name="region" icon="MapPin" label="Vùng" summary={regionSummary} badge={selectedRegions.length === allRegions.length ? undefined : selectedRegions.length}>
            <label className="scope-option scope-select-all"><input type="checkbox" checked={selectedRegions.length === allRegions.length} onChange={() => setSelectedRegions(selectedRegions.length === allRegions.length ? [] : [...allRegions])} /><span>Chọn tất cả vùng</span></label>
            <div className="scope-options-scroll">{Object.entries(MIEN_REGIONS).map(([mien, regions]) => <fieldset key={mien} className="scope-options"><legend>{mien}</legend>{regions.map(region => <label key={region} className="scope-option"><input type="checkbox" checked={selectedRegions.includes(region)} onChange={() => toggle(region, selectedRegions, setSelectedRegions)} /><span>{region}</span></label>)}</fieldset>)}</div>
          </HeaderPopover>
          <HeaderPopover {...sharedPopover} name="hub" icon="Warehouse" label="Loại Hub" summary={hubSummary} badge={selectedHubTypes.length === allHubTypes.length ? undefined : selectedHubTypes.length}>
            <label className="scope-option scope-select-all"><input type="checkbox" checked={selectedHubTypes.length === allHubTypes.length} onChange={() => setSelectedHubTypes(selectedHubTypes.length === allHubTypes.length ? [] : [...allHubTypes])} /><span>Chọn tất cả loại Hub</span></label>
            <div className="scope-options-scroll">{allHubTypes.map(type => <label key={type} className="scope-option"><input type="checkbox" checked={selectedHubTypes.includes(type)} onChange={() => toggle(type, selectedHubTypes, setSelectedHubTypes)} /><span>{activeTab === 'ranking' ? formatRankingHubName(type) : type}</span></label>)}</div>
            <button className="popover-text-action" type="button" onClick={onResetFilters}>Đặt lại Vùng và Loại Hub</button>
          </HeaderPopover>
        </>}
      </div>}
          {activeTab === 'cod-suspicion' && (
            <div className="header-cod-filters" role="group" aria-label="Bộ lọc đơn nghi vấn COD">
              {[
                ['suspicionType', 'Loại', 'type', ['Gối đầu COD', 'Rút ruột'], 'Tìm loại nghi ngờ…'],
                ['region', 'Vùng', 'region', codSuspicionRegions, 'Tìm vùng…'],
                ['province', 'Tỉnh thành', 'province', codSuspicionProvinces, 'Tìm tỉnh thành…'],
                ['warehouse', 'Kho', 'warehouse', codSuspicionWarehouses, 'Tìm tên kho…']
              ].map(([key, label, className, options, placeholder]) => {
                const selection = codSuspicionFilters[key] ?? 'ALL';
                const values = selection === 'ALL' ? options : Array.isArray(selection) ? selection : [selection];
                const summary = selection === 'ALL' ? 'Tất cả' : values.length > 1 ? `${values.length} đã chọn` : undefined;
                return <div key={key} className={`hdr-field cod-filter-${className}`}>
                  <MultiSelectDropdown label={label} triggerLabel={label} triggerSummary={summary}
                    searchable={key !== 'suspicionType'} panelMinWidth={280} placeholder={placeholder}
                    options={options.map(value => ({ value, label: value }))} value={values}
                    onChange={selected => setCodSuspicionFilters(prev => ({ ...prev,
                      [key]: options.length > 0 && options.every(value => selected.includes(value)) ? 'ALL' : selected
                    }))} />
                </div>;
              })}
            </div>
          )}

      {activeTab === 'guide' && <span className="compact-header-page-title">Hướng dẫn</span>}
      {activeTab === 'report1' && <h1 className="compact-header-page-title">Chi tiết Vùng/Hub</h1>}
      {activeTab === 'ranking' ? <div id="ranking-header-controls" /> : <div className="compact-header-actions">
        {/* Phones reload with the browser's own pull-to-refresh; the stale-data
            alert is what tells people a new sync is worth doing. */}
        <HeaderPopover {...sharedPopover} className="desktop-header-action" name="sync" icon="RefreshCw" label="Đồng bộ dữ liệu" summary={syncSummary} align="right" status={isLoading ? 'is-loading' : syncStatus?.kind === 'error' ? 'is-error' : 'is-current'}>
          <dl className="sync-details"><div><dt>{hasDistinctFdDate ? 'Pickup/Giao tới' : 'Dữ liệu tới'}</dt><dd>{d1DateFormatted || 'Chưa có dữ liệu'}</dd></div>{hasDistinctFdDate && <div><dt>FD tới</dt><dd>{fdD1DateFormatted}</dd></div>}<div><dt>Đồng bộ gần nhất</dt><dd>{lastSyncedLabel || 'Chưa xác định'}</dd></div></dl>
          {syncStatus?.kind === 'error' && <p className="sync-error-note">Chưa tải được dữ liệu mới. Bạn có thể thử đồng bộ lại.</p>}
          <button type="button" className="nav-btn-sleek popover-sync-action" onClick={onRetryData} disabled={isLoading}>{isLoading ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}</button>
        </HeaderPopover>
        {/* Shown only when the DB has moved on from the snapshot on screen. */}
        {isDataStale && !isLoading && <IconButton className="header-stale-alert" icon="TriangleAlert"
          label="Có dữ liệu mới" detail="Nguồn đã cập nhật sau lần tải này. Bấm để đồng bộ lại." onClick={onRetryData} />}
        <IconButton className="desktop-header-action" icon="MessageSquareText" label="Nhận xét D-1" onClick={onOpenSummary} />
        <IconButton icon="Search" label="Tìm toàn hệ thống" detail="Tìm báo cáo, Hub và đơn hàng · Ctrl K" onClick={onOpenPalette} />
        <IconButton className="desktop-header-action" icon="Rows3" label={density === 'compact' ? 'Chuyển sang bảng thoáng' : 'Chuyển sang bảng dày'} onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')} aria-pressed={density === 'compact'} />
        <IconButton className="desktop-header-action" icon={isFullscreen ? 'Minimize2' : 'Maximize2'} label={isFullscreen ? 'Thoát toàn màn hình' : 'Mở rộng toàn màn hình'} onClick={() => setIsFullscreen(!isFullscreen)} aria-pressed={isFullscreen} />
        {supportsExport && <IconButton className="primary" icon="Download" label={exportLabel} disabled={!canExport} onClick={exportCsv} />}
      </div>}
    </div>
  </header>;
}
