import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav
        style={{
          background: '#0f172a',
          color: '#e2e8f0',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 24
        }}
      >
        <Link href="/admin" style={{ color: 'white', fontWeight: 600, textDecoration: 'none' }}>
          LeadFlow · Mock CRM
        </Link>
        <Link href="/admin/appointments" style={{ color: '#94a3b8', fontSize: 14, textDecoration: 'none' }}>
          Appointments
        </Link>
        <form method="post" action="/api/admin/logout" style={{ marginLeft: 'auto' }}>
          <button
            type="submit"
            style={{
              background: 'none',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#cbd5e1',
              fontSize: 13,
              padding: '4px 10px',
              cursor: 'pointer'
            }}
          >
            Log out
          </button>
        </form>
      </nav>
      {children}
    </div>
  );
}
