import type { TrackingPluginSpec } from '@/plugins/schema';

/**
 * F1 2026 season tracker — an example plugin that exercises a non-default
 * derive hook (index progress) and a custom row layout (round badge + circuit
 * + season-progress bar). Dates are illustrative.
 */
export const f12026Spec: TrackingPluginSpec = {
  id: 'f1-2026',
  version: 1,
  data: {
    franchises: [{ name: 'Formula 1', abbr: 'F1', color: '#E10600' }],
    items: [
      { id: 'f1-1', title: 'Australian Grand Prix', franchise: 'Formula 1', type: 'race', start: '2026-03-15', end: '2026-03-15', desc: 'Albert Park, Melbourne', round: 1, totalRounds: 24 },
      { id: 'f1-2', title: 'Chinese Grand Prix', franchise: 'Formula 1', type: 'race', start: '2026-03-22', end: '2026-03-22', desc: 'Shanghai International Circuit', round: 2, totalRounds: 24 },
      { id: 'f1-3', title: 'Japanese Grand Prix', franchise: 'Formula 1', type: 'race', start: '2026-04-05', end: '2026-04-05', desc: 'Suzuka Circuit', round: 3, totalRounds: 24 },
      { id: 'f1-4', title: 'Bahrain Grand Prix', franchise: 'Formula 1', type: 'race', start: '2026-04-19', end: '2026-04-19', desc: 'Bahrain International Circuit', round: 4, totalRounds: 24 },
      { id: 'f1-5', title: 'Miami Grand Prix', franchise: 'Formula 1', type: 'race', start: '2026-05-03', end: '2026-05-03', desc: 'Miami International Autodrome', round: 5, totalRounds: 24 },
      { id: 'f1-6', title: 'Monaco Grand Prix', franchise: 'Formula 1', type: 'race', start: '2026-05-24', end: '2026-05-24', desc: 'Circuit de Monaco', round: 6, totalRounds: 24 },
    ],
  },
  derive: {
    // Season progress: "round N / 24" instead of the default date-range bar.
    progress: { mode: 'index', currentField: 'round', totalField: 'totalRounds' },
  },
  listRow: {
    type: 'Row',
    action: 'openItem',
    children: [
      { type: 'Badge', value: '{{item.round}}' },
      { type: 'Column', children: [
        { type: 'Title', value: '{{item.title}}' },
        { type: 'Subtitle', value: '{{derived.timeLabel}}' },
        { type: 'ProgressBar', showIf: { field: 'derived.showProgress', is: 'truthy' }, props: { progress: '{{derived.progress}}' } },
      ] },
    ],
  },
  detail: {
    type: 'Column',
    children: [
      { type: 'Subtitle', value: 'Round {{item.round}}' },
      { type: 'Title', value: '{{item.title}}' },
      { type: 'Text', value: '{{item.desc}}' },
    ],
  },
  actions: { openItem: { kind: 'openItem' } },
};
