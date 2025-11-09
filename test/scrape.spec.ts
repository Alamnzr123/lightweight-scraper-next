import { describe, it, expect } from 'vitest';
import { isValidHttpUrl } from '../src/pages/api/scrape';

describe('isValidHttpUrl', () => {
  it('returns true for http and https urls', () => {
    expect(isValidHttpUrl('https://github.com/Alamnzr123/retrieve-local-json-next')).toBe(true);
    expect(isValidHttpUrl('https://example.com')).toBe(true);
  });

  it('returns false for invalid or missing protocols', () => {
    expect(isValidHttpUrl('ftp://example.com')).toBe(false);
    expect(isValidHttpUrl('')).toBe(false);
    expect(isValidHttpUrl('not-a-url')).toBe(false);
  });
});
