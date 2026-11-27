import React, { useEffect, useMemo, useRef, useState } from 'react';
import IconButton from './ui/IconButton';
import MultiSelectDropdown from './ui/MultiSelectDropdown';
import HeaderPopover from './ui/HeaderPopover';
import LoadingScreen from './LoadingScreen.jsx';
import AnimatedIcon from './ui/AnimatedIcon';
import { MIEN_REGIONS } from '../data/defaultDataset';
import { formatRankingHubName } from '../utils/rankingHubName.js';
import { CLIENT_ORDER } from '../utils/clientLabels';
import { showsClientFilter, showsScopeFilters, hidesRegionHubFilters, supportsExport, showsDetailScope } from '../utils/scopeSupport';
import { hasLaneFilter } from '../utils/weeklyKpi';
import useDetailOptions from '../hooks/useDetailOptions';

export default function Header({
  activeTab, laneView = 'deli', clientFilter, setClientFilter,
  selectedRegions, setSelectedRegions, allHubTypes, selectedHubTypes, setSelectedHubTypes,
  onResetFilters, detailDataset = null, detailScope = { provinces: [], lanes: [] }, setDetailScope = () => {}, d1DateFormatted, fdD1DateFormatted, syncStatus, lastSyncedAt,
  onOpenSummary, onOpenPalette, isDarkMode,
  setIsDarkMode, density, setDensity, isFullscreen, setIsFullscreen,
  onRetryData, isDataStale = false, canExport, exportContext, codSuspicionFilters, setCodSuspicionFilters, codSuspicionWarehouses, codSuspicionRegions = [], codSuspicionProvinces
}) {
  const hideRegionHubFilters = hidesRegionHubFilters(activeTab);
  const [popover, setPopover] = useState(null);
  // KAS-317: Tỉnh thành là sub-filter của Vùng, Lane là bộ lọc riêng (Deli/FD); cả hai chỉ ở Chi tiết Vùng/Hub.
  const [regionSub, setRegionSub] = useState('region');
  const [detailQuery, setDetailQuery] = useState('');
  const detailActive = showsDetailScope(activeTab) && !hideRegionHubFilters && Boolean(detailDataset);
  const showLane = detailActive && hasLaneFilter(detailDataset);
  const detail = useDetailOptions(detailActive ? detailDataset : null);
  const [rankingControlsHidden, setRankingControlsHidden] = useState(false);
  const headerRef = useRef(null);
  const allRegions = useMemo(() => Object.values(MIEN_REGIONS).flat(), []);
  const canShowExport = supportsExport(activeTab, laneView);
  const exportCsv = () => window.dispatchEvent(new CustomEvent('open-export-dialog', { detail: exportContext }));
  const exportLabel = `Xuất CSV · ${exportContext?.['Phạm vi Client']} · ${exportContext?.['Khoảng dữ liệu']}`;
  useEffect(() => { setPopover(null); }, [activeTab]);
  useEffect(() => { setDetailQuery(''); }, [popover?.name, detailDataset]);
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
  const provinceCount = detailActive ? detailScope.provinces.length : 0;
  const laneCount = showLane ? detailScope.lanes.length : 0;
  const regionAll = selectedRegions.length === allRegions.length;
  const regionSummaryFull = provinceCount ? `${regionSummary} · ${provinceCount} tỉnh thành` : regionSummary;
  const laneSummary = laneCount ? `${laneCount} lane được chọn` : 'Tất cả lane';
  const normalize = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const detailList = (kind, selected) => {
    const all = detail.options ? detail.options[kind] : [];
    const merged = [...new Set([...all, ...selected])].sort();
    const q = normalize(detailQuery.trim());
    return q ? merged.filter(value => normalize(value).includes(q)) : merged;
  };
  const toggleDetail = (kind, value) => setDetailScope(scope => ({ ...scope, [kind]: scope[kind].includes(value) ? scope[kind].filter(item => item !== value) : [...scope[kind], value] }));
  // Danh sách tìm kiếm + chọn nhiều cho Tỉnh thành / Lane. Không chọn gì nghĩa là không lọc.
  const detailPicker = (kind, label, selected, searchLabel) => {
    if (detail.status === 'loading') return <LoadingScreen variant="inline" />;
    if (detail.status === 'error') return <p className="sync-error-note">Không tải được danh sách {label}. <button type="button" className="popover-text-action" onClick={detail.retry}>Thử lại</button></p>;
    const list = detailList(kind, selected);
    if (!detail.options || (!detail.options[kind].length && !selected.length)) return <p className="scope-empty-note">Bảng chi tiết chưa có dữ liệu {label} cho chỉ số này.</p>;
    return <>
      <label className="msd-search scope-search"><AnimatedIcon name="Search" size={14} /><input type="text" value={detailQuery} placeholder={searchLabel} aria-label={searchLabel} onChange={event => setDetailQuery(event.target.value)} /></label>
      <div className="scope-options-scroll">{list.map(value => <label key={value} className="scope-option"><input type="checkbox" checked={selected.includes(value)} onChange={() => toggleDetail(kind, value)} /><span>{value}</span></label>)}{list.length === 0 && <p className="scope-empty-note">Không có kết quả</p>}</div>
      <button className="popover-text-action" type="button" disabled={!selected.length} onClick={() => setDetailScope(scope => ({ ...scope, [kind]: [] }))}>Bỏ lọc {label}</button>
    </>;
  };
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
      {showsScopeFilters(activeTab) && <div className={`scope-filter-cluster ${activeTab === 'home' ? 'is-replaced' : ''}`} inert={activeTab === 'ranking' && rankingControlsHidden || undefined} role="group" aria-label="Bộ lọc Client, Vùng, Loại Hub và Lane">
        {showsClientFilter(activeTab, laneView) && <HeaderPopover {...sharedPopover} name="client" icon="UsersRound" label="Client" summary={clientFilter} badge="•">
          <fieldset className="scope-options"><legend className="sr-only">Chọn Client</legend>{CLIENT_ORDER.map(c => [c, c]).map(([value, label]) => <label key={value} className="scope-option"><input type="radio" name="scope-client" value={value} checked={clientFilter === value} onChange={() => setClientFilter(value)} /><span>{label}</span></label>)}</fieldset>
        </HeaderPopover>}
        {!hideRegionHubFilters && <>
          <HeaderPopover {...sharedPopover} name="region" icon="MapPin" label={detailActive ? 'Vùng và Tỉnh thành' : 'Vùng'} summary={regionSummaryFull} badge={regionAll ? (provinceCount || undefined) : selectedRegions.length}>
            {detailActive && <div className="kpi-tab-group scope-subfilters" role="group" aria-label="Chọn bộ lọc con">
              {[['region', 'Vùng'], ['province', 'Tỉnh thành']].map(([key, text]) => <button type="button" key={key} aria-pressed={regionSub === key} className={`kpi-table-tab ${regionSub === key ? 'active' : ''}`} onClick={() => { setRegionSub(key); setDetailQuery(''); }}>{text}{key === 'province' && provinceCount > 0 ? ` (${provinceCount})` : ''}</button>)}
            </div>}
            {detailActive && regionSub === 'province' ? detailPicker('provinces', 'tỉnh thành', detailScope.provinces, 'Tìm tỉnh thành…') : <>
            <label className="scope-option scope-select-all"><input type="checkbox" checked={selectedRegions.length === allRegions.length} onChange={() => setSelectedRegions(selectedRegions.length === allRegions.length ? [] : [...allRegions])} /><span>Chọn tất cả vùng</span></label>
            <div className="scope-options-scroll">{Object.entries(MIEN_REGIONS).map(([mien, regions]) => <fieldset key={mien} className="scope-options"><legend>{mien}</legend>{regions.map(region => <label key={region} className="scope-option"><input type="checkbox" checked={selectedRegions.includes(region)} onChange={() => toggle(region, selectedRegions, setSelectedRegions)} /><span>{region}</span></label>)}</fieldset>)}</div>
            </>}
          </HeaderPopover>
          <HeaderPopover {...sharedPopover} name="hub" icon="Warehouse" label="Loại Hub" summary={hubSummary} badge={selectedHubTypes.length === allHubTypes.length ? undefined : selectedHubTypes.length}>
            <label className="scope-option scope-select-all"><input type="checkbox" checked={selectedHubTypes.length === allHubTypes.length} onChange={() => setSelectedHubTypes(selectedHubTypes.length === allHubTypes.length ? [] : [...allHubTypes])} /><span>Chọn tất cả loại Hub</span></label>
            <div className="scope-options-scroll">{allHubTypes.map(type => <label key={type} className="scope-option"><input type="checkbox" checked={selectedHubTypes.includes(type)} onChange={() => toggle(type, selectedHubTypes, setSelectedHubTypes)} /><span>{activeTab === 'ranking' ? formatRankingHubName(type) : type}</span></label>)}</div>
            <button className="popover-text-action" type="button" onClick={onResetFilters}>{detailActive ? 'Đặt lại Vùng, Tỉnh thành, Lane và Loại Hub' : 'Đặt lại Vùng và Loại Hub'}</button>
          </HeaderPopover>
          {showLane && <HeaderPopover {...sharedPopover} name="lane" icon="Route" label="Lane" summary={laneSummary} badge={laneCount || undefined}>
            {detailPicker('lanes', 'lane', detailScope.lanes, 'Tìm lane…')}
          </HeaderPopover>}
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
      {activeTab === 'report5' && <h1 className="compact-header-page-title">Báo cáo theo Lane</h1>}
      {activeTab === 'ranking' ? <div id="ranking-header-controls" /> : <div className="compact-header-actions">
        {/* Phones reload with the browser's own pull-to-refresh; the stale-data
            alert is what tells people a new sync is worth doing. */}
        <HeaderPopover {...sharedPopover} className="desktop-header-action" name="sync" icon="RefreshCw" label="Đồng bộ dữ liệu" summary={syncSummary} align="right" status={isLoading ? 'is-loading' : syncStatus?.kind === 'error' ? 'is-error' : 'is-current'}>
          <dl className="sync-details"><div><dt>{hasDistinctFdDate ? 'Pickup/Giao tới' : 'Dữ liệu tới'}</dt><dd>{d1DateFormatted || (isLoading ? <LoadingScreen variant="inline" /> : 'Chưa có dữ liệu')}</dd></div>{hasDistinctFdDate && <div><dt>FD tới</dt><dd>{fdD1DateFormatted}</dd></div>}<div><dt>Đồng bộ gần nhất</dt><dd>{lastSyncedLabel || (isLoading ? <LoadingScreen variant="inline" /> : 'Chưa xác định')}</dd></div></dl>
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
        {canShowExport && <IconButton className="primary" icon="Download" label={exportLabel} disabled={!canExport} onClick={exportCsv} />}
      </div>}
    </div>
  </header>;
}
