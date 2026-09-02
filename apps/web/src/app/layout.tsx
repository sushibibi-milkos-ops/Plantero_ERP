import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

/**
 * Yazı tipleri next/font ile derleme zamanında indirilir ve self-host edilir.
 * Ağ yoksa `fallback` yığını (system-ui / ui-monospace) devreye girer;
 * `adjustFontFallback` metrikleri eşleyerek düzen kaymasını önler.
 */
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
  adjustFontFallback: true,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: { default: 'Plantero ERP', template: '%s · Plantero' },
  description: 'Plantero — bitkisel gıda üretiminin dijital ikizi',
  applicationName: 'Plantero ERP',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#18181b' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
