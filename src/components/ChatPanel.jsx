import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Database, Eye, EyeOff, LoaderCircle, SendHorizontal, Square, X } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import Mascot from './chat/Mascot';
import { getMascotState } from '../utils/mascotState';
import ChatMessageMarkdown from './chat/ChatMessageMarkdown';

const QUICK_QUESTIONS = [
  'Dữ liệu mới nhất của SPB có tới ngày nào?',
  'ODR SPB toàn quốc hôm nay là bao nhiêu?',
  'Giải thích ngắn gọn chỉ số Ca 1.'
];

function createRequestId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function toChatError(payload, fallback) {
  return payload?.error?.message || payload?.message || fallback;
}

async function readSse(response, onEvent) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Không nhận được luồng phản hồi từ chatbot.');

  const decoder = new TextDecoder();
  let buffer = '';
  const dispatchFrame = frame => {
    const lines = frame.split(/\r?\n/);
    let eventName = 'message';
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    let payload;
    try {
      payload = JSON.parse(dataLines.join('\n'));
    } catch {
      throw new Error('Phản hồi chatbot không đúng định dạng.');
    }
    onEvent(eventName, payload);
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';
    frames.forEach(dispatchFrame);
    if (done) break;
  }
  if (buffer.trim()) dispatchFrame(buffer);
}

function statusText(status) {
  if (status?.phase === 'querying_database') return 'Đang tra cứu dữ liệu vận hành…';
  if (status?.phase === 'answering') return 'Đang tổng hợp câu trả lời…';
  return 'Đang hiểu câu hỏi…';
}

function SourceList({ sources }) {
  if (!sources?.length) return null;
  const uniqueSources = Array.from(new Map(sources.map(source => [source.evidenceId || `${source.tool}-${source.dataAsOf}`, source])).values());
  return (
    <div className="chat-sources" aria-label="Nguồn dữ liệu đã truy vấn">
      <span className="chat-sources-label"><Database size={13} /> Nguồn DB</span>
      {uniqueSources.map(source => (
        <span className="chat-source-chip" key={source.evidenceId || `${source.tool}-${source.dataAsOf}`}>
          {source.evidenceId || source.tool}
          {source.dataAsOf && ` · tới ${source.dataAsOf}`}
        </span>
      ))}
    </div>
  );
}

export default function ChatPanel({ isOpen, onOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [failedQuestion, setFailedQuestion] = useState(null);
  const [quota, setQuota] = useState(null);
  const [focused, setFocused] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [mascotHidden, setMascotHidden] = useState(() => window.localStorage.getItem('kas-mascot-hidden') === 'true');
  const [visibilityMenuOpen, setVisibilityMenuOpen] = useState(false);
  const launcherRef = useRef(null);
  const revealRef = useRef(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    let isCancelled = false;
    async function loadQuota() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token || isCancelled) return;
        const res = await fetch('/api/chat', {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (res.ok && !isCancelled) {
          const body = await res.json();
          if (body?.quota) setQuota(body.quota);
        }
      } catch {
        // Non-blocking quota check
      }
    }
    loadQuota();
    return () => { isCancelled = true; };
  }, [isOpen]);

  const history = useMemo(() => messages.slice(-20).map(({ role, content }) => ({ role, content })), [messages]);
  const isStreaming = Boolean(pending);
  const mascotState = getMascotState({
    isOpen,
    error,
    pending,
    status,
    focused,
    completed: announcement === 'Đã trả lời xong.'
  });

  useEffect(() => {
    if (!isOpen) return undefined;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        abortRef.current?.abort();
        onClose();
        window.requestAnimationFrame(() => (mascotHidden ? revealRef.current : launcherRef.current)?.focus());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!messages.length && !pending && !error && !failedQuestion) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [messages, pending, error, failedQuestion, status, isOpen]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!visibilityMenuOpen) return undefined;
    const closeMenu = () => setVisibilityMenuOpen(false);
    window.addEventListener('click', closeMenu);
    window.addEventListener('keydown', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('keydown', closeMenu);
    };
  }, [visibilityMenuOpen]);

  const setMascotVisibility = hidden => {
    window.localStorage.setItem('kas-mascot-hidden', String(hidden));
    setMascotHidden(hidden);
    setVisibilityMenuOpen(false);
    window.requestAnimationFrame(() => (hidden ? revealRef.current : launcherRef.current)?.focus());
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const closePanel = () => {
    stopStreaming();
    setFocused(false);
    onClose();
    window.requestAnimationFrame(() => (mascotHidden ? revealRef.current : launcherRef.current)?.focus());
  };

  const submitQuestion = async question => {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion || abortRef.current) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setDraft('');
    setError(null);
    setFailedQuestion(null);
    setFocused(false);
    setAnnouncement('');
    setStatus({ phase: 'planning' });
    setPending({ question: normalizedQuestion, answer: '', sources: [] });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!session?.access_token) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi thử lại.');

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ requestId: createRequestId(), question: normalizedQuestion, history }),
        signal: controller.signal
      });

      if (!response.ok) {
        let payload;
        try { payload = await response.json(); } catch { /* Use the safe fallback below. */ }
        if (response.status === 429) {
          setQuota(prev => prev ? { ...prev, remainingTurns: 0 } : null);
        }
        throw new Error(toChatError(payload, `Chatbot chưa phản hồi được (${response.status}).`));
      }

      let completed = false;
      let answer = '';
      let sources = [];
      await readSse(response, (eventName, payload) => {
        if (eventName === 'message_start' && payload.quota) setQuota(payload.quota);
        if (eventName === 'status') setStatus(payload);
        if (eventName === 'text_delta') {
          answer += payload.delta || '';
          setPending(current => current ? { ...current, answer } : current);
        }
        if (eventName === 'source') {
          sources = [...sources, payload];
          setPending(current => current ? { ...current, sources } : current);
        }
        if (eventName === 'error') throw new Error(toChatError(payload, 'Chatbot gặp lỗi khi xử lý câu hỏi.'));
        if (eventName === 'message_end') completed = true;
      });

      if (!completed) throw new Error('Luồng chat kết thúc trước khi có câu trả lời hoàn chỉnh.');
      if (!answer.trim()) throw new Error('Chatbot chưa tạo được nội dung trả lời. Vui lòng thử lại.');
      setMessages(current => [...current, { role: 'user', content: normalizedQuestion }, { role: 'assistant', content: answer, sources }]);
      setPending(null);
      setStatus(null);
      setAnnouncement('Đã trả lời xong.');
    } catch (requestError) {
      const wasAborted = controller.signal.aborted;
      setPending(null);
      setStatus(null);
      setFocused(false);
      setError(wasAborted ? null : requestError.message || 'Không thể gửi câu hỏi lúc này.');
      setFailedQuestion(wasAborted ? null : normalizedQuestion);
      setAnnouncement(wasAborted ? 'Đã dừng trả lời.' : 'Chưa thể trả lời. Vui lòng thử lại.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleSubmit = event => {
    event.preventDefault();
    submitQuestion(draft);
  };

  return (
    <>
    {!isOpen && !mascotHidden && <div className="chat-mascot-launcher">
      <button ref={launcherRef} type="button" className="chat-fab chat-fab--mascot"
        onClick={onOpen} onContextMenu={event => { event.preventDefault(); setVisibilityMenuOpen(true); }}
        aria-expanded="false" aria-controls="kas-chat-panel" aria-haspopup="menu" title="Mở Trợ lý KAS"
        aria-label="Mở Trợ lý KAS. Click chuột phải để ẩn mascot">
        <Mascot state="idle" active />
      </button>
      {visibilityMenuOpen && <div className="chat-mascot-menu" role="menu" aria-label="Tùy chọn mascot">
        <button type="button" role="menuitem" onClick={() => setMascotVisibility(true)}><EyeOff size={15} /> Ẩn mascot</button>
      </div>}
    </div>}
    {!isOpen && mascotHidden && <div className="chat-mascot-reveal">
      <button ref={revealRef} type="button" onClick={() => setMascotVisibility(false)}
        onContextMenu={event => { event.preventDefault(); setMascotVisibility(false); }}
        title="Hiện Trợ lý KAS" aria-label="Hiện Trợ lý KAS"><Eye size={16} /> Hiện trợ lý</button>
    </div>}
    {isOpen && <section id="kas-chat-panel" className="chat-panel" role="dialog" aria-labelledby="chat-panel-title">
      <header className="chat-panel-header">
        <div className="chat-panel-title">
          <span className="chat-mascot-avatar"><Mascot state={mascotState} active={isOpen} /></span>
          <div>
            <h2 id="chat-panel-title">Trợ lý KAS</h2>
            <p role="status" aria-live="polite">{error ? 'Chưa thể trả lời' : pending ? (pending.answer ? 'Đang trả lời…' : statusText(status)) : focused ? 'Mình đang nghe…' : announcement || 'Tra cứu dữ liệu KAS'}</p>
          </div>
        </div>
        <button type="button" className="chat-icon-button" onClick={closePanel} title="Đóng trợ lý" aria-label="Đóng trợ lý">
          <X size={18} />
        </button>
      </header>

      <div className="chat-panel-body" ref={scrollRef}>
        {!messages.length && !pending && !failedQuestion && !error && (
          <div className="chat-welcome">
            <div className="chat-mascot-intro"><Mascot state="idle" active={isOpen} /></div>
            <h3>Hỏi dữ liệu KAS</h3>
            <p>Trợ lý không đọc màn hình hay bộ lọc hiện tại. Mỗi số liệu được truy vấn từ database và kèm evidence khi có.</p>
            <div className="chat-suggestions">
              {QUICK_QUESTIONS.map(question => (
                <button type="button" key={question} onClick={() => submitQuestion(question)}>{question}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <article className={`chat-message chat-message--${message.role}`} key={`${message.role}-${index}`}>
            <div className="chat-message-bubble">
              {message.role === 'assistant' ? (
                <ChatMessageMarkdown content={message.content} />
              ) : (
                message.content.split('\n').map((line, lineIndex) => <p key={lineIndex}>{line || '\u00a0'}</p>)
              )}
            </div>
            {message.role === 'assistant' && <SourceList sources={message.sources} />}
          </article>
        ))}

        {pending && (
          <>
            <article className="chat-message chat-message--user"><div className="chat-message-bubble"><p>{pending.question}</p></div></article>
            <article className="chat-message chat-message--assistant">
              <div className="chat-message-bubble chat-message-bubble--pending">
                {pending.answer
                  ? <ChatMessageMarkdown content={pending.answer} />
                  : <span className="chat-loading"><LoaderCircle size={16} /> {statusText(status)}</span>}
              </div>
              <SourceList sources={pending.sources} />
            </article>
          </>
        )}

        {failedQuestion && !pending && (
          <article className="chat-message chat-message--user">
            <div className="chat-message-bubble"><p>{failedQuestion}</p></div>
          </article>
        )}
        {error && <div className="chat-error" role="alert">{error}</div>}
      </div>

      <form className="chat-composer" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="chat-question">Câu hỏi cho Trợ lý KAS</label>
        <textarea
          ref={inputRef}
          id="chat-question"
          value={draft}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submitQuestion(draft);
            }
          }}
          placeholder="Ví dụ: ODR SPB toàn quốc hôm nay?"
          rows={2}
          disabled={isStreaming}
        />
        <div className="chat-composer-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span>Enter để gửi · Shift + Enter xuống dòng</span>
            {quota && !quota.isUnlimited && (
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background: quota.remainingTurns <= 0 ? 'rgba(239, 68, 68, 0.15)' : quota.remainingTurns <= 2 ? 'rgba(245, 158, 11, 0.15)' : 'var(--surface-hover)',
                  color: quota.remainingTurns <= 0 ? 'var(--status-danger-fg)' : quota.remainingTurns <= 2 ? '#d97706' : 'var(--text-muted)'
                }}
              >
                Còn {quota.remainingTurns}/{quota.dailyLimit || 10} lượt hôm nay
              </span>
            )}
          </div>
          {isStreaming ? (
            <button type="button" className="chat-stop-button" onClick={stopStreaming}><Square size={13} /> Dừng</button>
          ) : (
            <button type="submit" className="chat-send-button" disabled={!draft.trim() || (quota && !quota.isUnlimited && quota.remainingTurns <= 0)} aria-label="Gửi câu hỏi"><SendHorizontal size={17} /></button>
          )}
        </div>
      </form>
    </section>}
    </>
  );
}
