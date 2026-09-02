import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright: chromium, tek proje. Tarayıcılar /opt/pw-browsers altında
 * (PLAYWRIGHT_BROWSERS_PATH); paket betiği bu env'i zaten verir, burada
 * ayrıca ikili yolu bulunur ki `npx playwright test` de çalışsın.
 */
const BROWSERS_DIR = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= BROWSERS_DIR;

function findChromium(): string | undefined {
  if (!existsSync(BROWSERS_DIR)) return undefined;
  const dir = readdirSync(BROWSERS_DIR)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .at(-1);
  if (!dir) return undefined;
  const bin = join(BROWSERS_DIR, dir, 'chrome-linux', 'chrome');
  return existsSync(bin) ? bin : undefined;
}

const executablePath = findChromium();
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  outputDir: 'test-results',
  use: {
    baseURL,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: `${baseURL}/api/health`,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
