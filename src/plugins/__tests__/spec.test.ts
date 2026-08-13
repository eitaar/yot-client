import { TrackingPluginSpecSchema } from '@/plugins/schema';

const valid = {
  id: 'tracking-demo',
  title: 'Tracking',
  description: 'Demo tracker',
  version: 1,
  data: {
    franchises: [{ name: 'Genshin Impact', abbr: 'GI', color: '#E8453C' }],
    items: [{ id: 't1', title: 'X', franchise: 'Genshin Impact', type: 'gacha', start: '2026-07-28', end: null, desc: '' }],
  },
};

describe('TrackingPluginSpecSchema', () => {
  it('accepts a valid spec', () => {
    expect(() => TrackingPluginSpecSchema.parse(valid)).not.toThrow();
  });
  it('accepts extra item fields', () => {
    const spec = { ...valid, data: { ...valid.data, items: [{ ...valid.data.items[0], round: 12 }] } };
    expect(() => TrackingPluginSpecSchema.parse(spec)).not.toThrow();
  });
  it('rejects a bad derive mode', () => {
    expect(() => TrackingPluginSpecSchema.parse({ ...valid, derive: { group: { mode: 'nope' } } })).toThrow();
  });
  it('rejects a bad showIf condition', () => {
    expect(() => TrackingPluginSpecSchema.parse({ ...valid, listRow: { type: 'Row', showIf: { field: 'x', is: 'maybe' } } })).toThrow();
  });
});
