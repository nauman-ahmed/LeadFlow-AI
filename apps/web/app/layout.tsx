import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LeadFlow AI',
  description:
    'Inbound lead qualification across web chat and inbound phone, with KB-grounded answers, calendar booking, CRM sync, human handoff, and multi-language support.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
