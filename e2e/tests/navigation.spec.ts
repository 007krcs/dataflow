/**
 * Navigation & Layout Tests
 * Verifies that the app loads, the nav works, and all 4 pages render.
 */

import { test, expect } from '@playwright/test';

test.describe('App Navigation', () => {
  test('loads with correct title and brand', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/DataFlow/);
    await expect(page.locator('.brand-name')).toContainText('DataFlow');
    await expect(page.locator('.brand-version')).toContainText('v0.3.0');
  });

  test('shows all 4 nav buttons', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('.topbar-nav');
    await expect(nav.locator('.nav-btn')).toHaveCount(4);
    await expect(nav).toContainText('Stocks');
    await expect(nav).toContainText('Crypto');
    await expect(nav).toContainText('IoT');
    await expect(nav).toContainText('Commerce');
  });

  test('GitHub link is present and correct', async ({ page }) => {
    await page.goto('/');
    const ghLink = page.locator('.gh-link');
    await expect(ghLink).toBeVisible();
    await expect(ghLink).toHaveAttribute('href', /github\.com\/007krcs\/dataflow/);
    await expect(ghLink).toHaveAttribute('target', '_blank');
  });

  test('navigates to Stocks page by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.page-title')).toContainText('Stock Market Feed');
    await expect(page.locator('.nav-btn--active')).toContainText('Stocks');
  });

  test('navigates to Crypto page', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-btn', { hasText: 'Crypto' }).click();
    await expect(page.locator('.page-title')).toContainText('Crypto Market Feed');
    await expect(page.locator('.nav-btn--active')).toContainText('Crypto');
  });

  test('navigates to IoT page', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-btn', { hasText: 'IoT' }).click();
    await expect(page.locator('.page-title')).toContainText('IoT Sensor Grid');
    await expect(page.locator('.nav-btn--active')).toContainText('IoT');
  });

  test('navigates to Commerce page', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-btn', { hasText: 'Commerce' }).click();
    await expect(page.locator('.page-title')).toContainText('E-Commerce Dashboard');
    await expect(page.locator('.nav-btn--active')).toContainText('Commerce');
  });

  test('active nav button is highlighted when switching pages', async ({ page }) => {
    await page.goto('/');
    // Start on Stocks
    await expect(page.locator('.nav-btn--active')).toHaveCount(1);

    // Switch to IoT
    await page.locator('.nav-btn', { hasText: 'IoT' }).click();
    await expect(page.locator('.nav-btn--active')).toHaveCount(1);
    await expect(page.locator('.nav-btn--active')).toContainText('IoT');

    // Switch back to Stocks
    await page.locator('.nav-btn', { hasText: 'Stocks' }).click();
    await expect(page.locator('.nav-btn--active')).toContainText('Stocks');
  });
});
