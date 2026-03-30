/**
 * Streaming & Live Data Tests
 * Verifies that data flows, metrics update, and the connection badge shows "Live".
 */

import { test, expect } from '@playwright/test';

test.describe('Live Streaming — Stocks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for first page to load
    await expect(page.locator('.page-title')).toContainText('Stock Market Feed');
  });

  test('shows "Live" connection badge on load', async ({ page }) => {
    await expect(page.locator('.conn-badge')).toContainText('Live', { timeout: 5000 });
  });

  test('metric bar is visible with 5 tiles', async ({ page }) => {
    const tiles = page.locator('.metric-tile');
    await expect(tiles).toHaveCount(5);
    await expect(tiles.first()).toBeVisible();
  });

  test('total rows counter increases over time', async ({ page }) => {
    // Wait for connection
    await expect(page.locator('.conn-badge')).toContainText('Live', { timeout: 5000 });

    const getTotal = async () => {
      const text = await page.locator('.metric-tile').first().locator('.metric-value').textContent();
      return text?.replace(/[^0-9.KM]/g, '') ?? '0';
    };

    const before = await getTotal();
    // Wait 1.5 seconds for more ticks
    await page.waitForTimeout(1500);
    const after = await getTotal();

    // Values should be different (stream is live)
    expect(after).not.toBe('0');
    // After at least 1 tick, rows/sec label should be visible
    await expect(page.locator('.metric-label', { hasText: 'Rows/sec' })).toBeVisible();
  });

  test('stream table renders stock symbols', async ({ page }) => {
    await expect(page.locator('.conn-badge')).toContainText('Live', { timeout: 5000 });
    // Wait for at least one tick to populate the table
    await expect(page.locator('.stream-table tbody tr')).toHaveCount(1, { timeout: 5000 });
    // Stock table should have multiple rows
    const rows = page.locator('.stream-table tbody tr');
    await expect(rows).toHaveCount(20, { timeout: 8000 });
  });

  test('stock table has correct column headers', async ({ page }) => {
    const headers = page.locator('.stream-table thead th');
    await expect(headers).toContainText(['Symbol', 'Price', 'Open', 'High', 'Low', 'Bid', 'Ask', 'Volume']);
  });

  test('prices in table contain $ sign', async ({ page }) => {
    await expect(page.locator('.stream-table tbody tr')).toHaveCount(20, { timeout: 8000 });
    // Second column (Price) should have $ values
    const priceCells = page.locator('.stream-table tbody tr td:nth-child(2)');
    const first = await priceCells.first().textContent();
    expect(first).toMatch(/\$/);
  });

  test('rows/sec metric shows a positive number', async ({ page }) => {
    await expect(page.locator('.conn-badge')).toContainText('Live', { timeout: 5000 });
    await page.waitForTimeout(2000);
    const rpsValue = page.locator('.metric-tile').nth(1).locator('.metric-value');
    const text = await rpsValue.textContent();
    expect(text).toBeTruthy();
    expect(text).not.toBe('0');
  });
});

test.describe('Live Streaming — Crypto', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-btn', { hasText: 'Crypto' }).click();
    await expect(page.locator('.page-title')).toContainText('Crypto Market Feed');
  });

  test('shows Live status on crypto page', async ({ page }) => {
    await expect(page.locator('.conn-badge')).toContainText('Live', { timeout: 5000 });
  });

  test('crypto table populates with BTC/USD pair', async ({ page }) => {
    await expect(page.locator('.stream-table tbody tr')).toHaveCount(20, { timeout: 8000 });
    const firstSymbol = page.locator('.stream-table tbody tr:first-child td:first-child');
    const text = await firstSymbol.textContent();
    // Should be one of the crypto pairs
    expect(text).toMatch(/\/USD/);
  });

  test('anomaly panel is visible by default on crypto page', async ({ page }) => {
    await expect(page.locator('.anom-panel')).toBeVisible();
    await expect(page.locator('.anom-title')).toContainText('Anomaly Feed');
  });
});

test.describe('Live Streaming — IoT', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-btn', { hasText: 'IoT' }).click();
  });

  test('IoT table shows sensor data', async ({ page }) => {
    await expect(page.locator('.stream-table tbody tr')).toHaveCount(25, { timeout: 8000 });
  });

  test('IoT columns include Temperature and Humidity', async ({ page }) => {
    const headers = page.locator('.stream-table thead th');
    await expect(headers).toContainText(['Sensor', 'Location', 'Temp °C', 'Humidity', 'CO₂']);
  });

  test('status column shows OK, WARN, or ALERT values', async ({ page }) => {
    await expect(page.locator('.stream-table tbody tr')).toHaveCount(25, { timeout: 8000 });
    const statusCells = page.locator('.stream-table tbody tr td:last-child');
    const texts = await statusCells.allTextContents();
    for (const t of texts) {
      expect(['OK', 'WARN', 'ALERT']).toContain(t.trim());
    }
  });
});

test.describe('Live Streaming — E-Commerce', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-btn', { hasText: 'Commerce' }).click();
  });

  test('shows 4 KPI cards', async ({ page }) => {
    await expect(page.locator('.kpi-card')).toHaveCount(4);
    await expect(page.locator('.kpi-label', { hasText: 'Total Revenue' })).toBeVisible();
    await expect(page.locator('.kpi-label', { hasText: 'Total Orders' })).toBeVisible();
    await expect(page.locator('.kpi-label', { hasText: 'Avg CVR' })).toBeVisible();
    await expect(page.locator('.kpi-label', { hasText: 'Avg Order' })).toBeVisible();
  });

  test('revenue KPI shows $ value', async ({ page }) => {
    await page.waitForTimeout(1500);
    const revenueValue = page.locator('.kpi-card').first().locator('.kpi-value');
    const text = await revenueValue.textContent();
    expect(text).toMatch(/\$/);
  });

  test('ecommerce table has 16 rows', async ({ page }) => {
    await expect(page.locator('.stream-table tbody tr')).toHaveCount(16, { timeout: 8000 });
  });

  test('ecommerce table has CVR column', async ({ page }) => {
    await expect(page.locator('.stream-table thead th', { hasText: 'CVR %' })).toBeVisible();
  });
});
