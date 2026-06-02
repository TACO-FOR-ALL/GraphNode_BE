import { describe, it, expect } from '@jest/globals';
import { sanitizeMacroBundleFileSegment } from '../../src/shared/utils/macroBundleFiles';

describe('sanitizeMacroBundleFileSegment', () => {
  it('keeps only the last path segment (posix)', () => {
    expect(sanitizeMacroBundleFileSegment('a/b/c.pdf')).toBe('c.pdf');
  });

  it('keeps only the last path segment (windows)', () => {
    expect(sanitizeMacroBundleFileSegment('a\\b\\c.pdf')).toBe('c.pdf');
  });

  it('replaces traversal patterns and separators', () => {
    expect(sanitizeMacroBundleFileSegment('../evil.pdf')).toBe('evil.pdf'.replace(/\.\./g, '_'));
    expect(sanitizeMacroBundleFileSegment('..\\evil.pdf')).toBe('evil.pdf'.replace(/\.\./g, '_'));
    expect(sanitizeMacroBundleFileSegment('a/../b.pdf')).toBe('b.pdf'.replace(/\.\./g, '_'));
  });

  it('returns fallback for empty/whitespace', () => {
    expect(sanitizeMacroBundleFileSegment('')).toBe('file');
    expect(sanitizeMacroBundleFileSegment('   ')).toBe('file');
    expect(sanitizeMacroBundleFileSegment('/')).toBe('file');
    expect(sanitizeMacroBundleFileSegment('\\')).toBe('file');
  });
});

