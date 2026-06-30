import { test, expect } from '@playwright/test';
import mongoose from 'mongoose';

test.describe('FAQ Freshness Lifecycle', () => {
  let dbConnection: typeof mongoose | null = null;
  let targetFaqId: string = '';
  let targetFaqQuestion: string = '';

  test.beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }
    dbConnection = await mongoose.connect(mongoUri);

    // Retrieve a seeded FAQ to report
    const db = mongoose.connection.db;
    const faq = await db?.collection('yaksha_faq_faqs').findOne({ status: 'approved' });
    if (!faq) {
      throw new Error('No seeded FAQs found in database.');
    }
    targetFaqId = faq._id.toString();
    targetFaqQuestion = faq.question;
  });

  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem('yaksha_first_visit_prompt_seen', '1');
      } catch (e) {
        // ignore early SecurityError on about:blank
      }
    });
  });

  test.afterAll(async () => {
    if (dbConnection) {
      await mongoose.disconnect();
    }
  });

  test('should report FAQ as student and verify/clear report as admin', async ({ page }) => {
    // 1. Go to homepage and log in as student
    await page.goto('/');
    await page.locator('text=Sign in').first().click();
    await page.locator('#modal-login-email').fill('user@yaksha.com');
    await page.locator('#modal-login-password').fill('password123');
    await page.locator('form button:has-text("Sign in")').click();

    // Verify student is logged in
    await expect(page.locator('header').locator('text=Sign in').first()).not.toBeVisible();

    // 2. Navigate to target FAQ detail page directly
    await page.goto(`/faq/${targetFaqId}`);
    await expect(page.locator('h1')).toContainText('Intern FAQs — solved');
    await expect(page.locator(`text=${targetFaqQuestion}`)).toBeVisible();

    // 3. Report the FAQ
    await page.locator('button:has-text("Report this question")').click();
    await expect(page.locator('h3:has-text("Report FAQ")')).toBeVisible();

    const reportReason = 'The email and office address in this FAQ are outdated due to recent department changes.';
    await page.locator('textarea').fill(reportReason);
    await page.locator('button[type="submit"]:has-text("Submit Report")').click();

    // Assert report submitted successfully
    await expect(page.locator('text=Report submitted.')).toBeVisible();
    await page.locator('button:has-text("Close")').click();

    // 4. Log out student
    await page.getByRole('button', { name: 'T', exact: true }).click();
    await page.locator('button:has-text("Sign out")').click();
    await expect(page.locator('text=Sign in').first()).toBeVisible();

    // 5. Log in as admin
    await page.goto('/admin/login');
    await page.locator('input[type="email"]').fill('admin@yaksha.com');
    await page.locator('input[type="password"]').fill('admin123');
    await page.getByRole('button', { name: 'Sign in to Admin' }).click();
    await expect(page).toHaveURL(/\/admin$/);

    // 6. Go to FaqReview page
    await page.goto('/admin/faqs/review');
    await expect(page.locator('main h1')).toContainText('FAQ Review');

    // 7. Verify the reported FAQ is listed with correct report reason
    const row = page.locator('tr').filter({ hasText: targetFaqQuestion }).filter({ hasText: reportReason });
    await expect(row).toBeVisible();

    // 8. Click Verify to clear the reports and re-verify the FAQ
    await row.locator('button.btn-verify-reported').click();

    // 9. Assert the FAQ is removed from the review queue
    await expect(row).not.toBeVisible({ timeout: 8000 });
  });
});
