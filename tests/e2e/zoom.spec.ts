import { test, expect } from '@playwright/test';

test.describe('Zoom Ingestion Journeys', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem('yaksha_first_visit_prompt_seen', '1');
      } catch (e) {
        // ignore early SecurityError on about:blank
      }
    });
  });

  test('should allow admin to manually upload a Zoom VTT transcript, process it, and verify in admin insights', async ({ page }) => {
    // 1. Log in as admin
    await page.goto('/admin/login');
    await page.locator('input[type="email"]').fill('admin@yaksha.com');
    await page.locator('input[type="password"]').fill('admin123');
    await page.getByRole('button', { name: 'Sign in to Admin' }).click();
    await expect(page).toHaveURL(/\/admin$/);

    // 2. Go to Account Page
    await page.goto('/account');
    await expect(page.locator('h1')).toContainText('Account');

    // 3. Set Meeting Topic
    await page.locator('#transcript-topic').fill('E2E Test Zoom Meeting');

    // 4. Set Mock VTT File
    const mockVTTContent = `WEBVTT

00:00:01.000 --> 00:00:05.000
John: Welcome to our Q&A session.

00:00:06.000 --> 00:00:12.000
Student: How do I request an NOC document for college?

00:00:13.000 --> 00:00:20.000
John: You can request an NOC by submitting the NOC form on the student dashboard. It takes about 2 days.
`;

    await page.setInputFiles('#transcript-upload-vtt', {
      name: 'transcript.vtt',
      mimeType: 'text/vtt',
      buffer: Buffer.from(mockVTTContent, 'utf-8'),
    });

    // Click Process to open confirmation modal
    await page.getByRole('button', { name: 'Process', exact: true }).click();

    // 5. Confirm processing modal
    await expect(page.locator('text=Process transcript?')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm & Process' }).click();

    // 6. Wait for upload processing completion
    await expect(page.locator('text=Done —').first()).toBeVisible({ timeout: 15000 });

    // 7. Go to Admin Zoom Insights to verify the insight exists
    await page.goto('/admin/zoom-insights');
    await expect(page.locator('h1')).toContainText('Zoom Insights');
    await expect(page.locator('text=How do I request an NOC?')).toBeVisible();
  });
});
