import { describe, expect, it } from 'vitest';
import { sanitizeExternalUrl } from './links.ts';

describe('sanitizeExternalUrl', () => {
  it.each([
    ['https://example.com/a?b=c', 'https://example.com/a?b=c'],
    ['http://example.com', 'http://example.com/'],
    ['  https://example.com  ', 'https://example.com/'],
    ['mailto:someone@example.com', 'mailto:someone@example.com'],
  ])('allows %s', (input, expected) => {
    expect(sanitizeExternalUrl(input)).toBe(expected);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
    'smb://server/share',
    'https://user:pass@example.com/',
    'not a url',
    '',
  ])('blocks %s', (input) => {
    expect(sanitizeExternalUrl(input)).toBeNull();
  });
});
