import type { Metadata } from 'next';
import { AuthSessionProvider } from '@/components/auth/AuthSessionProvider';
import './globals.css';

export const metadata: Metadata = {
  applicationName: 'FlowNote',
  title: {
    default: 'FlowNote — メモからアクティビティ図へ',
    template: '%s | FlowNote',
  },
  description: 'メモからアクティビティ図とポンチ絵を作成するワークスペース',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: ['/icon.svg'],
    apple: [{ url: '/flownote-mark.svg' }],
  },
  appleWebApp: {
    capable: true,
    title: 'FlowNote',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: '#425c4a',
  colorScheme: 'light',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body><AuthSessionProvider>{children}</AuthSessionProvider></body>
    </html>
  );
}
