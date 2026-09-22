import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  CornerDownLeft,
  Filter,
  LoaderCircle,
  MapPin,
  PackageSearch,
  Search,
  UserRound
} from 'lucide-react';
import { MIEN_REGIONS } from '../data/defaultDataset';
import { navigationModules } from '../modules/moduleRegistry.jsx';
import { fetchCodSuspicionData } from '../utils/codSuspicionClient';
import {
  buildCodSearchItems,
  normalizeSearchText,
  rankSearchItems
} from '../utils/universalSearch';

const MIN_DATA_QUERY_LENGTH = 2;

export default function CommandPalette({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  clientFilter,
  setClientFilter,
  onSelectRegion,
  onSelectCodResult,
  canSearchCod = false
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [codItems, setCodItems] = useState({ driverItems: [], orderItems: [] });
  const [codSearchStatus, setCodSearchStatus] = useState('idle');
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const panelRef = useRef(null);
  const codLoadStartedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  const navigationItems = useMemo(() => {
    const tabItems = navigationModules('commandPalette').map(module => ({
      type: 'tab',
      id: module.id,
      label: module.label,
      section: 'Điều hướng',
      icon: module.icon
    }));

    const clientItems = ['SPB', 'SPE', 'ALL'].map(code => ({
      type: 'client',
      id: code,
      label: code === 'ALL' ? 'Client: Toàn bộ (SPB + SPE)' : `Client: ${code}`,
      section: 'Điều hướng',
      icon: Filter
    }));

    const regionItems = Object.entries(MIEN_REGIONS).flatMap(([mien, regions]) =>
      regions.map(region => ({
        type: 'region',
        id: region,
        label: region,
        group: mien,
        section: 'Điều hướng',
        searchText: `${region} ${mien}`,
        icon: MapPin
      }))
    );

    return [...tabItems, ...clientItems, ...regionItems];
  }, []);

  const cleanQuery = normalizeSearchText(query);
  const shouldSearchCod = canSearchCod && cleanQuery.length >= MIN_DATA_QUERY_LENGTH;

  useEffect(() => {
    if (!isOpen || !shouldSearchCod || codLoadStartedRef.current) return;

    codLoadStartedRef.current = true;
    setCodSearchStatus('loading');

    fetchCodSuspicionData()
      .then(result => {
        if (!result.success) {
          setCodSearchStatus('error');
          return;
        }
        setCodItems(buildCodSearchItems(result.rows || []));
        setCodSearchStatus('ready');
      })
      .catch(error => {
        console.error('Universal COD search failed:', error);
        setCodSearchStatus('error');
      });
  }, [isOpen, shouldSearchCod]);

  const filtered = useMemo(() => {
    if (!cleanQuery) return navigationItems;

    const navigationResults = rankSearchItems(navigationItems, cleanQuery, 10);
    if (!shouldSearchCod || codSearchStatus !== 'ready') return navigationResults;

    const dataResults = rankSearchItems(
      [...codItems.driverItems, ...codItems.orderItems],
      cleanQuery,
      14
    );
    return [...navigationResults, ...dataResults];
  }, [cleanQuery, codItems, codSearchStatus, navigationItems, shouldSearchCod]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    setActiveIndex(index => Math.min(index, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  useEffect(() => {
    const element = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    element?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const runItem = (item) => {
    if (!item) return;
    if (item.type === 'tab') setActiveTab(item.id);
    else if (item.type === 'client') setClientFilter(item.id);
    else if (item.type === 'region') onSelectRegion?.(item.id);
    else if (item.type === 'cod-driver' || item.type === 'cod-order') onSelectCodResult?.(item.target);
    onClose();
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runItem(filtered[activeIndex]);
    } else if (event.key === 'Escape') {
      onClose();
    }
  };

  const handleDialogKeyDown = (event) => {
    if (event.key !== 'Tab') return;
    const focusable = panelRef.current?.querySelectorAll('input, button:not([disabled])');
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!isOpen) return null;

  const isCodLoading = shouldSearchCod && codSearchStatus === 'loading';
  const showEmpty = filtered.length === 0 && !isCodLoading;
  const activeDescendant = filtered[activeIndex] ? `cmdk-option-${activeIndex}` : undefined;

  return (
    <div className="cmdk-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="cmdk-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Tìm kiếm toàn hệ thống"
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="cmdk-input-row">
          <Search size={17} className="cmdk-search-icon" />
          <input
            ref={inputRef}
            className="cmdk-input"
            type="search"
            placeholder="Tìm tab, vùng, tài xế, ID hoặc mã đơn..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            aria-label="Tìm kiếm toàn hệ thống"
            aria-controls="cmdk-results"
            aria-activedescendant={activeDescendant}
            autoComplete="off"
          />
          <kbd className="cmdk-kbd">Esc</kbd>
        </div>

        <div className="cmdk-list" id="cmdk-results" ref={listRef} role="listbox">
          {showEmpty && (
            <div className="cmdk-empty">Không tìm thấy kết quả phù hợp với “{query}”.</div>
          )}

          {filtered.map((item, index) => {
            const Icon = item.type === 'cod-driver'
              ? UserRound
              : item.type === 'cod-order'
                ? PackageSearch
                : item.icon;
            const isActive = index === activeIndex;
            const isCurrent =
              (item.type === 'tab' && item.id === activeTab) ||
              (item.type === 'client' && item.id === clientFilter);
            const showSection = index === 0 || filtered[index - 1]?.section !== item.section;

            return (
              <Fragment key={`${item.type}-${item.id}`}>
                {showSection && <div className="cmdk-section-label" aria-hidden="true">{item.section}</div>}
                <button
                  type="button"
                  id={`cmdk-option-${index}`}
                  data-idx={index}
                  role="option"
                  aria-selected={isActive}
                  className={`cmdk-item ${isActive ? 'active' : ''} ${item.type.startsWith('cod-') ? 'cmdk-item--data' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runItem(item)}
                >
                  <span className="cmdk-item-icon-wrap" aria-hidden="true"><Icon size={16} className="cmdk-item-icon" /></span>
                  <span className="cmdk-item-copy">
                    <span className="cmdk-item-label">{item.label}</span>
                    {item.description && <span className="cmdk-item-description">{item.description}</span>}
                  </span>
                  {item.group && <span className="cmdk-item-group">{item.group}</span>}
                  {isCurrent && <span className="cmdk-item-current">hiện tại</span>}
                  {isActive && <CornerDownLeft size={13} className="cmdk-item-enter" aria-hidden="true" />}
                </button>
              </Fragment>
            );
          })}

          <div className="cmdk-status" aria-live="polite">
            {isCodLoading && <><LoaderCircle size={14} className="is-spinning" /> Đang tìm trong dữ liệu COD được cấp quyền...</>}
            {shouldSearchCod && codSearchStatus === 'error' && 'Không tải được dữ liệu COD. Điều hướng trong hệ thống vẫn hoạt động.'}
            {!canSearchCod && cleanQuery.length >= MIN_DATA_QUERY_LENGTH && 'Local preview không truy vấn dữ liệu COD live.'}
          </div>
        </div>
      </div>
    </div>
  );
}
