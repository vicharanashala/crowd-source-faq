import { test, expect } from '@playwright/test';
import mongoose from 'mongoose';

test.describe('Student User Journeys', () => {
  let dbConnection: typeof mongoose | null = null;

  test.beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri) {
      dbConnection = await mongoose.connect(mongoUri);
    }
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

  test('should log in as student, search/browse FAQs, ask a question, upvote, and comment', async ({ page }) => {
    test.setTimeout(60000);
    // 1. Go to homepage
    await page.goto('/');
    await expect(page.locator('header').locator('text=Yaksha FAQ')).toBeVisible();

    // 2. Click Sign in in navbar to open auth modal
    await page.locator('text=Sign in').first().click();
    await expect(page.locator('#auth-modal-title')).toContainText('Sign in');

    // 3. Fill login credentials
    await page.locator('#modal-login-email').fill('user@yaksha.com');
    await page.locator('#modal-login-password').fill('password123');
    await page.locator('form button:has-text("Sign in")').click();

    // 4. Verify login by checking that Sign in button is gone and the profile button is visible
    await expect(page.locator('header').locator('text=Sign in').first()).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'T', exact: true })).toBeVisible();

    // 5. Navigate to FAQ Page
    await page.goto('/faq');
    await expect(page.locator('h1')).toContainText('Intern FAQs — solved');

    // 6. Click on the first category card
    await page.locator('.faq-card-clay').first().click();
    
    // 7. Verify category open (Back to categories button visible)
    await expect(page.locator('text=Back to all categories')).toBeVisible();

    // 8. Search for a keyword
    const searchInput = page.locator('input[placeholder="Ask anything about your internship..."]');
    await searchInput.fill('request');
    await page.locator('button[type="submit"]:has-text("Search")').click();

    // 9. Go to Community Board
    await page.goto('/community');
    await expect(page.locator('h1')).toContainText('Community Board');

    // 10. Ask a community question
    await page.locator('#ask-question-btn').click();
    await expect(page.locator('#create-post-title')).toContainText('Ask a Question');

    const uniqueTitle = `How do I request a duplicate certificate of completion? ${Date.now()}`;
    await page.locator('#post-title').fill(uniqueTitle);
    await page.locator('#post-body').fill('I completed my internship last week but did not receive the certificate. How can I request a new one?');
    await page.locator('#post-tags').fill('Certificate');
    await page.keyboard.press('Enter');

    await page.locator('button[type="submit"]:has-text("Post Question")').click();

    // 11. Find the newly created post and open it
    await page.locator(`text=${uniqueTitle}`).first().click();
    await expect(page.locator('h1').last()).toContainText(uniqueTitle);

    // 12. Upvote the post
    await page.getByRole('button', { name: 'Upvote' }).click();
    await expect(page.getByRole('button', { name: 'Upvoted' })).toBeVisible();

    // 13. Add a comment
    const commentBody = 'You need to email the coordinator with your details.';
    await page.getByPlaceholder('Add a comment…').fill(commentBody);
    await page.getByRole('button', { name: 'Post', exact: true }).click();

    // 14. Assert the comment is visible
    await expect(page.locator(`text=${commentBody}`)).toBeVisible();
  });
});
