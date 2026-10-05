import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Database, Eye, EyeOff, LoaderCircle, Maximize2, Minimize2, RotateCcw, SendHorizontal, Square, X } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import Mascot from './chat/Mascot';
import { getMascotState } from '../utils/mascotState';
import ChatMessageMarkdown from './chat/ChatMessageMarkdown';
import ChatQueryCard from './chat/ChatQueryCard';
import { canRetry, formatDataScope } from '../utils/chatRetry';
import { buildFollowupSuggestions, getFallbackSuggestions } from '../utils/chatSuggestions';

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
  if (status?.phase === 'awaiting_input') return 'Chờ bạn chọn…';
  if (status?.phase === 'querying_database') return 'Đang tra cứu dữ liệu vận hành…';
  if (status?.phase === 'searching_public_information') return 'Đang tra cứu nguồn công khai…';
  if (status?.phase === 'answering') return 'Đang tổng hợp câu trả lời…';
  return 'Đang hiểu câu hỏi…';
}

function DataScopeBlock({ sources }) {
  if (!sources?.length) return null;
  const uniqueSources = Array.from(
    new Map(sources.map(source => [source.evidenceId || `${source.tool}-${source.dataAsOf}`, source])).values()
  ).filter(source => source.scope || source.dataAsOf || source.syncedAt);
  if (!uniqueSources.length) return null;

  return (
    <details className="chat-data-details">
      <summary>Chi tiết dữ liệu</summary>
      <div className="chat-data-scope-container" aria-label="Phạm vi dữ liệu đã truy vấn">
      {uniqueSources.map(source => {
        const formatted = formatDataScope(source);
        if (!formatted) return null;
        const key = formatted.evidenceId || `${formatted.tool}-${source.dataAsOf}`;

        return (
          <div className="chat-data-scope" key={key}>
            <div className="chat-data-scope-header">
              <span className="chat-data-scope-title">
                <Database size={13} aria-hidden="true" />
                <span>Phạm vi dữ liệu</span>
              </span>
            </div>
            <div className="chat-data-scope-grid">
              {formatted.scopeDesc && (
                <div className="chat-data-scope-item">
                  <span className="chat-data-scope-label">Đối tượng:</span>
                  <span className="chat-data-scope-value">{formatted.scopeDesc}</span>
                </div>
              )}
              {formatted.dateRangeText && (
                <div className="chat-data-scope-item">
                  <span className="chat-data-scope-label">Kỳ báo cáo:</span>
                  <span className="chat-data-scope-value">{formatted.dateRangeText}</span>
                </div>
              )}
              {formatted.dataAsOfText && (
                <div className="chat-data-scope-item">
                  <span className="chat-data-scope-label">Dữ liệu tới:</span>
                  <span className="chat-data-scope-value">{formatted.dataAsOfText}</span>
                </div>
              )}
              {formatted.syncedAtText && (
                <div className="chat-data-scope-item">
                  <span className="chat-data-scope-label">Đồng bộ lúc:</span>
                  <span className="chat-data-scope-value">{formatted.syncedAtText}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </details>
  );
}

function formatSuggestionDate(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
  return match ? `${match[3]}/${match[2]}` : dateStr;
}

export default function ChatPanel({ isOpen, onOpen, onClose, screenContext = null }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [failedRequest, setFailedRequest] = useState(null);
  const [quota, setQuota] = useState(null);
  const [focused, setFocused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [mascotHidden, setMascotHidden] = useState(() => window.localStorage.getItem('kas-mascot-hidden') === 'true');
  const [visibilityMenuOpen, setVisibilityMenuOpen] = useState(false);
  const [suggestionData, setSuggestionData] = useState(null);
  const suggestionScopeKey = JSON.stringify({ activeTab: screenContext?.activeTab || 'report1', client: screenContext?.client || 'SPB', regions: screenContext?.regions ?? null, hubTypes: screenContext?.hubTypes ?? null });
  const suggestionContext = useMemo(() => JSON.parse(suggestionScopeKey), [suggestionScopeKey]);
  const fallbackSuggestions = useMemo(() => getFallbackSuggestions(suggestionContext.activeTab, suggestionContext), [suggestionContext]);
  const visibleSuggestions = suggestionData?.cacheKey === suggestionScopeKey ? suggestionData : fallbackSuggestions;
  const clientCacheRef = useRef(new Map());
  const launcherRef = useRef(null);
  const revealRef = useRef(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!isOpen || messages.length > 0 || pending || failedRequest) return;
    const cacheKey = suggestionScopeKey;

    const cached = clientCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
      setSuggestionData(cached.data);
      return;
    }

    let isCancelled = false;
    const controller = new AbortController();
    async function loadSuggestions() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token || isCancelled) {
          if (!isCancelled) setSuggestionData({ ...fallbackSuggestions, cacheKey });
          return;
        }

        const res = await fetch('/api/chat-suggestions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ screenContext: suggestionContext }),
          signal: controller.signal
        });

        if (res.ok && !isCancelled) {
          const body = await res.json();
          if (body.quotaExceeded) {
            setSuggestionData({ ...fallbackSuggestions, cacheKey });
          } else if (body.suggestions) {
            const nextData = {
              ...body,
              context: suggestionContext,
              cacheKey,
              dataAsOf: body.basis === 'template' ? null : body.dataAsOf ?? null
            };
            clientCacheRef.current.set(cacheKey, { at: Date.now(), data: nextData });
            setSuggestionData(nextData);
          }
        } else if (!isCancelled) {
          setSuggestionData({ ...fallbackSuggestions, cacheKey });
        }
      } catch {
        if (!isCancelled) {
          setSuggestionData({ ...fallbackSuggestions, cacheKey });
        }
      }
    }

    loadSuggestions();
    return () => { isCancelled = true; controller.abort(); };
  }, [isOpen, suggestionScopeKey, suggestionContext, fallbackSuggestions, messages.length, pending, failedRequest]);

  // Clean up legacy localStorage keys once
  useEffect(() => {
    try {
      window.localStorage.removeItem('kas-chat-model');
      window.localStorage.removeItem('kas-chat-config-change');
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('kas-chat-reasoning-effort:')) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // Safe cleanup without throwing
    }
  }, []);

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
  const followupSuggestions = useMemo(() => buildFollowupSuggestions(messages.at(-1)), [messages]);
  const suggestionsDisabled = isStreaming || Boolean(quota && !quota.isUnlimited && quota.remainingTurns <= 0);
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
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        if (event.defaultPrevented) return;
        if (isExpanded) {
          setIsExpanded(false);
          return;
        }
        abortRef.current?.abort();
        onClose();
        window.requestAnimationFrame(() => (mascotHidden ? revealRef.current : launcherRef.current)?.focus());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, mascotHidden, isExpanded]);

  useEffect(() => {
    if (!messages.length && !pending && !error && !failedRequest) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [messages, pending, error, failedRequest, status, isOpen, followupSuggestions]);

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

  const submitQuestion = async (question, query = null, displayQuestion = question, context = screenContext) => {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion || abortRef.current) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setDraft('');
    setError(null);
    setFailedRequest(null);
    setFocused(false);
    setAnnouncement('');
    setStatus({ phase: 'planning' });
    setMessages(current => current.map(message => (
      message.interaction && !message.interaction.selection
        ? { ...message, interaction: { ...message.interaction, dismissed: true } }
        : message
    )));
    setPending({ question: displayQuestion, answer: '', sources: [], interaction: null });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!session?.access_token) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi thử lại.');

      const requestBody = { requestId: createRequestId(), question: normalizedQuestion, history };
      if (query) requestBody.query = query;
      if (context) requestBody.screenContext = context;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(requestBody),
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
      let interaction = null;
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
        if (eventName === 'interaction') {
          interaction = payload;
          setPending(current => current ? { ...current, interaction } : current);
        }
        if (eventName === 'error') throw new Error(toChatError(payload, 'Chatbot gặp lỗi khi xử lý câu hỏi.'));
        if (eventName === 'message_end') completed = true;
      });

      if (!completed) throw new Error('Luồng chat kết thúc trước khi có câu trả lời hoàn chỉnh.');
      if (!answer.trim() && !interaction) throw new Error('Chatbot chưa tạo được nội dung trả lời. Vui lòng thử lại.');
      const assistantContent = answer.trim() || interaction.prompt;
      setMessages(current => [...current,
        { role: 'user', content: displayQuestion },
        { role: 'assistant', content: assistantContent, sources, interaction, requestQuestion: normalizedQuestion, screenContext: context }
      ]);
      setPending(null);
      setStatus(null);
      setAnnouncement('Đã trả lời xong.');
    } catch (requestError) {
      const wasAborted = controller.signal.aborted;
      setPending(null);
      setStatus(null);
      setFocused(false);
      const isQuota = requestError?.message?.includes('hết 10 lượt')
        || requestError?.code === 'CHAT_QUOTA_EXCEEDED'
        || (quota && !quota.isUnlimited && quota.remainingTurns <= 0);
      setError(wasAborted ? null : requestError.message || 'Không thể gửi câu hỏi lúc này.');
      setFailedRequest(wasAborted ? null : {
        question: normalizedQuestion,
        query,
        displayQuestion,
        screenContext: context,
        isQuotaExceeded: Boolean(isQuota)
      });
      setAnnouncement(wasAborted ? 'Đã dừng trả lời.' : 'Chưa thể trả lời. Vui lòng thử lại.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const retryStatus = canRetry(failedRequest, quota);
  const handleRetry = () => {
    if (!failedRequest || isStreaming || !retryStatus.allowed) return;
    const { question, query, displayQuestion, screenContext: context } = failedRequest;
    submitQuestion(question, query, displayQuestion, context);
  };

  const handleSubmit = event => {
    event.preventDefault();
    submitQuestion(draft);
  };

  const handleInteractionSubmit = (messageIndex, query, message) => {
    if (abortRef.current) return;
    setMessages(current => current.map((item, index) => (
      index === messageIndex && item.interaction
        ? { ...item, interaction: { ...item.interaction, selection: message.summary } }
        : item
    )));
    submitQuestion(message.question, query, message.summary);
  };

  const renderSuggestions = data => (
    <div className="chat-suggestions">
      {(data.items || data.suggestions.map(question => ({ id: question, label: question, question }))).map(item => (
        <button type="button" key={item.id} disabled={suggestionsDisabled}
          onClick={() => submitQuestion(item.question, null, item.question, data.context || screenContext)}>{item.label}</button>
      ))}
    </div>
  );

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
    {isOpen && <section id="kas-chat-panel" className={`chat-panel${isExpanded ? ' chat-panel--expanded' : ''}`} role="dialog" aria-labelledby="chat-panel-title">
      <header className="chat-panel-header">
        <div className="chat-panel-title">
          <span className="chat-mascot-avatar"><Mascot state={mascotState} active={isOpen} /></span>
          <div>
            <h2 id="chat-panel-title">Trợ lý KAS</h2>
            <p role="status" aria-live="polite">{error ? 'Chưa thể trả lời' : pending ? (pending.answer ? 'Đang trả lời…' : statusText(status)) : focused ? 'Mình đang nghe…' : announcement || 'Tra cứu dữ liệu KAS'}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <button type="button" className="chat-icon-button" onClick={() => setIsExpanded(current => !current)}
            title={isExpanded ? 'Thu gọn cửa sổ' : 'Mở rộng cửa sổ'}
            aria-label={isExpanded ? 'Thu gọn cửa sổ' : 'Mở rộng cửa sổ'} aria-pressed={isExpanded}>
            {isExpanded ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
          </button>
          <button type="button" className="chat-icon-button" onClick={closePanel} title="Đóng trợ lý" aria-label="Đóng trợ lý">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="chat-panel-body" ref={scrollRef}>
        {!messages.length && !pending && !failedRequest && !error && (
          <div className="chat-welcome">
            <div className="chat-mascot-intro"><Mascot state="idle" active={isOpen} /></div>
            <h3>Hỏi dữ liệu KAS</h3>
            {visibleSuggestions.dataAsOf && <p className="chat-suggestions-basis">Dữ liệu đến {formatSuggestionDate(visibleSuggestions.dataAsOf)}</p>}
            {renderSuggestions(visibleSuggestions)}
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
            {message.role === 'assistant' && message.interaction && (
              <ChatQueryCard
                interaction={message.interaction}
                disabled={isStreaming || Boolean(quota && !quota.isUnlimited && quota.remainingTurns <= 0)}
                onSubmit={(query, selectionMessage) => handleInteractionSubmit(index, query, selectionMessage)}
              />
            )}
            {message.role === 'assistant' && <DataScopeBlock sources={message.sources} />}
          </article>
        ))}

        {messages.length > 0 && !pending && !failedRequest && !error && followupSuggestions && (
          <div className="chat-followups" aria-label="Gợi ý hỏi tiếp">
            <p className="chat-followups-title">Tìm hiểu tiếp</p>
            {renderSuggestions(followupSuggestions)}
          </div>
        )}

        {pending && (
          <>
            <article className="chat-message chat-message--user"><div className="chat-message-bubble"><p>{pending.question}</p></div></article>
            <article className="chat-message chat-message--assistant">
              <div className="chat-message-bubble chat-message-bubble--pending">
                {pending.answer
                  ? <ChatMessageMarkdown content={pending.answer} />
                  : pending.interaction
                    ? <p>{pending.interaction.prompt}</p>
                    : <span className="chat-loading"><LoaderCircle size={16} /> {statusText(status)}</span>}
              </div>
              {pending.interaction && <ChatQueryCard interaction={pending.interaction} disabled onSubmit={() => {}} />}
            </article>
          </>
        )}

        {failedRequest && !pending && (
          <article className="chat-message chat-message--user">
            <div className="chat-message-bubble"><p>{failedRequest.displayQuestion}</p></div>
          </article>
        )}
        {error && (
          <div className="chat-error-card" role="alert">
            <div className="chat-error-message">{error}</div>
            {failedRequest && (
              <div className="chat-error-actions">
                <button
                  type="button"
                  className="chat-retry-button"
                  onClick={handleRetry}
                  disabled={!retryStatus.allowed || isStreaming}
                  aria-label={retryStatus.allowed ? 'Thử lại câu hỏi vừa gửi' : `Không thể thử lại: ${retryStatus.reason}`}
                  title={retryStatus.allowed ? 'Thử lại' : retryStatus.reason}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  <span>Thử lại</span>
                </button>
                {!retryStatus.allowed && retryStatus.reason && (
                  <span className="chat-retry-hint">{retryStatus.reason}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <form className="chat-composer" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          id="chat-question"
          aria-label="Nhập câu hỏi cho trợ lý"
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
          placeholder={followupSuggestions?.placeholder || visibleSuggestions.placeholder}
          rows={2}
          disabled={isStreaming}
        />
        <div className="chat-composer-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span>Enter để gửi · Shift + Enter xuống dòng</span>
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
