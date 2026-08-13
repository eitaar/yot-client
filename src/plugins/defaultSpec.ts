import type { TrackingPluginSpec } from '@/plugins/schema';
import { buildSeedItems, designFranchises } from '@/store/tracking';

/**
 * The bundled default spec reproduces the design's demo tracker exactly.
 * Derive uses the built-in defaults (deadline/countdown/range); the layout
 * tree mirrors TrackingView's rows and tracking/[id]'s detail.
 */
export function buildDefaultSpec(now: Date = new Date()): TrackingPluginSpec {
  return {
    id: 'tracking-demo',
    title: 'Tracking',
    description: 'The demo tracker — gacha banners, manga, and games you follow.',
    version: 1,
    data: {
      franchises: designFranchises.map((f) => ({ ...f })),
      items: buildSeedItems(now).map((i) => ({
        id: i.id,
        title: i.title,
        franchise: i.franchise,
        type: i.type,
        start: i.start ? i.start.toISOString() : null,
        end: i.end ? i.end.toISOString() : null,
        desc: i.desc,
      })),
    },
    // derive omitted → built-in defaults
    listRow: {
      type: 'Row',
      action: 'openItem',
      children: [
        { type: 'Column', children: [
          { type: 'Title', value: '{{item.title}}' },
          { type: 'Subtitle', value: '{{item.franchise}}' },
          { type: 'ProgressBar', showIf: { field: 'derived.showProgress', is: 'truthy' }, props: { progress: '{{derived.progress}}' } },
        ] },
        { type: 'TimeLabel', value: '{{derived.timeLabel}}' },
      ],
    },
    detail: {
      type: 'Column',
      children: [
        { type: 'Subtitle', value: '{{item.franchise}}' },
        { type: 'Title', value: '{{item.title}}' },
        { type: 'Text', value: '{{derived.timeLabel}}' },
        { type: 'Text', value: '{{item.desc}}' },
      ],
    },
    actions: { openItem: { kind: 'openItem' } },
  };
}

export const DEFAULT_SPEC_ID = 'tracking-demo';
