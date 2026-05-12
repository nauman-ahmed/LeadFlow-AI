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
        <Link href="/" style={{ color: '#94a3b8', textDecoration: 'none' }}>
          ← Back to demo
        </Link>
        <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 12 }}>
          Reads directly from Supabase · refresh to update
        </span>
      </nav>
      {children}
    </div>
  );
}
