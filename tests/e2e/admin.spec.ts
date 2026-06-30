import { test, expect } from '@playwright/test';

test.describe('Admin User Journeys', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem('yaksha_first_visit_prompt_seen', '1');
      } catch (e) {
        // ignore early SecurityError on about:blank
      }
    });
  });

  test('should log in as admin, browse dashboard, and access AI answers queue', async ({ page }) => {
    // 1. Go to Admin login
    await page.goto('/admin/login');
    await expect(page.locator('h1')).toContainText('Yaksha Admin');

    // 2. Fill login details (using default seeded admin user)
    await page.locator('input[type="email"]').fill('admin@yaksha.com');
    await page.locator('input[type="password"]').fill('admin123');
    await page.getByRole('button', { name: 'Sign in to Admin' }).click();

    // 3. Verify redirected to dashboard and elements load
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator('text=Overview')).toBeVisible();
    await expect(page.locator('text=Content')).toBeVisible();

    // 4. Navigate to AI Auto-Answers page
    await page.locator('text=AI Answers').click();
    await expect(page).toHaveURL(/\/admin\/auto-answer$/);
    await expect(page.locator('main h1')).toContainText('AI Auto-Answer Queue');

    // 5. Navigate to Users management page
    await page.locator('text=Users').click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.locator('header h1')).toContainText('Users');
  });
});
