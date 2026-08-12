import type { Metadata } from 'next';
import { AuthSessionProvider } from '@/components/auth/AuthSessionProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'FlowNote',
  description: 'メモからアクティビティ図とポンチ絵を作成するワークスペース',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body><AuthSessionProvider>{children}</AuthSessionProvider></body>
    </html>
  );
}
