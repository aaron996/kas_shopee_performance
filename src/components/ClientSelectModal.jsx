import { useState } from 'react';
import { Zap, Boxes, Layers, Check } from 'lucide-react';
import ModalDialog from './ui/ModalDialog';

const OPTIONS = [
  {
    key: 'SPE',
    icon: Zap,
    title: 'Shopee Express',
    tag: 'SPE',
    desc: 'Đơn hàng nhanh, giao hoả tốc trong ngày.'
  },
  {
    key: 'SPB',
    icon: Boxes,
    title: 'Shopee Bulky',
    tag: 'SPB',
    desc: 'Đơn hàng cồng kềnh, khối lượng lớn.'
  }
];

export default function ClientSelectModal({ isOpen, onSelect }) {
  const [picked, setPicked] = useState(null);

  if (!isOpen) return null;

  const handlePick = (key) => {
    if (picked) return; // ignore double-clicks while the exit animation plays
    setPicked(key);
    // Let the user see the pick land (scale + check-in) before the modal
    // closes, instead of an abrupt cut to the dashboard.
    window.setTimeout(() => onSelect(key), 320);
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      dismissible={false}
      titleId="client-select-title"
      className="client-select-card"
    >
      <div className="client-select-header">
        <div className="client-select-badge">
          <Layers size={20} color="white" />
        </div>
        <div>
          <h2 id="client-select-title" className="client-select-title">Bạn muốn xem báo cáo ngành hàng nào?</h2>
          <p className="client-select-subtitle">Chọn một client để bắt đầu — có thể đổi lại bất cứ lúc nào ở bộ lọc phía trên.</p>
        </div>
      </div>

      <div className="client-select-grid">
        {OPTIONS.map(({ key, icon: Icon, title, tag, desc }) => {
          const isPicked = picked === key;
          const isFaded = picked && !isPicked;
          return (
            <button
              type="button"
              key={key}
              className={`client-select-option ${isPicked ? 'is-picked' : ''} ${isFaded ? 'is-faded' : ''}`}
              onClick={() => handlePick(key)}
              disabled={!!picked}
            >
              <span className="client-select-icon">
                {isPicked ? <Check size={26} /> : <Icon size={26} />}
              </span>
              <span className="client-select-option-title">{title}</span>
              <span className="client-select-option-tag">{tag}</span>
              <span className="client-select-option-desc">{desc}</span>
            </button>
          );
        })}
      </div>
    </ModalDialog>
  );
}
