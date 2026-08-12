import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'FlowNote — メモからアクティビティ図へ',
    short_name: 'FlowNote',
    description: '業務メモからアクティビティ図と説明用のポンチ絵を作成します。',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f8f8f5',
    theme_color: '#425c4a',
    lang: 'ja',
    orientation: 'any',
    icons: [
      { src: '/flownote-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/flownote-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
