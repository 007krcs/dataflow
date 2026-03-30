/**
 * Metrics Bar Tests
 * Verifies all 5 metric tiles are present, labels are correct,
 * and values update over time.
 */

import { test, expect } from '@playwright/test';

const PAGES = [
  { nav: 'Stocks',   title: 'Stock Market Feed' },
  { nav: 'Crypto',   title: 'Crypto Market Feed' },
  { nav: 'IoT',      title: 'IoT Sensor Grid' },
  { nav: 'Commerce', title: 'E-Commerce Dashboard' },
];

for (const { nav, title } of PAGES) {
  test.describe(`Metrics — ${nav}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      if (nav !== 'Stocks') {
        await page.locator('.nav-btn', { hasText: nav }).click();
      }
      await expect(page.locator('.page-title')).toContainText(title);
      await expect(page.locator('.conn-badge')).toContainText('Live', { timeout: 5000 });
    });

    test('metric bar has 5 tiles', async ({ page }) => {
      await expect(page.locator('.metric-tile')).toHaveCount(5);
    });

    test('Total Rows label is present', async ({ page }) => {
      await expect(page.locator('.metric-label', { hasText: 'Total Rows' })).toBeVisible();
    });

    test('Rows/sec label is present', async ({ page }) => {
      await expect(page.locator('.metric-label', { hasText: 'Rows/sec' })).toBeVisible();
    });

    test('Dropped label is present', async ({ page }) => {
      await expect(page.locator('.metric-label', { hasText: 'Dropped' })).toBeVisible();
    });

    test('Anomalies label is present', async ({ page }) => {
      await expect(page.locator('.metric-label', { hasText: 'Anomalies' })).toBeVisible();
    });

    test('Buffer label is present', async ({ page }) => {
      await expect(page.locator('.metric-label', { hasText: 'Buffer' })).toBeVisible();
    });

    test('Total Rows value increments over time', async ({ page }) => {
      const totalRowsTile = page.locator('.metric-tile').first();

      const read = () => totalRowsTile.locator('.metric-value').textContent();

      const before = await read();
      await page.waitForTimeout(1500);
      const after = await read();

      // Both should be truthy
      expect(before).toBeTruthy();
      expect(after).toBeTruthy();
      // And after should differ from before (stream is live)
      expect(after).not.toBe(before);
    });

    test('Buffer utilization shows a % value', async ({ page }) => {
      const bufferTile = page.locator('.metric-tile').nth(4);
      const val = await bufferTile.locator('.metric-value').textContent();
      expect(val).toMatch(/%/);
    });
  });
}

test.describe('Metrics — After Stop', () => {
  test('metrics freeze when stream is stopped', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.conn-badge')).toContainText('Live', { timeout: 5000 });
    await page.waitForTimeout(1500);

    await page.locator('.btn-danger', { hasText: 'Stop' }).click();

    const read = () =>
      page.locator('.metric-tile').first().locator('.metric-value').textContent();

    const before = await read();
    await page.waitForTimeout(1500);
    const after = await read();

    // Rows should not have increased after stop
    expect(before).toBe(after);
  });
});
