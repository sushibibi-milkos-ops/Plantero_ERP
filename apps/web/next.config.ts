import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Paylaşılan ortamda birden fazla ajan oturumu aynı anda `apps/web` üzerinde çalışabilir
  // (biri `next dev`, biri `scripts/gate.sh` ile `next build`/`next start`). İkisi aynı
  // `.next` dizinini paylaşırsa build çıktısı dev'in tuttuğu dosyaların üzerine yazar/okur ve
  // "Cannot find module for page: /_document" gibi bozulmalara yol açar. Ortam değişkeni
  // yoksa davranış birebir eskisiyle aynıdır (öntanımlı '.next') — yalnızca izole bir
  // build/start koşusu isteyen çağıran (bkz. scripts/gate.sh) kendi dizinini seçebilir.
  distDir: process.env.PLANTERO_NEXT_DIST_DIR || '.next',
  transpilePackages: ['@plantero/db', '@plantero/core', '@plantero/integrations', '@plantero/ai'],
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  serverExternalPackages: ['postgres', 'bullmq', 'ioredis', 'exceljs', 'bcryptjs'],
  typescript: { ignoreBuildErrors: false },
  webpack: (config) => {
    // Workspace paketleri ESM biçiminde `./x.js` yazar ama kaynak `.ts`'dir (TS "Bundler" çözümlemesi).
    // webpack bu eşlemeyi bilmez; uzantı takma adıyla öğretilir.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
