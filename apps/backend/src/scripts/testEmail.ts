/**
 * scripts/testEmail.ts
 * One-off script to verify the email utility works before wiring it
 * into the real notification flow. Run with:
 *   pnpm --filter yaksha-faq-backend exec tsx src/scripts/testEmail.ts
 */
import 'dotenv/config';
import { sendEmail } from '../utils/email/sendEmail.js';

async function main() {
  const result = await sendEmail({
    to: 'test@example.com', // Mailtrap catches all emails regardless of the "to" address
    subject: 'Test email from CSFAQ local setup',
    text: 'If you see this in your Mailtrap inbox, the email utility works!',
  });
  console.log('Email sent successfully:', result);
  process.exit(result ? 0 : 1);
}

main();