import { useState } from 'react';
import { ArrowUpRight, Check, Copy, Plug } from 'lucide-react';
import './userGuide.css';

const examples = [
  'Kiểm tra dữ liệu pickup và delivery đang có đến ngày nào, đồng bộ gần nhất khi nào.',
  'Lấy 1st Delivery và ODR của SPB tại HCM trong ngày mới nhất có dữ liệu. Ghi rõ ngày và mẫu số.',
  'Vẽ xu hướng 1st Pickup của SPE trong 7 ngày gần nhất có dữ liệu, ghi rõ khoảng ngày.',
  'Giải thích cách tính và target của chỉ số OPR.',
];

function CopyButton({ value, label, onResult }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onResult('Đã sao chép. Bạn có thể dán vào ứng dụng AI.');
    } catch {
      onResult('Chưa sao chép được. Hãy chọn và sao chép nội dung trực tiếp.');
    }
  };
  return <button type="button" className="guide-copy" onClick={copy} aria-label={label}>
    {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
    <span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
  </button>;
}

// Public connection URL only. Never place tokens or credentials in VITE_ values.
const configuredUrl = (import.meta.env.VITE_KAS_MCP_URL || 'https://kas-shopee-performance.vercel.app/api/mcp').trim();
function publicMcpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? url.href : '';
  } catch { return ''; }
}
const mcpUrl = publicMcpUrl(configuredUrl);

export default function UserGuide({ onNavigate }) {
  const [notice, setNotice] = useState('');
  const [platform, setPlatform] = useState('chatgpt');
  const codexCommand = `codex mcp add kas-ghn --url ${mcpUrl}\ncodex mcp login kas-ghn`;
  return <article className="user-guide" aria-labelledby="guide-title">
    <header className="guide-heading">
      <h1 id="guide-title">Bắt đầu với GHN KAS</h1>
      <p>Xem số liệu trên dashboard hoặc hỏi bằng ngôn ngữ tự nhiên qua MCP KAS GHN.</p>
      <nav className="guide-jumps" aria-label="Nội dung hướng dẫn">
        <a href="#guide-dashboard">Dùng dashboard</a><a href="#guide-mcp">Kết nối MCP</a><a href="#guide-examples">Câu hỏi mẫu</a>
      </nav>
    </header>

    <section id="guide-dashboard" className="guide-section" aria-labelledby="dashboard-guide-title">
      <h2 id="dashboard-guide-title">Dùng dashboard</h2>
      <ol className="guide-steps">
        <li><div><h3>Chọn phạm vi cần xem</h3><p>Chọn client SPB hoặc SPE, sau đó lọc Vùng và Loại Hub trên thanh đầu trang của báo cáo. Kiểm tra phạm vi trước khi đọc số liệu.</p></div></li>
        <li><div><h3>Mở báo cáo phù hợp</h3><p>Bắt đầu từ Tổng quan để xem KPI và xu hướng. Vào Chi tiết Vùng/Hub để đối chiếu từng địa bàn; dùng % Ca 1 theo lane để xem tỷ lệ đơn về ca 1.</p>
          <div className="guide-report-links">{[['home', 'Tổng quan'], ['report1', 'Chi tiết Vùng/Hub'], ['report5', '% Ca 1 theo lane']].map(([id, label]) => <button type="button" key={id} onClick={() => onNavigate(id)}>{label}<ArrowUpRight size={14} aria-hidden="true" /></button>)}</div>
        </div></li>
        <li><div><h3>Kiểm tra ngày dữ liệu, rồi xuất báo cáo</h3><p>Mở trạng thái đồng bộ để xem dữ liệu đang có đến ngày nào. Ở báo cáo hỗ trợ xuất, bấm nút tải, chọn bộ lọc và bấm tải trong hộp thoại để tạo file.</p></div></li>
      </ol>
      <p className="guide-note">Ngày dữ liệu khác với thời điểm đồng bộ. Dữ liệu vừa đồng bộ chưa chắc là số liệu của hôm nay. Tab Leadtime và Insight trên dashboard hiện đang phát triển.</p>
    </section>

    <section id="guide-mcp" className="guide-section" aria-labelledby="mcp-guide-title">
      <h2 id="mcp-guide-title"><Plug size={22} aria-hidden="true" /> Kết nối MCP KAS GHN</h2>
      <p>MCP giúp ứng dụng AI gọi các công cụ KAS để đọc KPI, xem xu hướng, tra cứu ca 1, leadtime, định nghĩa chỉ số và kỳ dữ liệu.</p>
      <div className="guide-connection">
        <div><strong>Địa chỉ máy chủ MCP</strong><p>{mcpUrl ? 'Kết nối từ xa qua HTTP · Xác thực bằng OAuth.' : 'Địa chỉ kết nối chưa hợp lệ. Liên hệ Vinh để nhận URL được xác nhận.'}</p></div>
        {mcpUrl && <div className="guide-url"><code>{mcpUrl}</code><CopyButton value={mcpUrl} label="Sao chép địa chỉ máy chủ MCP" onResult={setNotice} /></div>}
      </div>
      <ol className="guide-steps">
        <li><div><h3>Chuẩn bị ứng dụng AI hỗ trợ MCP</h3><p>Dùng ứng dụng và tài khoản được quản trị viên xác nhận có thể kết nối MCP KAS GHN. Tên menu và khả năng thêm MCP phụ thuộc ứng dụng, gói tài khoản và quyền của workspace.</p></div></li>
        <li><div><h3>Thêm kết nối KAS GHN và đăng nhập</h3><p>Thêm máy chủ với tên KAS GHN và URL ở trên. Chọn OAuth nếu ứng dụng yêu cầu chọn cách xác thực, sau đó đăng nhập theo luồng của máy chủ để cấp quyền truy cập.</p></div></li>
        <li><div><h3>Bật kết nối trong cuộc trò chuyện</h3><p>Chọn KAS GHN nếu ứng dụng yêu cầu, rồi thử câu hỏi kiểm tra kỳ dữ liệu bên dưới. Kết nối hoạt động khi AI trả về dữ liệu từ công cụ KAS cùng ngày dữ liệu tương ứng.</p></div></li>
      </ol>
      <div className="guide-platforms">
        <h3>Cách thêm trên ứng dụng của bạn</h3>
        <p>Cách cài phụ thuộc ứng dụng AI bạn sử dụng, không phụ thuộc riêng tên model.</p>
        <div className="guide-platform-picker" role="group" aria-label="Chọn ứng dụng để xem hướng dẫn cài MCP">
          {[['chatgpt', 'ChatGPT'], ['claude', 'Claude'], ['codex', 'Codex']].map(([id, label]) => <button type="button" key={id} aria-pressed={platform === id} onClick={() => setPlatform(id)}>{label}</button>)}
        </div>
        <div className="guide-platform-content" key={platform}>
          {platform === 'chatgpt' && <>
            <ol><li>Mở <strong>Plugins → + → Add custom MCP server</strong>.</li><li>Đặt tên KAS GHN, dán URL vào phần Connection và cấu hình OAuth.</li><li>Đọc thông báo quyền truy cập, tạo plugin và kiểm tra danh sách công cụ.</li><li>Cài plugin, mở chat mới, gõ <strong>@</strong> và chọn KAS GHN để hỏi.</li></ol>
            <p>Nếu tài khoản còn giao diện cũ: vào Settings → Apps → Create. Quyền tạo kết nối phụ thuộc tài khoản và chính sách workspace.</p>
            <a href="https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt" target="_blank" rel="noreferrer">Hướng dẫn chính thức của OpenAI <ArrowUpRight size={14} aria-hidden="true" /></a>
          </>}
          {platform === 'claude' && <>
            <ol><li>Mở <strong>Customize → Connectors → + Add → Add custom connector</strong>.</li><li>Nhập tên KAS GHN và URL máy chủ, rồi chọn Continue.</li><li>Kiểm tra cấu hình xác thực, chọn đăng nhập và hoàn tất thêm connector.</li><li>Trong chat, chọn <strong>+ → Connectors</strong> và bật KAS GHN.</li></ol>
            <p>Với Team/Enterprise, quản trị viên cần thêm connector cho tổ chức trước. Tên menu có thể khác theo phiên bản.</p>
            <a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noreferrer">Hướng dẫn chính thức của Claude <ArrowUpRight size={14} aria-hidden="true" /></a>
          </>}
          {platform === 'codex' && <>
            <p><strong>Cài qua giao diện Plugins</strong></p>
            <ol>
              <li>Mở <strong>Plugins</strong>, chọn <strong>+ → Add custom plugin</strong> (một số phiên bản ghi <strong>Add custom MCP server</strong>).</li>
              <li>Đặt tên KAS GHN, dán URL máy chủ ở trên và chọn xác thực <strong>OAuth</strong>.</li>
              <li>Kiểm tra quyền truy cập, hoàn tất tạo plugin, rồi cài và đăng nhập khi ứng dụng yêu cầu.</li>
              <li>Mở chat Codex và chọn KAS GHN qua <strong>@</strong> hoặc <strong>Sources → Use plugins</strong> nếu giao diện hiển thị mục này. Thử câu hỏi kiểm tra kỳ dữ liệu bên dưới.</li>
            </ol>
            <p>ChatGPT và Codex dùng chung danh mục plugin. Nếu đã có KAS GHN trong danh sách plugin đã cài, chọn dùng trực tiếp; không cần tạo lại. Quyền tạo và sử dụng phụ thuộc workspace.</p>
            <a href="https://learn.chatgpt.com/docs/plugins" target="_blank" rel="noreferrer">Tài liệu plugin chính thức cho ChatGPT và Codex <ArrowUpRight size={14} aria-hidden="true" /></a>
            <details>
              <summary>Cách khác: thêm MCP trực tiếp bằng Codex CLI</summary>
              <p>Nếu đã cài Codex CLI, chạy hai lệnh sau trong terminal:</p>
              {mcpUrl && <div className="guide-code"><pre><code>{codexCommand}</code></pre><CopyButton value={codexCommand} label="Sao chép lệnh cài MCP cho Codex" onResult={setNotice} /></div>}
              <p>Kiểm tra bằng <code>codex mcp list</code> hoặc dùng <code>/mcp</code> trong Codex CLI. Cách này cấu hình MCP trực tiếp cho Codex trên máy đang dùng.</p>
              <a href="https://learn.chatgpt.com/docs/extend/mcp" target="_blank" rel="noreferrer">Tài liệu cấu hình MCP <ArrowUpRight size={14} aria-hidden="true" /></a>
            </details>
          </>}
        </div>
        <small>Đối chiếu tài liệu ngày 29/10/2026. Nếu không thấy menu tương ứng, kiểm tra phiên bản ứng dụng và quyền workspace.</small>
      </div>
      <p className="guide-note">Bộ lọc trên dashboard không tự chuyển sang ứng dụng AI bên ngoài. Khi hỏi MCP, hãy ghi rõ client, thời gian và vùng hoặc Hub cần xem.</p>
    </section>

    <section id="guide-examples" className="guide-section" aria-labelledby="examples-guide-title">
      <h2 id="examples-guide-title">Thử một câu hỏi</h2>
      <p>Sao chép, chỉnh lại phạm vi rồi dán vào cuộc trò chuyện đã bật KAS GHN.</p>
      <ul className="guide-prompts">{examples.map((example, i) => <li key={example}><p>{example}</p><CopyButton value={example} label={`Sao chép câu hỏi mẫu ${i + 1}`} onResult={setNotice} /></li>)}</ul>
      <p role="status" aria-live="polite" className="guide-copy-status">{notice}</p>
    </section>

    <section className="guide-section guide-troubleshooting" aria-labelledby="troubleshooting-guide-title">
      <h2 id="troubleshooting-guide-title">Khi chưa dùng được</h2>
      <details><summary>Không thấy chỗ thêm MCP hoặc KAS GHN</summary><p>Kiểm tra ứng dụng có hỗ trợ MCP từ xa và tài khoản có quyền thêm kết nối. Nếu workspace quản lý ứng dụng tập trung, nhờ quản trị viên cấp quyền hoặc cung cấp cách cài phù hợp.</p></details>
      <details><summary>Kết nối báo lỗi hoặc yêu cầu đăng nhập lại</summary><p>Kiểm tra URL và đăng nhập lại bằng OAuth. Với Codex CLI, chạy <code>codex mcp login kas-ghn</code>. Nếu mở URL bằng trình duyệt thấy lỗi 405 “Chỉ hỗ trợ POST”, hãy thêm URL vào ứng dụng MCP thay vì mở như trang web. Nếu vẫn lỗi, gửi Vinh tên ứng dụng, nội dung lỗi và thời điểm xảy ra; không gửi mật khẩu hoặc token.</p></details>
      <details><summary>AI trả lời thiếu số liệu hoặc khác dashboard</summary><p>Hỏi kỳ dữ liệu trước, sau đó đối chiếu cùng client, ngày, vùng và chỉ số. Yêu cầu AI gọi công cụ KAS và nêu rõ phạm vi. Nếu nguồn không có dữ liệu, không dùng số ước tính thay thế.</p></details>
    </section>
  </article>;
}
