/**
 * Feed thumbnail palette — ported verbatim from
 * `project/Calendar App v15.dc.html` lines 143-172.
 *
 * The prototype keyed a table by its integer event ids (`thumbs[1]`…
 * `thumbs[27]`). Yot event ids are opaque strings, so the table becomes an
 * ordered pool and {@link thumbFor} hashes the id into it — the same event
 * always draws the same thumbnail, and the distribution stays even.
 *
 * The `grad` pair is the CSS `linear-gradient(135deg, a, b)` stops; 135deg in
 * CSS runs top-left -> bottom-right, which the SVG renderer reproduces with
 * `x1/y1 = 0,0` and `x2/y2 = 1,1`.
 */

import { hashString } from '@/api/types';

export interface Thumb {
  /** `[from, to]` gradient stops, top-left to bottom-right. */
  grad: readonly [string, string];
  /** 16x16 viewBox path, stroked (never filled). */
  iconPath: string;
  iconColor: string;
}

/** The design's 27 thumbnails, in table order. */
export const thumbPool: readonly Thumb[] = [
  { grad: ['#FFE5E5', '#FFB3B3'], iconPath:
    'M12 4.5C12 4.5 10.5 2 8 2S4 4.5 4 4.5C4 4.5 2 6 2 8.5C2 12 5.5 14.5 8 16C10.5 14.5 14 12 14 8.5C14 6 12 4.5 12 4.5Z',
    iconColor: '#D14343' },
  { grad: ['#E0F5E9', '#A8E6CF'], iconPath:
    'M4 14L8 4L10 9L12 6L14 14',
    iconColor: '#1B8C5A' },
  { grad: ['#E0E5FF', '#B3C2FF'], iconPath:
    'M5 5h6v6H5zM3 9h10v4H3z',
    iconColor: '#5865F2' },
  { grad: ['#FFF0E0', '#FFD4A8'], iconPath:
    'M8 2C8 2 6 4 6 6C6 8 8 8 8 8C8 8 10 8 10 6C10 4 8 2 8 2ZM5 10C4 10 3 11 3 12V14H13V12C13 11 12 10 11 10H5Z',
    iconColor: '#D97706' },
  { grad: ['#E8F5E9', '#C8E6C9'], iconPath:
    'M3 14L5 8H7L6 11H10L9 14H11L13 8H15L13 2H3L3 14ZM7 5H11L10 8H6L7 5Z',
    iconColor: '#2E7D32' },
  { grad: ['#FFF3E0', '#FFE0B2'], iconPath:
    'M5 12C5 12 5 8 8 8C11 8 11 12 11 12M8 8C9.1 8 10 7.1 10 6C10 4.9 9.1 4 8 4C6.9 4 6 4.9 6 6C6 7.1 6.9 8 8 8ZM3 14H13',
    iconColor: '#BF360C' },
  { grad: ['#F3E5F5', '#E1BEE7'], iconPath:
    'M4 4H12V6H4ZM3 7H13V13H3ZM6 9H10',
    iconColor: '#7B1FA2' },
  { grad: ['#FFF8E1', '#FFECB3'], iconPath:
    'M4 10C4 10 4 6 8 4C12 6 12 10 12 10M3 12H13M6 10V12M10 10V12',
    iconColor: '#F57F17' },
  { grad: ['#E3F2FD', '#BBDEFB'], iconPath:
    'M3 4H13V12H3ZM5 6H11M5 8H9M5 10H7',
    iconColor: '#1565C0' },
  { grad: ['#ECEFF1', '#CFD8DC'], iconPath:
    'M8 3L8 5M4 8H2M14 8H12M5 5L3.5 3.5M11 5L12.5 3.5M4 8A4 4 0 108 12A4 4 0 104 8Z',
    iconColor: '#455A64' },
  { grad: ['#E8F5E9', '#C8E6C9'], iconPath:
    'M8 3C8 3 4 7 4 9C4 11.2 5.8 13 8 13C10.2 13 12 11.2 12 9C12 7 8 3 8 3Z',
    iconColor: '#2E7D32' },
  { grad: ['#FBE9E7', '#FFCCBC'], iconPath:
    'M4 6H12M4 9H12M6 12H10M3 4H13V14H3Z',
    iconColor: '#BF360C' },
  { grad: ['#E8EAF6', '#C5CAE9'], iconPath:
    'M3 3h10v10H3zM6 6h4M6 8h2',
    iconColor: '#3949AB' },
  { grad: ['#FFF3E0', '#FFE0B2'], iconPath:
    'M6 2v3M10 2v3M4 8h8M8 8v5',
    iconColor: '#E65100' },
  { grad: ['#FBE9E7', '#FFAB91'], iconPath:
    'M4 12l4-8 4 8M5 10h6',
    iconColor: '#BF360C' },
  { grad: ['#E8F5E9', '#A5D6A7'], iconPath:
    'M8 3v10M5 6l3-3 3 3M4 13h8',
    iconColor: '#2E7D32' },
  { grad: ['#E3F2FD', '#90CAF9'], iconPath:
    'M4 12c0-4 4-8 4-8s4 4 4 8M6 10h4',
    iconColor: '#1565C0' },
  { grad: ['#FCE4EC', '#F8BBD0'], iconPath:
    'M4 3h8v11H4zM6 6h4M6 8h3M6 10h4',
    iconColor: '#AD1457' },
  { grad: ['#E0F2F1', '#B2DFDB'], iconPath:
    'M4 13l4-3 4 3M4 10l4-3 4 3',
    iconColor: '#00695C' },
  { grad: ['#F3E5F5', '#CE93D8'], iconPath:
    'M8 4v4M6 6h4M5 10a3 3 0 006 0',
    iconColor: '#6A1B9A' },
  { grad: ['#E8EAF6', '#9FA8DA'], iconPath:
    'M3 13h10V5l-5-3-5 3v8zM6 9h4v4H6z',
    iconColor: '#283593' },
  { grad: ['#FFF8E1', '#FFD54F'], iconPath:
    'M5 13V5h2v8M9 13V3h2v10',
    iconColor: '#F57F17' },
  { grad: ['#E8F5E9', '#81C784'], iconPath:
    'M8 3l4 4H4l4-4zM6 8v5h4V8',
    iconColor: '#2E7D32' },
  { grad: ['#FBE9E7', '#FF8A65'], iconPath:
    'M4 4h8v8H4zM6 6h1M9 6h1M6 9h4',
    iconColor: '#D84315' },
  { grad: ['#E0F7FA', '#80DEEA'], iconPath:
    'M4 13l4-10 4 10M6 8h4',
    iconColor: '#00838F' },
  { grad: ['#F1F8E9', '#AED581'], iconPath:
    'M4 8a4 4 0 018 0M8 4v1M5 12h6',
    iconColor: '#558B2F' },
  { grad: ['#EFEBE9', '#BCAAA4'], iconPath:
    'M8 4c-2 0-4 3-4 6h8c0-3-2-6-4-6zM6 12h4',
    iconColor: '#4E342E' },
] as const;

/**
 * The prototype's `getThumb` fallback (line 512), used when the pool is empty
 * — which it never is, but the shape is part of the ported contract.
 */
export const fallbackThumb: Thumb = {
  grad: ['#F5F5F5', '#E0E0E0'],
  iconPath: 'M8 4v8M4 8h8',
  iconColor: '#999999',
};

/** Stable pick: the same event id always yields the same thumbnail. */
export function thumbFor(id: string): Thumb {
  if (thumbPool.length === 0) return fallbackThumb;
  return thumbPool[hashString(id) % thumbPool.length];
}
