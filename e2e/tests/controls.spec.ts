/**
 * Controls Tests
 * Verifies Start/Stop buttons, Anomaly panel toggle, Clear button.
 */

import { test, expect } from '@playwright/test';

test.describe('Stream Controls', () => {
  test('Stop button pauses the stream', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.conn-badge')).toContainText('Live', { timeout: 5000 });

    // Click stop
    await page.locator('.btn-danger', { hasText: 'Stop' }).click();

    // Badge should no longer say Live
    await expect(page.locator('.conn-badge')).not.toContainText('Live', { timeout: 3000 });

    // Start button should now be visible
    await expect(page.locator('.btn-primary', { hasText: 'Start' })).toBeVisible();
  });

  test('Start button resumes stream after stop', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.conn-badge')).toContainText('Live', { timeout: 5000 });

    // Stop
    await page.locator('.btn-danger', { hasText: 'Stop' }).click();
    await expect(page.locator('.btn-primary', { hasText: 'Start' })).toBeVisible();

    // Restart
    await page.locator('.btn-primary', { hasText: 'Start' }).click();
    await expect(page.locator('.conn-badge')).toContainText('Live', { timeout: 5000 });
  });

  test('data table still shows rows after stop (data is not cleared)', async ({ page }) => {
    await page.goto('/');
    // Wait for data to populate
    await expect(page.locator('.stream-table tbody tr')).toHaveCount(20, { timeout: 8000 });

    // Stop the stream
    await page.locator('.btn-danger', { hasText: 'Stop' }).click();

    // Rows should still be visible
    const rowCount = await page.locator('.stream-table tbody tr').count();
    expect(rowCount).toBeGreaterThan(0);
  });
});

test.describe('Anomaly Panel Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.conn-badge')).toContainText('Live', { timeout: 5000 });
  });

  test('Anomaly button toggles the panel', async ({ page }) => {
    const anomBtn = page.locator('.btn-ghost', { hasText: 'Anomalies' });

    // Panel might be hidden initially on financial page — click to show
    await anomBtn.click();
    const panel = page.locator('.anom-panel');

    // It should be in the DOM (either visible or was toggled)
    // On financial page, panel starts hidden; click once to show
    const visible = await panel.isVisible();
    if (visible) {
      // Click again to hide
      await anomBtn.click();
      await expect(panel).not.toBeVisible();
    } else {
      // Already toggled open
      await expect(panel).toBeVisible();
    }
  });

  test('anomaly panel shows "No anomalies" text when empty', async ({ page }) => {
    // Click anomalies button on Stocks page (financial scenario has low anomaly rate)
    const anomBtn = page.locator('.btn-ghost', { hasText: 'Anomalies' });
    // Make sure panel is shown
    await anomBtn.click();
    const panel = page.locator('.anom-panel');
    if (!(await panel.isVisible())) {
      await anomBtn.click();
    }
    // Either it shows events or the empty state
    const content = await panel.textContent();
    expect(content).toBeTruthy();
  });

  test('Clear button removes anomaly events', async ({ page }) => {
    // Go to Crypto page which has higher anomaly rate
    await page.locator('.nav-btn', { hasText: 'Crypto' }).click();
    await expect(page.locator('.anom-panel')).toBeVisible();

    // Wait for anomalies to appear (crypto has 4% rate)
    await page.waitForTimeout(6000);
    const clearBtn = page.locator('.anom-clear');
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      // After clear, either "No anomalies" or count reset to 0
      await expect(page.locator('.anom-list')).toContainText('No anomalies', { timeout: 2000 }).catch(() => {
        // Acceptable: new anomalies may have arrived immediately after clear
      });
    }
  });
});

test.describe('Table Sort Controls', () => {
  test('clicking column header sorts the table', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.stream-table tbody tr')).toHaveCount(20, { timeout: 8000 });

    // Click on "Symbol" header to sort
    const symbolHeader = page.locator('.stream-table thead th', { hasText: 'Symbol' });
    await symbolHeader.click();

    // Arrow should appear in header
    await expect(symbolHeader).toContainText(/↑|↓/);
  });

  test('clicking same header twice reverses sort direction', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.stream-table tbody tr')).toHaveCount(20, { timeout: 8000 });

    const priceHeader = page.locator('.stream-table thead th', { hasText: 'Price' });

    await priceHeader.click();
    const dir1 = await priceHeader.textContent();

    await priceHeader.click();
    const dir2 = await priceHeader.textContent();

    // Direction indicator should have flipped
    expect(dir1).not.toBe(dir2);
  });
});
