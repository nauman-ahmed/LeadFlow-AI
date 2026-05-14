import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LeadFlow',
  description:
    'Inbound web chat and phone captured into a single lead list with transcripts and status.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
