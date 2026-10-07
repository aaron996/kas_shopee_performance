import { useState } from 'react';
import { Activity, Bot, ChevronRight, Layers, MessageSquare, Search, ShieldCheck, SlidersHorizontal, Users, Wallet } from 'lucide-react';
import AiOperationsDashboard from './AiOperationsDashboard';
import AppRoleSettings from './AppRoleSettings';
import CodSmsThresholdSettings from './CodSmsThresholdSettings';
import DevAccessActivity from './DevAccessActivity';
import './DevAdminDashboard.css';

// One directory owns every entry point. Feature configuration is separate from
// the shared catalog; the content surface has no second set of navigation tabs.
const GROUPS = [
  { label: 'AI dùng chung', items: [
    { id: 'models', label: 'Danh mục model', icon: Layers, view: 'model-registry', description: 'Đồng bộ, khai báo giá, kiểm tra và bật model cho Chatbot và COD SMS.' },
  ] },
  { label: 'Chatbot', items: [
    { id: 'usage', label: 'Chi phí & API', icon: Wallet, view: 'overview', description: 'Theo dõi chi phí và lượt gọi Chatbot trong khoảng thời gian đã chọn.' },
    { id: 'chat-config', label: 'Model & suy luận', icon: SlidersHorizontal, view: 'model-config', feature: 'chat', description: 'Chọn model đang chạy cho toàn bộ Chatbot hoặc cho từng tài khoản.' },
    { id: 'quotas', label: 'Hạn mức sử dụng', icon: Users, view: 'quotas', description: 'Xem hạn mức mặc định từ server và quản lý hạn mức riêng cho từng tài khoản.' },
    { id: 'research', label: 'Nhật ký câu hỏi', icon: Bot, view: 'research', description: 'Tra cứu câu hỏi, trạng thái xử lý và các nhóm câu hỏi thường gặp.' }
  ] },
  { label: 'COD SMS', items: [
    { id: 'cod-config', label: 'Model chấm SMS', icon: MessageSquare, view: 'model-config', feature: 'cod_sms', description: 'Chọn model và mức suy luận cho tác vụ chấm SMS. Cấu hình áp dụng cho toàn bộ tác vụ.' },
    { id: 'cod-threshold', label: 'Mốc nâng nghi ngờ', icon: SlidersHorizontal, description: 'Điều chỉnh mốc điểm SMS dùng để nâng mức nghi ngờ COD.' }
  ] },
  { label: 'Tài khoản & truy cập', items: [
    { id: 'roles', label: 'Phân quyền', icon: ShieldCheck, description: 'Quản lý quyền User, Admin và Dev cho tài khoản đã đăng nhập.' },
    { id: 'access', label: 'Lịch sử truy cập', icon: Activity, description: 'Theo dõi phiên online, lượt truy cập và xuất lịch sử.' }
  ] }
];
const SECTIONS = GROUPS.flatMap(group => group.items.map(item => ({ ...item, group: group.label })));
const normalize = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase();

export default function DevAdminDashboard({ onlineUsers = [], currentUser }) {
  const [sectionId, setSectionId] = useState('chat-config');
  const [search, setSearch] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const section = SECTIONS.find(item => item.id === sectionId);
  const visibleGroups = GROUPS.map(group => ({ ...group, items: group.items.filter(item => normalize(`${group.label} ${item.label} ${item.description}`).includes(normalize(search.trim()))) }));

  const directoryProps = { visibleGroups, sectionId, search, setSearch, setSectionId: id => { setSectionId(id); setMobileOpen(false); } };

  return <div className="dev-panel">
    <header className="dev-panel-header">
      <div><h1>Dev Control Panel</h1><p>Cấu hình và giám sát vận hành hệ thống.</p></div>
      <span className="dev-panel-session"><ShieldCheck size={16} aria-hidden="true" /> Quyền Dev</span>
    </header>
    <div className="dev-panel-layout">
      <div className="dev-panel-desktop-nav"><DevDirectory {...directoryProps} /></div>
      <details className="dev-panel-mobile-nav" open={mobileOpen} onToggle={event => setMobileOpen(event.currentTarget.open)}>
        <summary><span>Chức năng: <strong>{section.label}</strong></span><ChevronRight size={16} aria-hidden="true" /></summary>
        <DevDirectory {...directoryProps} />
      </details>
      <section id="dev-panel-content" className="dev-panel-content" aria-labelledby="dev-panel-section-title">
        <header className="dev-panel-section-header"><h2 id="dev-panel-section-title">{section.label}</h2><div>{section.description}</div></header>
        {section.view ? <AiOperationsDashboard key={section.id} view={section.view} feature={section.feature || 'chat'} />
          : section.id === 'roles' ? <AppRoleSettings currentUser={currentUser} />
            : section.id === 'cod-threshold' ? <CodSmsThresholdSettings />
              : <DevAccessActivity onlineUsers={onlineUsers} />}
      </section>
    </div>
  </div>;
}

function DevDirectory({ visibleGroups, sectionId, search, setSearch, setSectionId }) {
  return <nav className="dev-panel-nav" aria-label="Chức năng quản trị">
        <label className="dev-panel-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Tìm chức năng quản trị" placeholder="Tìm chức năng…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        {visibleGroups.map(group => group.items.length > 0 && <div className="dev-panel-group" key={group.label}>
          <h2>{group.label}</h2>
          {group.items.map(item => <button type="button" key={item.id} aria-current={sectionId === item.id ? 'page' : undefined} onClick={() => setSectionId(item.id)} aria-controls="dev-panel-content">
            <item.icon size={17} aria-hidden="true" /><span>{item.label}</span>{sectionId === item.id && <ChevronRight size={14} aria-hidden="true" />}
          </button>)}
        </div>)}
        {!visibleGroups.some(group => group.items.length) && <p className="dev-panel-nav-empty" role="status">Không tìm thấy chức năng. Thử tên khác hoặc xóa từ khóa.</p>}
  </nav>;

}
