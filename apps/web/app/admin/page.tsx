import Link from 'next/link';
import { createServerClient } from '@/lib/supabase';
import type { LeadOverview } from '@/lib/types';

export const dynamic = 'force-dynamic';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default async function AdminPage() {
  const sb = createServerClient();
  const { data: leads, error } = await sb
    .from('leads_overview')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(100);

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Leads</h1>
        <span className="muted small">{leads?.length ?? 0} total</span>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          <strong>Database error:</strong> {error.message}
          <p className="small muted" style={{ marginTop: 8 }}>
            Did you apply <code>infra/supabase/schema.sql</code> in Supabase yet?
          </p>
        </div>
      )}

      {!error && (!leads || leads.length === 0) && (
        <div className="card empty">
          <p>No leads yet. Open <a href="/">the demo page</a> and send a chat message.</p>
        </div>
      )}

      {!error && leads && leads.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Status</th>
                <th>Source</th>
                <th>Lang</th>
                <th>Score</th>
                <th>Convs</th>
                <th>Tags</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(leads as LeadOverview[]).map((lead) => (
                <tr key={lead.id}>
                  <td className="small muted">{formatDate(lead.created_at)}</td>
                  <td><span className={`badge status-${lead.status}`}>{lead.status}</span></td>
                  <td>{lead.source}</td>
                  <td>{lead.language}</td>
                  <td>{lead.qualification_score}</td>
                  <td>{lead.conversation_count}</td>
                  <td>
                    {lead.tags?.slice(0, 3).map((t) => (
                      <span key={t} className="tag">{t}</span>
                    ))}
                  </td>
                  <td className="small muted">{lead.email ?? '—'}</td>
                  <td>
                    <Link href={`/admin/leads/${lead.id}`}>View →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
