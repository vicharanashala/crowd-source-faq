import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '../utils/http/sanitize';

describe('sanitizeHtml', () => {
  it('strips simple HTML tags', () => {
    const input = '<p>hello <b>world</b></p>';
    expect(sanitizeHtml(input)).toBe('hello world');
  });

  it('strips script tags', () => {
    const input = '<script>alert(1)</script>';
    expect(sanitizeHtml(input)).toBe('alert(1)');
  });

  it('handles nested tags to prevent bypasses', () => {
    const input = '<scr<script>ipt>alert(1)</scr</script>ipt>';
    expect(sanitizeHtml(input)).toBe('alert(1)');
  });

  it('neutralizes multiple nested tag layers', () => {
    const input = '<<script>script>alert(1)</script>';
    expect(sanitizeHtml(input)).toBe('alert(1)');
  });

  it('strips control characters', () => {
    const input = 'hello\x00world';
    expect(sanitizeHtml(input)).toBe('helloworld');
  });

  it('returns empty string for non-string inputs', () => {
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
    expect(sanitizeHtml(123)).toBe('');
  });

  it('strips unclosed tags at the end of input', () => {
    const input = 'hello <script src="evil.js"';
    expect(sanitizeHtml(input)).toBe('hello ');
  });
});
