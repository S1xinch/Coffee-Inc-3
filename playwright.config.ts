import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const basePath = process.env.GITHUB_PAGES === 'true' ? '/Coffee-Inc-3/' : '/';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:4173${basePath}`,
    launchOptions: { executablePath },
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium', launchOptions: { executablePath } } },
    { name: 'ipad-landscape', use: { ...devices['iPad Pro 11 landscape'], browserName: 'chromium', launchOptions: { executablePath } } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: `http://localhost:4173${basePath}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
