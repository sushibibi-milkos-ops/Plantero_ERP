import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
