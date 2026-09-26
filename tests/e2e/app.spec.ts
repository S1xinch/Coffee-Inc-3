import { expect, test, type Page } from '@playwright/test';

const shots = process.env.SCREENSHOT_DIR;
const snap = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${test.info().project.name}-${name}.png` });
};

async function startCompany(page: Page, name = 'Harbor Roast') {
  await page.goto('./');
  await page.getByRole('button', { name: 'New company' }).click();
  await page.getByLabel('Company name').fill(name);
  await page.getByRole('radio', { name: 'leaf', exact: true }).click();
  await page.getByText('University District').click();
  await page.getByRole('button', { name: 'Open the doors' }).click();
  await expect(page.getByText('Before you open')).toBeVisible();
}

// Coffee Inc 2-style event pop-ups pause the clock until answered; tests wave them off.
async function dismissPopups(page: Page) {
  const later = page.getByRole('button', { name: 'Decide later' });
  if (await later.isVisible()) await later.click();
}

const closeSheet = (page: Page) => page.getByRole('button', { name: 'Close', exact: true }).click();

async function pressHidden(page: Page, name: string | RegExp) {
  const button = page.locator('.sr-only-list').getByRole('button', { name });
  await button.focus();
  await page.keyboard.press('Enter');
}

test('opens a cafe, runs a day, and keeps it after a reload', async ({ page }) => {
  await page.goto('./');
  await snap(page, '01-title');
  await startCompany(page);
  await snap(page, '02-empty-store');

  await page.getByRole('button', { name: 'Customize' }).click();
  const buy = (item: string) => page.locator('.shop-item', { hasText: item }).getByRole('button', { name: /Buy/ }).click();
  await buy('Cash Register');
  await buy('Single Group Espresso Machine');
  await buy('Pastry Case');
  for (let i = 0; i < 3; i++) await buy('Two-Top Table');
  await buy('Potted Plant');
  await expect(page.locator('.shop-item', { hasText: 'Cash Register' }).getByText('Installed')).toBeVisible();
  await closeSheet(page);

  await page.getByRole('button', { name: 'Staff' }).first().click();
  await page.getByRole('button', { name: 'Hire', exact: true }).first().click();
  await page.getByRole('button', { name: 'Hire', exact: true }).first().click();
  await expect(page.locator('.person', { hasText: 'Working' })).toHaveCount(2);
  await closeSheet(page);

  await expect(page.getByText('Before you open')).toHaveCount(0);
  await page.getByRole('button', { name: 'Speed 4x' }).click();
  await expect
    .poll(
      async () => {
        await dismissPopups(page);
        return Number((await page.locator('.stat', { hasText: 'Served' }).locator('.stat-value').textContent())?.replace(/,/g, ''));
      },
      { timeout: 40_000 },
    )
    .toBeGreaterThan(0);
  await snap(page, '03-open-store');

  await page.getByRole('button', { name: 'Product' }).click();
  await expect(page.getByText('Espresso bar')).toBeVisible();
  await page.getByRole('button', { name: 'Marketing' }).click();
  const social = page.getByRole('button', { name: /Social Media/ });
  await social.click();
  await expect(social).toHaveAttribute('aria-pressed', 'true');
  await snap(page, '04-marketing');
  await page.getByRole('button', { name: 'Finance' }).last().click();
  await expect(page.getByRole('tab', { name: 'Balance sheet' })).toBeVisible();
  await snap(page, '05-finance');

  await dismissPopups(page);
  await page.getByRole('button', { name: 'Back to the city map' }).click();
  await expect(page.locator('.city-canvas')).toBeVisible();
  await expect(page.getByText('Seattle')).toBeVisible();
  await snap(page, '06-city');

  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.waitForTimeout(1000);
  await page.reload();
  await page.getByRole('button', { name: /Continue Harbor Roast/ }).click();
  await dismissPopups(page);
  await pressHidden(page, 'Open your store at 4521 College Ave');
  await expect(page.getByRole('heading', { name: 'Harbor Roast' })).toBeVisible();
  await expect(page.getByText('Before you open')).toHaveCount(0);
});

test('leases a second store, arranges furniture, and hires a manager', async ({ page }) => {
  await startCompany(page, 'Two Cups');
  await page.getByRole('button', { name: 'Customize' }).click();
  const buy = (item: string) => page.locator('.shop-item', { hasText: item }).getByRole('button', { name: /Buy/ }).click();
  await buy('Two-Top Table');
  await buy('Potted Plant');
  await closeSheet(page);

  await page.getByRole('button', { name: 'Arrange furniture' }).click();
  await expect(page.getByText('Tap a gold square to pick it up')).toBeVisible();
  await snap(page, '08-arrange');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Staff' }).first().click();
  await page.getByRole('button', { name: /Hire a manager/ }).click();
  await expect(page.getByRole('button', { name: 'Let go' }).first()).toBeVisible();
  await closeSheet(page);
  await expect(page.getByText('Store manager')).toBeVisible();

  await page.getByRole('button', { name: 'Back to the city map' }).click();
  await snap(page, '09-big-city');
  await pressHidden(page, /Northline Coffee at 1 Ferry Terminal Way/);
  await expect(page.getByRole('dialog', { name: 'Northline Coffee' })).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();

  await pressHidden(page, /Lot for lease at 700 Pine Street/);
  await expect(page.getByRole('dialog', { name: /For lease: 700 Pine Street/ })).toBeVisible();
  await expect(page.getByText('330 people per hour')).toBeVisible();
  await snap(page, '10-lease');
  await page.getByRole('button', { name: /Lease this lot/ }).click();
  await expect(page.locator('.shop-item', { hasText: 'Cash Register' })).toBeVisible();
  await closeSheet(page);
  await expect(page.getByText('700 Pine Street, Downtown')).toBeVisible();
  await expect(page.getByText('2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Previous store' }).click();
  await expect(page.getByText('4521 College Ave, University District')).toBeVisible();
  await expect(page.getByText('Store manager')).toBeVisible();
});

test('moves furniture by tapping the floor', async ({ page }) => {
  // Tap positions are measured on the iPhone layout.
  test.skip(test.info().project.name !== 'iphone');
  await page.goto('./');
  await page.getByRole('button', { name: 'New company' }).click();
  await page.getByLabel('Company name').fill('Tapper');
  await page.getByRole('button', { name: 'Open the doors' }).click();
  await page.getByRole('button', { name: 'Customize' }).click();
  await page.locator('.shop-item', { hasText: 'Two-Top Table' }).getByRole('button', { name: /Buy/ }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Arrange furniture' }).click();
  const canvas = page.locator('.stage-canvas');
  const box = (await canvas.boundingBox())!;
  const before = await canvas.screenshot();
  await canvas.click({ position: { x: 128 - box.x, y: 253 - box.y } });
  await expect(page.getByText(/Tap a green square/)).toBeVisible();
  await canvas.click({ position: { x: 150 - box.x, y: 283 - box.y } });
  await page.waitForTimeout(300);
  expect(await canvas.screenshot()).not.toEqual(before);
  await expect(page.getByText('Tap a gold square to pick it up')).toBeVisible();
});

test('opens headquarters and browses other cities', async ({ page }) => {
  await startCompany(page, 'Big Plans');
  await page.getByRole('button', { name: 'Back to the city map' }).click();
  await pressHidden(page, /Lot for lease at 700 Pine Street/);
  await page.getByRole('button', { name: /Lease this lot/ }).click();
  await closeSheet(page);
  await page.getByRole('button', { name: 'Back to the city map' }).click();

  await page.getByRole('button', { name: /Choose a city/ }).click();
  await expect(page.getByRole('dialog', { name: 'Cities' })).toBeVisible();
  await snap(page, '11-cities');
  await page.locator('.city-card', { hasText: 'Portland' }).getByRole('button', { name: 'View map' }).click();
  await expect(page.getByText('Portland is locked')).toBeVisible();
  await snap(page, '12-portland');
  await page.getByRole('button', { name: /Choose a city/ }).click();
  await page.locator('.city-card', { hasText: 'San Francisco' }).getByRole('button', { name: 'View map' }).click();
  await expect(page.getByText('San Francisco is locked')).toBeVisible();
  await snap(page, '13-san-francisco');

  await page.getByRole('button', { name: 'Headquarters', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Headquarters', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open headquarters' }).click();
  await expect(page.getByRole('button', { name: 'Departments' })).toBeVisible();
  await page.locator('.card', { hasText: 'Human Resources' }).getByRole('button', { name: /Build/ }).click();
  await expect(page.locator('.card', { hasText: 'Human Resources' }).getByText('Level 1 of 3')).toBeVisible();
  await snap(page, '14-hq-departments');
  await page.getByRole('button', { name: 'Board' }).click();
  await expect(page.getByText('Board of directors')).toBeVisible();
  await page.getByRole('button', { name: 'Farms' }).click();
  await expect(page.getByText('Yirgacheffe, Ethiopia')).toBeVisible();
  await snap(page, '15-hq-farms');
  await page.getByRole('button', { name: 'Investments' }).click();
  await expect(page.getByText('Stock market')).toBeVisible();
  await snap(page, '16-hq-investments');
  await page.getByRole('button', { name: 'Back to the city map' }).click();
  await expect(page.locator('.city-canvas')).toBeVisible();
});

test('shows a weekly report after the first week closes', async ({ page }) => {
  test.setTimeout(180_000);
  await startCompany(page, 'Report Test');
  await page.getByRole('button', { name: 'Speed 4x' }).click();
  const report = page.getByRole('dialog', { name: /Week 1 results/ });
  await expect
    .poll(
      async () => {
        await dismissPopups(page);
        return report.isVisible();
      },
      { timeout: 150_000 },
    )
    .toBe(true);
  await snap(page, '07-week-report');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('is installable on iOS and works offline', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(touchIcon).toMatch(/icons\/apple-touch-icon\.png$/);
  expect(await page.locator('link[rel="apple-touch-startup-image"]').count()).toBeGreaterThan(10);
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await page.request.get(new URL(manifestHref!, page.url()).href)).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);

  for (const path of ['favicon.svg', 'favicon-32.png', 'icons/apple-touch-icon.png', 'privacy.html', 'terms.html', 'legal.css']) {
    expect((await page.request.get(new URL(path, page.url()).href)).ok(), path).toBe(true);
  }

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Coffee Inc 3' })).toBeVisible();
  await page.goto('./privacy.html');
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  await context.setOffline(false);
});

test('legal pages exist and nothing claims to be made with AI', async ({ page }) => {
  for (const path of ['./', './privacy.html', './terms.html']) {
    await page.goto(path);
    await expect(page.locator('body')).not.toContainText(/made with ai|generated by ai|built with ai/i);
  }
  await page.goto('./terms.html');
  await expect(page.getByRole('heading', { name: 'Terms and Conditions' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to the game' }).click();
  await expect(page.getByRole('heading', { name: 'Coffee Inc 3' })).toBeVisible();
});
