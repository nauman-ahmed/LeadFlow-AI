import Link from 'next/link';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

/** All Cal-linked rows — includes bookings with no lead (e.g. created only on cal.com). */
export default async function AdminAppointmentsPage() {
  const sb = createServerClient();
  const { data: rows, error } = await sb
    .from('appointments')
    .select('id, lead_id, cal_booking_id, start_at, end_at, status, created_at, leads(name, email)')
    .order('start_at', { ascending: false })
    .limit(200);

  return (
    <div className="container">
      <p>
        <Link href="/admin">← All leads</Link>
      </p>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Appointments (all)</h1>
        <span className="muted small">{rows?.length ?? 0} rows</span>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          <strong>Database error:</strong> {error.message}
        </div>
      )}

      {!error && (!rows || rows.length === 0) && (
        <div className="card empty">
          <p>No rows in <code>appointments</code>. Book via the widget or ensure the Cal → n8n webhook
            is delivering and the workflow is active.</p>
        </div>
      )}

      {!error && rows && rows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Start (UTC)</th>
                <th>End (UTC)</th>
                <th>Status</th>
                <th>Lead</th>
                <th>Cal booking id</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id}>
                  <td className="small muted">{formatDate(r.start_at)}</td>
                  <td className="small muted">{formatDate(r.end_at)}</td>
                  <td>
                    <span className={`badge status-${r.status === 'booked' ? 'booked' : 'lost'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.lead_id ? (
                      <Link href={`/admin/leads/${r.lead_id}`}>
                        {(r.leads as { name?: string; email?: string } | null)?.name ||
                          (r.leads as { email?: string } | null)?.email ||
                          r.lead_id.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="muted">— (no lead)</span>
                    )}
                  </td>
                  <td>
                    {r.cal_booking_id ? (
                      <code className="small">{r.cal_booking_id}</code>
                    ) : (
                      '—'
                    )}
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
