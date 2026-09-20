import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TaskFlow Ops — MARS agent console',
  description: 'A ticket becomes a reviewed pull request, worked by agents on DigitalOcean Managed Agents.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
