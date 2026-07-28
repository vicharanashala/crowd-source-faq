/**
 * utils/email/sendEmail.ts
 *
 * Small, self-contained email-sending utility using nodemailer.
 * Added as a new capability alongside the existing in-app-only
 * notifications.service.ts — does not modify any existing logic.
 *
 * Usage:
 *   import { sendEmail } from '../utils/email/sendEmail.js';
 *   await sendEmail({
 *     to: 'user@example.com',
 *     subject: 'Your question was answered',
 *     text: 'Someone replied to your question on Yaksha FAQ.',
 *   });
 */
import nodemailer from 'nodemailer';
import { logger } from '../http/logger.js';

interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
    logger.warn('[email] MAIL_HOST/MAIL_USER/MAIL_PASS not fully configured — email sending disabled.');
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT ?? 2525),
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }
  return transporter;
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;

  try {
    await t.sendMail({
      from: '"Yaksha FAQ Portal" <no-reply@yaksha-faq.local>',
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    logger.info(`[email] sent to ${input.to}: ${input.subject}`);
    return true;
  } catch (err) {
    logger.error(`[email] failed to send to ${input.to}: ${(err as Error).message}`);
    return false;
  }
}