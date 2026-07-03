import { describe, it, expect } from 'vitest';
import {
  sanitizeHtml,
  stripHtml,
  sanitizeText,
  sanitizeRegex,
  sanitizeEmail,
  sanitizeBase64,
  sanitizePathSegment,
} from '../sanitize.js';

/**
 * Regression tests for input-sanitisation helpers (XSS / injection surface).
 * The server stores `sanitizeHtml`-cleaned strings; React escapes on render,
 * so these are defence-in-depth. The tests pin the contract so a future
 * refactor of the (regex-based) stripper can't silently regress.
 */
describe('sanitizeHtml', () => {
  it('strips well-formed HTML tags', () => {
    expect(sanitizeHtml('<b>hi</b>')).toBe('hi');
    expect(sanitizeHtml('<img src=x onerror=alert(1)>')).toBe('');
    expect(sanitizeHtml('a<script>steal()</script>b')).toBe('asteal()b');
  });

  it('strips control characters (\\x00-\\x1F, \\x7F)', () => {
    expect(sanitizeHtml('a\tb\nc')).toBe('abc');
    expect(sanitizeHtml('x\x00\x7Fy')).toBe('xy');
  });

  it('returns empty string for non-string input (no throw)', () => {
    expect(sanitizeHtml(undefined)).toBe('');
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml({ $ne: null } as unknown)).toBe('');
    expect(sanitizeHtml(12345 as unknown)).toBe('');
  });

  it('leaves ordinary text intact', () => {
    expect(sanitizeHtml('Hello, world!')).toBe('Hello, world!');
  });
});

describe('sanitizeText', () => {
  it('removes control chars (incl. newlines/tabs) and trims', () => {
    // stripHtml removes \r\n\t as control chars; remaining spaces are trimmed.
    expect(sanitizeText('  line1\r\nline2\tend  ')).toBe('line1line2end');
  });
  it('strips tags too', () => {
    expect(sanitizeText('<h1>Title</h1>')).toBe('Title');
  });
  it('returns empty string for non-string input', () => {
    expect(sanitizeText(undefined)).toBe('');
  });
});

describe('stripHtml', () => {
  it('removes tags and control chars', () => {
    expect(stripHtml('<p>x</p>')).toBe('x');
  });
});

describe('sanitizeRegex', () => {
  it('escapes regex metacharacters (ReDoS / injection guard)', () => {
    expect(sanitizeRegex('a.*b+c?')).toBe('a\\.\\*b\\+c\\?');
    expect(sanitizeRegex('(group)[set]{n}')).toBe('\\(group\\)\\[set\\]\\{n\\}');
  });
  it('is safe to embed in a RegExp (matches literally, not as wildcards)', () => {
    const re = new RegExp(sanitizeRegex('a.b'));
    expect(re.test('a.b')).toBe(true);
    expect(re.test('axb')).toBe(false); // '.' was escaped, not treated as wildcard
  });
});

describe('sanitizeEmail', () => {
  it('lowercases and trims valid addresses', () => {
    expect(sanitizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });
  it('rejects malformed / injection input', () => {
    expect(sanitizeEmail('not-an-email')).toBe('');
    expect(sanitizeEmail({ $ne: null } as unknown)).toBe('');
    expect(sanitizeEmail('a@b')).toBe(''); // no domain dot
  });
});

describe('sanitizeBase64', () => {
  it('keeps only base64 characters', () => {
    expect(sanitizeBase64('YWJj;DROP TABLE--')).toBe('YWJjDROPTABLE');
  });
});

describe('sanitizePathSegment', () => {
  it('blocks path traversal and separators', () => {
    expect(sanitizePathSegment('../../etc/passwd')).toBe('etcpasswd');
    expect(sanitizePathSegment('a/b\\c')).toBe('abc');
    expect(sanitizePathSegment('a..b')).toBe('ab'); // ".." sequence removed
  });
  it('returns empty for non-string input', () => {
    expect(sanitizePathSegment(undefined)).toBe('');
  });
});
