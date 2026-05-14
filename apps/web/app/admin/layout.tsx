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
      </nav>
      {children}
    </div>
  );
}
