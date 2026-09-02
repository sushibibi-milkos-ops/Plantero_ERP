import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Birim testleri: yalnızca src altı. Playwright e2e dosyaları hariç. */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    environment: 'node',
  },
});
