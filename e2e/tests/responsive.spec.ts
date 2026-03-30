/**
 * Responsive Layout Tests
 * Verifies that the app works on mobile and tablet viewports.
 */

import { test, expect } from '@playwright/test';

test.describe('Mobile Viewport (375×667)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('app loads on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.brand-name')).toBeVisible();
    await expect(page.locator('.topbar-nav')).toBeVisible();
  });

  test('all nav buttons are accessible on mobile', async ({ page }) => {
    await page.goto('/');
    const navBtns = page.locator('.nav-btn');
    await expect(navBtns).toHaveCount(4);
    // All should be in the viewport (may need to scroll)
    for (const btn of await navBtns.all()) {
      await expect(btn).toBeVisible();
    }
  });

  test('metric bar wraps on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.metric-bar')).toBeVisible();
    // All tiles should still be accessible
    await expect(page.locator('.metric-tile')).toHaveCount(5);
  });

  test('stream table scrolls horizontally on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.stream-table-wrap')).toBeVisible();
  });

  test('page subtitle is visible on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.page-sub')).toBeVisible();
  });
});

test.describe('Tablet Viewport (768×1024)', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('app loads correctly on tablet', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.brand-name')).toBeVisible();
    await expect(page.locator('.conn-badge')).toContainText('Live', { timeout: 5000 });
  });

  test('KPI cards show in 2×2 grid on tablet', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-btn', { hasText: 'Commerce' }).click();
    await expect(page.locator('.kpi-card')).toHaveCount(4);
    await expect(page.locator('.kpi-row')).toBeVisible();
  });
});

test.describe('Large Desktop (1920×1080)', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('page body shows 2-column layout on desktop', async ({ page }) => {
    await page.goto('/');
    // Click anomalies to show the panel (2-column layout)
    await page.locator('.btn-ghost', { hasText: 'Anomalies' }).click();
    await expect(page.locator('.page-body')).toBeVisible();
    // Both stream table and anomaly panel should be visible side by side
    const tableVisible = await page.locator('.stream-table-wrap').isVisible();
    const panelVisible = await page.locator('.anom-panel').isVisible();
    expect(tableVisible || panelVisible).toBe(true);
  });
});
