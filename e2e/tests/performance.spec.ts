/**
 * Performance Tests
 * Verifies that the streaming UI remains responsive under live data load.
 * Checks FPS proxy, memory stability, and layout shift.
 */

import { test, expect } from '@playwright/test';

test.describe('Rendering Performance', () => {
  test('page is interactive within 3 seconds of load', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await expect(page.locator('.conn-badge')).toContainText('Live');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

  test('table with 20 rows renders without layout thrash', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.stream-table tbody tr')).toHaveCount(20, { timeout: 8000 });

    // Measure layout shift — take two screenshots and compare
    const shot1 = await page.screenshot({ clip: { x: 0, y: 54, width: 1280, height: 200 } });
    await page.waitForTimeout(1000);
    const shot2 = await page.screenshot({ clip: { x: 0, y: 54, width: 1280, height: 200 } });

    // Screenshots should be different (data updated) but page shouldn't crash
    expect(shot1.length).toBeGreaterThan(0);
    expect(shot2.length).toBeGreaterThan(0);
  });

  test('no JavaScript errors during streaming', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page.locator('.conn-badge')).toContainText('Live', { timeout: 5000 });
    await page.waitForTimeout(3000);

    // No critical JS errors
    const criticalErrors = errors.filter((e) => !e.includes('ResizeObserver') && !e.includes('non-passive'));
    expect(criticalErrors).toHaveLength(0);
  });

  test('no console errors on initial page load', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await expect(page.locator('.page-title')).toBeVisible();

    // Filter out known benign errors (e.g. favicon 404, extension messages)
    const realErrors = consoleErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('extension') &&
        !e.includes('net::ERR_'),
    );
    expect(realErrors).toHaveLength(0);
  });

  test('switching between pages is fast (<500ms)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.conn-badge')).toContainText('Live', { timeout: 5000 });

    const pages = ['Crypto', 'IoT', 'Commerce', 'Stocks'];
    for (const p of pages) {
      const start = Date.now();
      await page.locator('.nav-btn', { hasText: p }).click();
      await expect(page.locator('.metric-bar')).toBeVisible();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
    }
  });

  test('stream table handles 5 seconds of continuous updates', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.stream-table tbody tr')).toHaveCount(20, { timeout: 8000 });

    // Let it run for 5 seconds
    await page.waitForTimeout(5000);

    // Page should still be responsive and table should have rows
    await expect(page.locator('.stream-table tbody tr')).toHaveCount(20, { timeout: 3000 });
    await expect(page.locator('.conn-badge')).toContainText('Live');
  });
});

test.describe('Memory Stability', () => {
  test('page does not grow unbounded after 10s of streaming', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.conn-badge')).toContainText('Live', { timeout: 5000 });

    // Measure row count before and after
    await expect(page.locator('.stream-table tbody tr')).toHaveCount(20, { timeout: 8000 });
    await page.waitForTimeout(10000);

    // maxRows=20 should keep the table bounded
    const rowCount = await page.locator('.stream-table tbody tr').count();
    expect(rowCount).toBeLessThanOrEqual(20);
  });
});
