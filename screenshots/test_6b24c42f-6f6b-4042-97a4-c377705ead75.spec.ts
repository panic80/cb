
import { test } from '@playwright/test';
import { expect } from '@playwright/test';

test('Test_2025-06-06', async ({ page, context }) => {
  
    // Navigate to URL
    await page.goto('http://localhost:3004/opi');

    // Navigate to URL
    await page.goto('http://localhost:3004');

    // Navigate to URL
    await page.goto('http://localhost:3004/opi');

    // Take screenshot
    await page.screenshot({ path: 'opi-page-updated-main.png', { fullPage: true } });

    // Click element
    await page.click('button:has-text("Financial Services")');

    // Take screenshot
    await page.screenshot({ path: 'opi-page-updated-fsc.png', { fullPage: true } });

    // Click element
    await page.click('button:has-text("Financial Management")');

    // Take screenshot
    await page.screenshot({ path: 'opi-page-updated-fmc.png', { fullPage: true } });

    // Click element
    await page.click('button:has-text("🌙")');

    // Take screenshot
    await page.screenshot({ path: 'opi-page-updated-dark-mode.png', { fullPage: true } });

    // Click element
    await page.click('button:has-text("Search by Unit")');

    // Fill input field
    await page.fill('input[placeholder="Search units..."]', '32 CBG');

    // Select option
    await page.selectOption('select', '32 CBG HQ');

    // Take screenshot
    await page.screenshot({ path: 'opi-page-updated-search-result.png', { fullPage: true } });
});