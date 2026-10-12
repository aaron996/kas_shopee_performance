import { useCallback, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ellipsis, X } from 'lucide-react';
import AnimatedIcon from './ui/AnimatedIcon';
import ModalDialog from './ui/ModalDialog';
import { navigationModules } from '../modules/moduleRegistry.jsx';

const PRIMARY_IDS = ['home', 'report1', 'report5', 'ranking'];
const MOBILE_QUERY = '(max-width: 768px), (max-width: 960px) and (max-height: 500px)';

export default function MobileNavigation({ activeTab, setActiveTab, currentUser }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const close = useCallback(() => setOpen(false), []);
  const modules = navigationModules('mobile', currentUser);
  const primary = PRIMARY_IDS.map(id => modules.find(module => module.id === id)).filter(Boolean);
  const more = modules.filter(module => !PRIMARY_IDS.includes(module.id));
  const moreActive = more.some(module => module.id === activeTab);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const handleChange = () => { if (!media.matches) close(); };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [close]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const select = id => {
    close();
    setActiveTab(id);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return <>
    <nav className="mobile-bottom-nav" aria-label="Điều hướng báo cáo">
      {primary.map(module => <button key={module.id} type="button"
        className={`mobile-nav-item ${activeTab === module.id ? 'active' : ''}`}
        aria-current={activeTab === module.id ? 'page' : undefined}
        onClick={() => select(module.id)}>
        <AnimatedIcon name={module.motionIcon} size={18} />
        <span>{module.mobileLabel}</span>
      </button>)}
      {more.length > 0 && <button type="button" className={`mobile-nav-item ${moreActive ? 'active' : ''}`}
        aria-label={moreActive ? `Thêm báo cáo · ${more.find(module => module.id === activeTab).label}` : 'Thêm báo cáo'}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <Ellipsis size={20} aria-hidden="true" /><span>Thêm</span>
      </button>}
    </nav>
    {createPortal(<ModalDialog isOpen={open} onClose={close} titleId={titleId} className="mobile-report-menu">
      <div className="mobile-report-menu-heading">
        <h2 id={titleId}>Thêm báo cáo</h2>
        <button type="button" className="popover-close" aria-label="Đóng danh sách báo cáo" onClick={close}><X size={20} /></button>
      </div>
      <nav aria-label="Báo cáo khác" className="mobile-report-menu-list">
        {more.map(module => <button key={module.id} type="button"
          aria-current={activeTab === module.id ? 'page' : undefined} onClick={() => select(module.id)}>
          <AnimatedIcon name={module.motionIcon} size={22} />
          <span><strong>{module.label}</strong><small>{module.description}</small></span>
        </button>)}
      </nav>
    </ModalDialog>, document.body)}
  </>;
}
