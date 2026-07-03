import { describe, expect, it } from 'vitest';
import { validatePostAttachment, validatePostTag } from '../postFormValidation';

describe('post form validation', () => {
  it('rejects unsupported attachment types', () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    const result = validatePostAttachment(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('JPEG, PNG, WebP, or GIF');
  });

  it('rejects attachments larger than the configured limit', () => {
    const largeFile = new File(['x'.repeat(8 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    const result = validatePostAttachment(largeFile);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('8 MB');
  });

  it('rejects empty, duplicate, and overly long tags', () => {
    expect(validatePostTag('', ['existing']).valid).toBe(false);
    expect(validatePostTag('existing', ['existing']).valid).toBe(false);
    expect(validatePostTag('x'.repeat(25), ['other']).valid).toBe(false);
  });

  it('allows valid tags within the configured limit', () => {
    const result = validatePostTag('timetable', ['existing']);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
