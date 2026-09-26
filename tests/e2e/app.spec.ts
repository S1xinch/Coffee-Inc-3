import { expect, test, type Page } from '@playwright/test';

const shots = process.env.SCREENSHOT_DIR;
const snap = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${test.info().project.name}-${name}.png` });
};

async function startCompany(page: Page, name = 'Harbor Roast') {
  await page.goto('/');
  await page.getByRole('button', { name: 'New company' }).click();
  await page.getByLabel('Company name').fill(name);
  await page.getByText('University District').click();
  await page.getByRole('button', { name: 'Open the doors' }).click();
  await expect(page.getByText('Before you open')).toBeVisible();
}

test('plays the first day of a new cafe and keeps it after a reload', async ({ page }) => {
  await page.goto('/');
  await snap(page, '01-title');
  await startCompany(page);
  await snap(page, '02-empty-store');

  await page.getByRole('button', { name: 'Build' }).click();
  await page.locator('.shop-item', { hasText: 'Cash Register' }).getByRole('button', { name: /Buy/ }).click();
  await page.locator('.shop-item', { hasText: 'Single Group Espresso Machine' }).getByRole('button', { name: /Buy/ }).click();
  await page.locator('.shop-item', { hasText: 'Pastry Case' }).getByRole('button', { name: /Buy/ }).click();
  for (let i = 0; i < 3; i++) await page.locator('.shop-item', { hasText: 'Two-Top Table' }).getByRole('button', { name: /Buy/ }).click();
  await page.locator('.shop-item', { hasText: 'Potted Plant' }).getByRole('button', { name: /Buy/ }).click();
  await expect(page.locator('.shop-item', { hasText: 'Cash Register' }).getByText('Installed')).toBeVisible();

  await page.getByRole('button', { name: 'Staff' }).click();
  await page.getByRole('button', { name: 'Hire' }).first().click();
  await page.getByRole('button', { name: 'Hire' }).first().click();
  await expect(page.locator('.person', { hasText: 'Working' })).toHaveCount(2);

  await page.getByRole('button', { name: 'Store' }).click();
  await expect(page.getByText('Before you open')).toHaveCount(0);
  await page.getByRole('button', { name: 'Speed 4x' }).click();
  await expect(page.locator('.stage-status.good')).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => Number((await page.locator('.stat', { hasText: 'Served' }).locator('.stat-value').textContent())?.replace(/,/g, '')), { timeout: 30_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await snap(page, '03-open-store');

  await page.getByRole('button', { name: 'Menu' }).click();
  await snap(page, '04-menu');
  await page.getByRole('button', { name: 'Finance' }).click();
  await snap(page, '05-finance');

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.waitForTimeout(1000);
  await page.reload();
  await expect(page.getByRole('button', { name: /Continue Harbor Roast/ })).toBeVisible();
  await page.getByRole('button', { name: /Continue Harbor Roast/ }).click();
  await expect(page.locator('.company')).toHaveText('Harbor Roast');
  await expect(page.getByText('Before you open')).toHaveCount(0);
});

test('shows a weekly report after the first week closes', async ({ page }) => {
  test.setTimeout(180_000);
  await startCompany(page, 'Report Test');
  await page.getByRole('button', { name: 'Speed 4x' }).click();
  await expect(page.getByRole('dialog', { name: /Week 1 results/ })).toBeVisible({ timeout: 150_000 });
  await snap(page, '06-week-report');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('is installable on iOS and works offline', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  expect(await page.locator('link[rel="apple-touch-startup-image"]').count()).toBeGreaterThan(10);
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await page.request.get(manifestHref!)).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);

  for (const path of ['/favicon.svg', '/favicon-32.png', '/icons/apple-touch-icon.png', '/privacy.html', '/terms.html']) {
    expect((await page.request.get(path)).ok(), path).toBe(true);
  }

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Coffee Inc 3' })).toBeVisible();
  await page.goto('/privacy.html');
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  await context.setOffline(false);
});

test('legal pages exist and nothing claims to be made with AI', async ({ page }) => {
  for (const path of ['/', '/privacy.html', '/terms.html']) {
    await page.goto(path);
    await expect(page.locator('body')).not.toContainText(/made with ai|generated by ai|built with ai/i);
  }
  await page.goto('/terms.html');
  await expect(page.getByRole('heading', { name: 'Terms and Conditions' })).toBeVisible();
});
