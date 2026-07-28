/** Cache-size arithmetic behind the Settings "Local cache" row. */

import { formatByteSize, utf8ByteLength } from '@/lib/bytes';

describe('utf8ByteLength', () => {
  it('counts ASCII as one byte each', () => {
    expect(utf8ByteLength('')).toBe(0);
    expect(utf8ByteLength('hello')).toBe(5);
  });

  it('counts multi-byte code points properly', () => {
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('日')).toBe(3);
    // A surrogate pair is one 4-byte code point, not two 3-byte ones.
    expect(utf8ByteLength('😀')).toBe(4);
  });

  it('agrees with the manual fallback when TextEncoder is missing', () => {
    const sample = 'Design review — 会議 😀';
    const withEncoder = utf8ByteLength(sample);

    const original = globalThis.TextEncoder;
    // @ts-expect-error — deliberately removing it to exercise the fallback.
    delete globalThis.TextEncoder;
    try {
      expect(utf8ByteLength(sample)).toBe(withEncoder);
    } finally {
      globalThis.TextEncoder = original;
    }
  });
});

describe('formatByteSize', () => {
  it('renders the design\'s shapes', () => {
    expect(formatByteSize(2.3 * 1024 * 1024)).toBe('2.3 MB');
    expect(formatByteSize(14 * 1024)).toBe('14 KB');
    expect(formatByteSize(312)).toBe('312 B');
  });

  it('keeps a decimal below 10 of a unit and drops it above', () => {
    expect(formatByteSize(9.4 * 1024)).toBe('9.4 KB');
    expect(formatByteSize(101 * 1024)).toBe('101 KB');
  });

  it('handles an empty or impossible cache without producing NaN', () => {
    expect(formatByteSize(0)).toBe('0 B');
    expect(formatByteSize(-5)).toBe('0 B');
    expect(formatByteSize(Number.NaN)).toBe('0 B');
  });

  it('rolls over into GB rather than printing five-digit megabytes', () => {
    expect(formatByteSize(3 * 1024 ** 3)).toBe('3.0 GB');
  });
});
