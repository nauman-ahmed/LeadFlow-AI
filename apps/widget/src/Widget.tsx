import { useEffect, useRef, useState } from 'react';
import {
  bookSlot,
  sendMessage,
  startSession,
  type BookingBlock,
  type Language,
  type ProposedSlot
} from './api';
import { strings } from './strings';
import { renderMarkdown } from './markdown';

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

interface SlotOffer {
  id: number;
  slots: ProposedSlot[];
  email: string;
  name: string | null;
  timezone: string;
  note: string | null;
  consumed: boolean;
}

const SESSION_STORAGE_KEY = 'leadflow_session_id';
const LANGUAGE_STORAGE_KEY = 'leadflow_language';

function detectTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
  catch { return 'UTC'; }
}

function formatSlotLabel(iso: string, language: Language, timezone: string): string {
  try {
    return new Date(iso).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone
    });
  } catch {
    return iso;
  }
}

export function Widget({ apiUrl, initialLanguage = 'en', tenant }: WidgetProps) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === 'undefined') return initialLanguage;
    return (localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language) || initialLanguage;
  });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [slotOffer, setSlotOffer] = useState<SlotOffer | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timezoneRef = useRef<string>(detectTimezone());
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
    startSession(apiUrl, { language, timezone: timezoneRef.current })
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

  // Auto-scroll to bottom on new messages or slot offers.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy, slotOffer]);

  function changeLanguage(lang: Language) {
    setLanguage(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  }

  function applyBookingBlock(block: BookingBlock | undefined) {
    if (!block?.pending || !block.proposed_slots || block.proposed_slots.length === 0) {
      return;
    }
    setSlotOffer({
      id: Date.now(),
      slots: block.proposed_slots,
      email: block.pending.email,
      name: block.pending.name,
      timezone: block.pending.timezone || timezoneRef.current,
      note: block.note,
      consumed: false
    });
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !sessionId || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text, ts: Date.now() }]);
    setBusy(true);
    try {
      const res = await sendMessage(apiUrl, {
        session_id: sessionId,
        message: text,
        language,
        timezone: timezoneRef.current
      });
      setMessages((m) => [...m, { role: 'assistant', content: res.reply, ts: Date.now() }]);
      applyBookingBlock(res.booking);
    } catch (err) {
      console.error('[leadflow] message failed', err);
      setMessages((m) => [...m, { role: 'error', content: t.error_generic, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  async function handleSlotPick(slot: ProposedSlot) {
    if (!sessionId || !slotOffer || slotOffer.consumed || booking) return;
    setBooking(true);
    setSlotOffer({ ...slotOffer, consumed: true });
    const slotLabel = formatSlotLabel(slot.start, language, slotOffer.timezone);
    setMessages((m) => [
      ...m,
      { role: 'user', content: slotLabel, ts: Date.now() }
    ]);

    try {
      const res = await bookSlot(apiUrl, {
        session_id: sessionId,
        start: slot.start,
        email: slotOffer.email,
        name: slotOffer.name,
        timezone: slotOffer.timezone,
        language
      });
      setMessages((m) => [...m, { role: 'assistant', content: res.reply, ts: Date.now() }]);
      setSlotOffer(null);
    } catch (err) {
      console.error('[leadflow] book failed', err);
      setSlotOffer({ ...slotOffer, consumed: false });
      setMessages((m) => [...m, { role: 'error', content: t.booking_failed, ts: Date.now() }]);
    } finally {
      setBooking(false);
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
                {m.role === 'assistant' ? renderMarkdown(m.content) : m.content}
              </div>
            ))}

            {slotOffer && !slotOffer.consumed && (
              <div className="leadflow-slots" key={slotOffer.id}>
                <div className="leadflow-slots-label">
                  {slotOffer.note || t.booking_pick_slot}
                </div>
                <div className="leadflow-slot-list">
                  {slotOffer.slots.map((slot) => (
                    <button
                      key={slot.start}
                      className="leadflow-slot"
                      disabled={booking}
                      onClick={() => handleSlotPick(slot)}
                    >
                      {formatSlotLabel(slot.start, language, slotOffer.timezone)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {busy && <div className="leadflow-typing">{t.typing}</div>}
            {booking && <div className="leadflow-typing">{t.booking_booking}</div>}
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
              disabled={busy || booking}
              autoFocus
            />
            <button onClick={handleSend} disabled={busy || booking || !input.trim()}>
              {t.send}
            </button>
          </div>

          <footer className="leadflow-footer">{t.powered_by}</footer>
        </div>
      )}
    </div>
  );
}
