jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { buildDefaultSpec } from '@/plugins/defaultSpec';
import { TrackingPluginSpecSchema } from '@/plugins/spec';

describe('buildDefaultSpec', () => {
  it('parses against the schema', () => {
    expect(() => TrackingPluginSpecSchema.parse(buildDefaultSpec())).not.toThrow();
  });

  it('carries the design dataset', () => {
    const spec = buildDefaultSpec(new Date('2026-07-28T15:30:00'));
    const data = spec.data;
    expect('items' in data && data.items.length).toBeGreaterThan(0);
  });

  it('has a valid listRow tree and openItem action', () => {
    const spec = buildDefaultSpec();
    expect(spec.listRow?.type).toBe('Row');
    expect(spec.actions?.openItem?.kind).toBe('openItem');
  });
});
