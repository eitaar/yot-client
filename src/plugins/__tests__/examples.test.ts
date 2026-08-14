jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { render } from '@testing-library/react-native';
import { describeWithSpec } from '@/plugins/derive';
import { f12026Spec } from '@/plugins/examples/f1-2026';
import { applyProgress } from '@/plugins/hooks';
import { renderTree } from '@/plugins/renderer';
import { TrackingPluginSpecSchema } from '@/plugins/schema';
import type { TrackingItem } from '@/store/tracking';
import { lightColors } from '@/theme/tokens';

const NOW = new Date('2026-05-20T12:00:00');

type RawItem = {
  id: string;
  title: string;
  franchise: string;
  type: string;
  start: string | null;
  end: string | null;
  desc: string;
  round?: number;
  totalRounds?: number;
};

function toTrackingItem(raw: RawItem): TrackingItem {
  const extra = {
    ...(raw.round !== undefined ? { round: raw.round } : {}),
    ...(raw.totalRounds !== undefined ? { totalRounds: raw.totalRounds } : {}),
  };
  return {
    id: raw.id,
    title: raw.title,
    franchise: raw.franchise,
    type: raw.type,
    start: raw.start ? new Date(raw.start) : null,
    end: raw.end ? new Date(raw.end) : null,
    desc: raw.desc,
    ...extra,
  } as TrackingItem;
}

function itemContext(raw: RawItem): Record<string, unknown> {
  return {
    id: raw.id,
    title: raw.title,
    franchise: raw.franchise,
    type: raw.type,
    start: raw.start ? new Date(raw.start).getTime() : null,
    end: raw.end ? new Date(raw.end).getTime() : null,
    desc: raw.desc,
    round: raw.round,
    totalRounds: raw.totalRounds,
  };
}

const items = (f12026Spec.data as { items: RawItem[] }).items;
const monaco = items.find((i) => i.round === 6)!;

describe('f1-2026 plugin', () => {
  it('is a valid spec', () => {
    expect(() => TrackingPluginSpecSchema.parse(f12026Spec)).not.toThrow();
  });

  it('computes index progress (round/total)', () => {
    const p = applyProgress(f12026Spec.derive?.progress, toTrackingItem(monaco), NOW);
    expect(p).toBeCloseTo(6 / 24);
  });

  it('renders the custom row layout (badge + circuit)', async () => {
    const derived = describeWithSpec(toTrackingItem(monaco), NOW, f12026Spec.derive);
    const ctx = {
      item: itemContext(monaco),
      derived: derived as unknown as Record<string, unknown>,
      color: '#E10600',
      colors: lightColors,
    };
    const { getByText } = await render(renderTree(f12026Spec.listRow!, ctx)!);
    expect(getByText('6')).toBeTruthy();
    expect(getByText('Monaco Grand Prix')).toBeTruthy();
  });
});
