/**
 * Tracking store tests: design-day anchoring (trToday = 22), the derived
 * helpers' semantics (matching v15 lines 875–899), grouping/sorting, and the
 * persisted-seed round trip.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import {
  DESIGN_TODAY,
  TRACKING_STORAGE_KEY,
  type TrackingItem,
  anchorDay,
  buildSeedItems,
  compareTrackingItems,
  describe as describeItem,
  designItems,
  filteredItems,
  group,
  groupedItems,
  progress,
  sortedItems,
  timeLabel,
  useTracking,
} from '@/store/tracking';

/** A fixed "now" so day math is deterministic. */
const NOW = new Date('2026-07-28T15:30:00');
const TODAY = startOfDay(NOW);

function item(overrides: Partial<TrackingItem>): TrackingItem {
  return {
    id: 'x',
    title: 'X',
    franchise: 'Genshin Impact',
    type: 'gacha',
    start: TODAY,
    end: TODAY,
    desc: '',
    ...overrides,
  };
}

const day = (offset: number) => addDays(TODAY, offset);

beforeEach(async () => {
  await AsyncStorage.clear();
  useTracking.setState({ franchises: [], items: [], seededAt: null, hydrated: false });
});

describe('anchorDay', () => {
  it('maps the design "today" (22) to today', () => {
    expect(anchorDay(DESIGN_TODAY, NOW)?.getTime()).toBe(TODAY.getTime());
  });

  it('maps startDay 10 to today−12d and startDay 35 to today+13d', () => {
    expect(anchorDay(10, NOW)?.getTime()).toBe(day(-12).getTime());
    expect(anchorDay(35, NOW)?.getTime()).toBe(day(13).getTime());
  });

  it('keeps null as TBA', () => {
    expect(anchorDay(null, NOW)).toBeNull();
  });
});

describe('buildSeedItems', () => {
  const seeded = buildSeedItems(NOW);
  const byId = Object.fromEntries(seeded.map((i) => [i.id, i]));

  it('ports all 13 design items', () => {
    expect(seeded).toHaveLength(designItems.length);
    expect(seeded).toHaveLength(13);
  });

  it('anchors every non-null day relative to the seed time', () => {
    for (const design of designItems) {
      const real = byId[design.id];
      if (design.startDay === null) {
        expect(real.start).toBeNull();
      } else {
        expect(differenceInCalendarDays(real.start!, TODAY)).toBe(design.startDay - DESIGN_TODAY);
      }
      if (design.endDay === null) {
        expect(real.end).toBeNull();
      } else {
        expect(differenceInCalendarDays(real.end!, TODAY)).toBe(design.endDay - DESIGN_TODAY);
      }
    }
  });

  it('spot-checks the design examples', () => {
    // t1: startDay 10 / endDay 34 → −12d .. +12d (active range).
    expect(byId.t1.start!.getTime()).toBe(day(-12).getTime());
    expect(byId.t1.end!.getTime()).toBe(day(12).getTime());
    // t2: 22/22 → today, single-day.
    expect(byId.t2.start!.getTime()).toBe(TODAY.getTime());
    // t12/t13: TBA.
    expect(byId.t12.start).toBeNull();
    expect(byId.t13.end).toBeNull();
  });
});

describe('derived helpers (design lines 875–899 semantics)', () => {
  it('an in-range item is Active with progress and daysLeft', () => {
    // Design t3: startDay 12, endDay 30 → −10d .. +8d; range 18, elapsed 10.
    const t3 = item({ start: day(-10), end: day(8) });
    const d = describeItem(t3, NOW);
    expect(d.isActive).toBe(true);
    expect(d.isTBA).toBe(false);
    expect(d.daysUntil).toBe(0);
    expect(d.daysLeft).toBe(8);
    expect(d.progress).toBeCloseTo(10 / 18);
    expect(d.showProgress).toBe(true);
    expect(d.group).toBe('Active');
    expect(d.timeLabel).toBe('8d left');
  });

  it('a single-day item starting today is Active/"0d left", not a range', () => {
    const t2 = item({ start: TODAY, end: TODAY });
    const d = describeItem(t2, NOW);
    expect(d.isActive).toBe(true);
    expect(d.group).toBe('Active');
    expect(d.showProgress).toBe(false);
    expect(d.progress).toBe(0);
    expect(d.timeLabel).toBe('0d left');
  });

  it('an open-ended started item is "Live"', () => {
    const live = item({ start: day(-3), end: null });
    expect(timeLabel(live, NOW)).toBe('Live');
    expect(group(live, NOW)).toBe('Active');
    expect(describeItem(live, NOW).daysLeft).toBeNull();
  });

  it('within 7 days is This Week, beyond is Later', () => {
    // Design t5: startDay 26 → +4d. t9: startDay 35 → +13d.
    const t5 = item({ start: day(4), end: day(4) });
    const t9 = item({ start: day(13), end: day(33) });
    expect(describeItem(t5, NOW)).toMatchObject({
      group: 'This Week',
      daysUntil: 4,
      timeLabel: '4d',
      isActive: false,
      progress: 0,
    });
    expect(describeItem(t9, NOW)).toMatchObject({ group: 'Later', daysUntil: 13, timeLabel: '13d' });
  });

  it('exactly 7 days out is still This Week (<= boundary)', () => {
    expect(group(item({ start: day(7), end: day(7) }), NOW)).toBe('This Week');
    expect(group(item({ start: day(8), end: day(8) }), NOW)).toBe('Later');
  });

  it('null start is TBA', () => {
    const tba = item({ start: null, end: null });
    expect(describeItem(tba, NOW)).toMatchObject({
      isTBA: true,
      isActive: false,
      daysUntil: null,
      daysLeft: null,
      group: 'TBA',
      timeLabel: 'TBA',
    });
  });

  it('an ended item is no longer active and clamps progress to 0', () => {
    const over = item({ start: day(-10), end: day(-2) });
    expect(describeItem(over, NOW).isActive).toBe(false);
    expect(progress(over, NOW)).toBe(0);
  });

  it('progress clamps to 1 on the final day', () => {
    const lastDay = item({ start: day(-5), end: day(0) });
    expect(progress(lastDay, NOW)).toBe(1);
  });
});

describe('sorting and grouping', () => {
  const seeded = buildSeedItems(NOW);
  const state = { franchises: [], items: seeded, seededAt: NOW.toISOString(), hydrated: true };

  it('sorts active first, then by start, with TBA last (design order)', () => {
    const sorted = [...seeded].sort((a, b) => compareTrackingItems(a, b, NOW));
    const ids = sorted.map((i) => i.id);
    // Active at seed time: t1(10-34), t2(22-22), t3(12-30), t4(15-28) → by start.
    expect(ids.slice(0, 4)).toEqual(['t1', 't3', 't4', 't2']);
    expect(ids.slice(-2).sort()).toEqual(['t12', 't13']); // TBA sinks
  });

  it('buckets into Active / This Week / Later / TBA', () => {
    const buckets = groupedItems(state, null, NOW);
    expect(buckets.map((b) => b.group)).toEqual(['Active', 'This Week', 'Later', 'TBA']);
    const byGroup = Object.fromEntries(buckets.map((b) => [b.group, b.items.map((i) => i.id)]));
    expect(byGroup.Active!.sort()).toEqual(['t1', 't2', 't3', 't4']);
    // startDays 26,27,29 → +4,+5,+7 (within the <=7d window); t7 at +8 is Later.
    expect(byGroup['This Week']!.sort()).toEqual(['t5', 't6', 't8']);
    expect(byGroup.Later!.sort()).toEqual(['t10', 't11', 't7', 't9']);
    expect(byGroup.TBA!.sort()).toEqual(['t12', 't13']);
  });

  it('filters by franchise', () => {
    const genshin = filteredItems(state, 'Genshin Impact', NOW);
    expect(genshin.map((i) => i.id).sort()).toEqual(['t1', 't9']);
    expect(filteredItems(state, null, NOW)).toHaveLength(13);
  });

  it('memoizes the sorted list per items array and day', () => {
    expect(sortedItems(state, NOW)).toBe(sortedItems(state, NOW));
  });
});

describe('store seeding and persistence', () => {
  it('ensureSeeded populates once and is a no-op after', async () => {
    await useTracking.getState().ensureSeeded(NOW);
    const first = useTracking.getState().items;
    expect(first).toHaveLength(13);
    expect(useTracking.getState().franchises).toHaveLength(9);
    expect(useTracking.getState().seededAt).toBe(NOW.toISOString());

    await useTracking.getState().ensureSeeded(new Date('2027-01-01T00:00:00'));
    expect(useTracking.getState().items).toBe(first); // not re-anchored
  });

  it('round-trips Dates (and TBA nulls) through the persisted JSON', async () => {
    await useTracking.getState().ensureSeeded(NOW);
    await new Promise((resolve) => setTimeout(resolve, 0)); // let persist flush

    const raw = await AsyncStorage.getItem(TRACKING_STORAGE_KEY);
    expect(raw).toBeTruthy();

    // Fresh launch: blanking via setState also re-persists the blank state,
    // so put the captured snapshot back before rehydrating.
    useTracking.setState({ franchises: [], items: [], seededAt: null, hydrated: false });
    await AsyncStorage.setItem(TRACKING_STORAGE_KEY, raw!);
    await useTracking.persist.rehydrate();

    const items = useTracking.getState().items;
    expect(items).toHaveLength(13);
    const t1 = items.find((i) => i.id === 't1')!;
    expect(t1.start).toBeInstanceOf(Date);
    expect(t1.start!.getTime()).toBe(day(-12).getTime());
    const t12 = items.find((i) => i.id === 't12')!;
    expect(t12.start).toBeNull();
  });
});
