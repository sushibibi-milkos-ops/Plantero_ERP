import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Testler gerçek DB'ye gider; dosyalar sırayla çalışır (kilit çekişmesini önler)
    fileParallelism: false,
  },
});
