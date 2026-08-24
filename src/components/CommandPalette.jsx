import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Layers, ArrowRightLeft, Clock, Sparkles, MapPin, Filter, CornerDownLeft } from 'lucide-react';
import { MIEN_REGIONS } from '../data/defaultDataset';

// Command palette (Cmd/Ctrl+K) — nhảy nhanh tới tab / client / vùng mà không
// phải rời tay khỏi bàn phím. App có ~40 vùng/hub và 3-4 tab; trước đây phải
// click Sidebar rồi mở dropdown Vùng rồi cuộn tìm — giờ gõ vài ký tự là ra.
//
// Không tìm hub lẻ (chỉ vùng): hub-level jump cần Report1 tự mở đúng region
// rồi cuộn tới đúng dòng, nhưng danh sách hub chỉ tồn tại BÊN TRONG dữ liệu đã
// filter theo client — palette này không nhận props đó nên chỉ nói tới cấp
// vùng, vốn đã đủ để thu hẹp 90% việc tìm.
export default function CommandPalette({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  clientFilter,
  setClientFilter,
  onSelectRegion,
  hasInsightTab = false
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      // Đợi 1 frame để modal render xong rồi mới focus, tránh mất focus vì
      // phần tử chưa gắn vào DOM.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const items = useMemo(() => {
    const tabItems = [
      { type: 'tab', id: 'report1', label: '1. 4 chỉ số nationwide', icon: Layers },
      { type: 'tab', id: 'report5', label: '2. % Ca 1 theo lane', icon: ArrowRightLeft },
      { type: 'tab', id: 'report3', label: '3. Leadtime từng chặng', icon: Clock }
    ];
    if (hasInsightTab) {
      tabItems.push({ type: 'tab', id: 'report-insight', label: '4. Insight', icon: Sparkles });
    }

    const clientItems = ['SPB', 'SPE', 'ALL'].map(code => ({
      type: 'client',
      id: code,
      label: code === 'ALL' ? 'Client: Toàn bộ (SPB + SPE)' : `Client: ${code}`,
      icon: Filter
    }));

    const regionItems = Object.entries(MIEN_REGIONS).flatMap(([mien, regions]) =>
      regions.map(reg => ({
        type: 'region',
        id: reg,
        label: reg,
        group: mien,
        icon: MapPin
      }))
    );

    return [...tabItems, ...clientItems, ...regionItems];
  }, [hasInsightTab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it =>
      it.label.toLowerCase().includes(q) || (it.group && it.group.toLowerCase().includes(q))
    );
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const runItem = (item) => {
    if (!item) return;
    if (item.type === 'tab') setActiveTab(item.id);
    else if (item.type === 'client') setClientFilter(item.id);
    else if (item.type === 'region') onSelectRegion?.(item.id);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runItem(filtered[activeIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cmdk-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="cmdk-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Tìm nhanh"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cmdk-input-row">
          <Search size={16} className="cmdk-search-icon" />
          <input
            ref={inputRef}
            className="cmdk-input"
            type="text"
            placeholder="Tìm tab, client (SPB/SPE), hoặc vùng..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Tìm nhanh"
          />
          <kbd className="cmdk-kbd">Esc</kbd>
        </div>

        <div className="cmdk-list" ref={listRef} role="listbox">
          {filtered.length === 0 && (
            <div className="cmdk-empty">Không tìm thấy gì khớp "{query}".</div>
          )}
          {filtered.map((item, idx) => {
            const Icon = item.icon;
            const isActive = idx === activeIndex;
            const isCurrent =
              (item.type === 'tab' && item.id === activeTab) ||
              (item.type === 'client' && item.id === clientFilter);
            return (
              <button
                type="button"
                key={`${item.type}-${item.id}`}
                data-idx={idx}
                role="option"
                aria-selected={isActive}
                className={`cmdk-item ${isActive ? 'active' : ''}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => runItem(item)}
              >
                <Icon size={15} className="cmdk-item-icon" />
                <span className="cmdk-item-label">{item.label}</span>
                {item.group && <span className="cmdk-item-group">{item.group}</span>}
                {isCurrent && <span className="cmdk-item-current">hiện tại</span>}
                {isActive && <CornerDownLeft size={13} className="cmdk-item-enter" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
