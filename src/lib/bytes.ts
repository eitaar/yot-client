/**
 * Byte accounting for the Settings "Local cache" row.
 *
 * The cache is a JSON string in AsyncStorage, so its size is the UTF-8 length
 * of that string. `Blob` and `Buffer` are both unavailable on Hermes, and
 * `TextEncoder` only landed in recent React Native, so there is a hand-rolled
 * fallback.
 */

/** UTF-8 length of a string, in bytes. */
export function utf8ByteLength(value: string): number {
  const Encoder = (globalThis as { TextEncoder?: typeof TextEncoder }).TextEncoder;
  if (typeof Encoder === 'function') return new Encoder().encode(value).length;

  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      // A surrogate pair is one 4-byte code point; skip its low half.
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Human-readable size, in the design's shape: `2.3 MB`, `14 KB`, `312 B`.
 *
 * Below 10 of a unit a decimal is worth showing ("9.4 KB"); above it, it is
 * noise ("14 KB"). Megabytes always keep one decimal, as the design's mock did.
 */
export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;

  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;

  return `${(mb / 1024).toFixed(1)} GB`;
}
