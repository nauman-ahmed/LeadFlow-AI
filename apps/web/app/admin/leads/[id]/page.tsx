import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;
  const sb = createServerClient();

  const [{ data: lead }, { data: conversations }] = await Promise.all([
    sb.from('leads').select('*').eq('id', id).maybeSingle(),
    sb
      .from('conversations')
      .select('id, channel, language, handoff, started_at, ended_at, messages(role, content, created_at, prompt_version)')
      .eq('lead_id', id)
      .order('started_at', { ascending: false })
  ]);

  if (!lead) notFound();

  return (
    <div className="container">
      <p>
        <Link href="/admin">← All leads</Link>
      </p>

      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 8px' }}>
          Lead <code style={{ fontSize: '1rem', background: '#f1f3f5', padding: '2px 8px', borderRadius: 4 }}>{lead.id.slice(0, 8)}</code>
        </h1>
        <span className={`badge status-${lead.status}`}>{lead.status}</span>
        {lead.tags?.map((t: string) => (
          <span key={t} className="tag" style={{ marginLeft: 6 }}>{t}</span>
        ))}
      </header>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Lead info</h2>
        <dl className="kv">
          <dt>Name</dt><dd>{lead.name ?? <span className="muted">—</span>}</dd>
          <dt>Email</dt><dd>{lead.email ?? <span className="muted">—</span>}</dd>
          <dt>Phone</dt><dd>{lead.phone ?? <span className="muted">—</span>}</dd>
          <dt>Language</dt><dd>{lead.language}</dd>
          <dt>Source</dt><dd>{lead.source}</dd>
          <dt>Qualification</dt><dd>{lead.qualification_score}/100</dd>
          <dt>Created</dt><dd>{formatDate(lead.created_at)}</dd>
          <dt>Updated</dt><dd>{formatDate(lead.updated_at)}</dd>
        </dl>
      </section>

      <h2>Conversations</h2>
      {(!conversations || conversations.length === 0) && (
        <div className="card empty">No conversations yet.</div>
      )}

      {conversations?.map((conv) => (
        <section key={conv.id} className="card" style={{ marginBottom: 16 }}>
          <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
            <strong>{conv.channel}</strong>
            <span className="tag">{conv.language}</span>
            {conv.handoff && <span className="badge status-handoff">handoff</span>}
            <span className="muted small" style={{ marginLeft: 'auto' }}>
              {formatDate(conv.started_at)}
              {conv.ended_at ? ` → ${formatDate(conv.ended_at)}` : ''}
            </span>
          </header>

          <div className="transcript">
            {(conv.messages ?? [])
              .slice()
              .sort((a: any, b: any) => (a.created_at > b.created_at ? 1 : -1))
              .map((m: any, i: number) => (
                <div key={i} className={`msg msg-${m.role}`}>
                  {m.content}
                  {m.prompt_version && (
                    <div className="meta">prompt v{m.prompt_version}</div>
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
