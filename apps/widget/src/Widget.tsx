import { useEffect, useRef, useState } from 'react';
import { sendMessage, startSession, type Language } from './api';
import { strings } from './strings';

interface WidgetProps {
  apiUrl: string;
  initialLanguage?: Language;
  tenant?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'error';
  content: string;
  ts: number;
}

const SESSION_STORAGE_KEY = 'leadflow_session_id';
const LANGUAGE_STORAGE_KEY = 'leadflow_language';

export function Widget({ apiUrl, initialLanguage = 'en', tenant }: WidgetProps) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === 'undefined') return initialLanguage;
    return (localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language) || initialLanguage;
  });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = strings[language];

  // Initialize session when first opened.
  useEffect(() => {
    if (!open || sessionId) return;

    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      setSessionId(stored);
      setMessages([{ role: 'assistant', content: t.title, ts: Date.now() }]);
      return;
    }

    setBusy(true);
    startSession(apiUrl, { language })
      .then((res) => {
        setSessionId(res.session_id);
        localStorage.setItem(SESSION_STORAGE_KEY, res.session_id);
        setMessages([{ role: 'assistant', content: res.greeting, ts: Date.now() }]);
      })
      .catch((err) => {
        console.error('[leadflow] start failed', err);
        setMessages([{ role: 'error', content: t.error_generic, ts: Date.now() }]);
      })
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  // Persist language change.
  function changeLanguage(lang: Language) {
    setLanguage(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !sessionId || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text, ts: Date.now() }]);
    setBusy(true);
    try {
      const res = await sendMessage(apiUrl, { session_id: sessionId, message: text, language });
      setMessages((m) => [...m, { role: 'assistant', content: res.reply, ts: Date.now() }]);
    } catch (err) {
      console.error('[leadflow] message failed', err);
      setMessages((m) => [...m, { role: 'error', content: t.error_generic, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="leadflow-widget" data-tenant={tenant}>
      {!open && (
        <button
          className="leadflow-launcher"
          onClick={() => setOpen(true)}
          aria-label={t.open_aria}
        >
          💬
        </button>
      )}

      {open && (
        <div className="leadflow-panel">
          <header className="leadflow-header">
            <div className="leadflow-title">{t.title}</div>
            <div className="leadflow-controls">
              <select
                value={language}
                onChange={(e) => changeLanguage(e.target.value as Language)}
                aria-label="Language"
              >
                <option value="en">EN</option>
                <option value="fr">FR</option>
              </select>
              <button onClick={() => setOpen(false)} aria-label={t.close_aria}>
                ×
              </button>
            </div>
          </header>

          <div className="leadflow-messages" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`leadflow-msg leadflow-msg-${m.role}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className="leadflow-typing">{t.typing}</div>}
          </div>

          <div className="leadflow-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={t.placeholder}
              disabled={busy}
              autoFocus
            />
            <button onClick={handleSend} disabled={busy || !input.trim()}>
              {t.send}
            </button>
          </div>

          <footer className="leadflow-footer">{t.powered_by}</footer>
        </div>
      )}
    </div>
  );
}
