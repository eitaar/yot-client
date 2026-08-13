jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/api/client', () => ({ getJSON: jest.fn() }));

import { getJSON } from '@/api/client';
import { loadTrackingSpec } from '@/plugins/loader';

describe('loadTrackingSpec', () => {
  it('returns the server spec when valid', async () => {
    (getJSON as jest.Mock).mockResolvedValue({ id: 'server-spec', version: 1, data: { fetch: 'https://x.example/y.json' } });
    const spec = await loadTrackingSpec();
    expect(spec.id).toBe('server-spec');
  });

  it('falls back to the default spec on failure', async () => {
    (getJSON as jest.Mock).mockRejectedValue(new Error('network'));
    const spec = await loadTrackingSpec(new Date('2026-07-28T15:30:00'));
    expect(spec.id).toBe('tracking-demo');
  });

  it('falls back to the default spec on an invalid payload', async () => {
    (getJSON as jest.Mock).mockResolvedValue({ id: 42 });
    const spec = await loadTrackingSpec();
    expect(spec.id).toBe('tracking-demo');
  });
});
