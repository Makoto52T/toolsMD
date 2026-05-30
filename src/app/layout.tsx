import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'toolsMD — Diagram to Markdown',
  description: 'Trello-style app builder — drag nodes, add functions, export as Markdown.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
