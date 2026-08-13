jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { addDays, startOfDay } from 'date-fns';
import { describeWithSpec, groupItemsBySpec } from '@/plugins/derive';
import { describe as describeItem, type TrackingItem } from '@/store/tracking';

const NOW = new Date('2026-07-28T15:30:00');
const TODAY = startOfDay(NOW);

function item(o: Partial<TrackingItem>): TrackingItem {
  return { id: 'x', title: 'X', franchise: 'G', type: 'gacha', start: TODAY, end: TODAY, desc: '', ...o };
}

describe('describeWithSpec', () => {
  it('matches describe() with no derive', () => {
    const it = item({ start: addDays(TODAY, 3) });
    expect(describeWithSpec(it, NOW)).toEqual(describeItem(it, NOW));
  });

  it('overrides timeLabel with date mode', () => {
    const it = item({ start: TODAY });
    expect(describeWithSpec(it, NOW, { timeLabel: { mode: 'date' } }).timeLabel).toBe(
      TODAY.toISOString().slice(0, 10),
    );
  });
});

describe('groupItemsBySpec', () => {
  it('preserves fixed order for the default/deadline mode', () => {
    const buckets = groupItemsBySpec([item({ start: null }), item({ start: addDays(TODAY, 3) })], NOW);
    expect(buckets.map((b) => b.group)).toEqual(['This Week', 'TBA']);
  });

  it('groups by category in first-appearance order', () => {
    const a = item({}) as unknown as Record<string, unknown>;
    a.platform = 'PS5';
    const b = item({}) as unknown as Record<string, unknown>;
    b.platform = 'Switch';
    const buckets = groupItemsBySpec([a as unknown as TrackingItem, b as unknown as TrackingItem], NOW, {
      group: { mode: 'category', field: 'platform' },
    });
    expect(buckets.map((x) => x.group)).toEqual(['PS5', 'Switch']);
  });
});
