import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  transpilePackages: ['@plantero/db', '@plantero/core', '@plantero/integrations', '@plantero/ai'],
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  serverExternalPackages: ['postgres', 'bullmq', 'ioredis', 'exceljs', 'bcryptjs'],
  typescript: { ignoreBuildErrors: false },
};
export default nextConfig;
