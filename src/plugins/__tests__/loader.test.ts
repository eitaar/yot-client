jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/api/client', () => ({ getJSON: jest.fn() }));

import { getJSON } from '@/api/client';
import { f12026Spec } from '@/plugins/examples/f1-2026';
import { listPlugins, loadPluginSpec, resolveSpecData } from '@/plugins/loader';

describe('loadPluginSpec', () => {
  it('returns the server spec when valid', async () => {
    (getJSON as jest.Mock).mockResolvedValue({ id: 'server-spec', version: 1, data: { fetch: 'https://x.example/y.json' } });
    const spec = await loadPluginSpec('server-spec');
    expect(spec.id).toBe('server-spec');
  });

  it('falls back to the default spec on failure', async () => {
    (getJSON as jest.Mock).mockRejectedValue(new Error('network'));
    const spec = await loadPluginSpec('x', new Date('2026-07-28T15:30:00'));
    expect(spec.id).toBe('tracking-demo');
  });

  it('falls back to the default spec on an invalid payload', async () => {
    (getJSON as jest.Mock).mockResolvedValue({ id: 42 });
    const spec = await loadPluginSpec('x');
    expect(spec.id).toBe('tracking-demo');
  });
});

describe('listPlugins', () => {
  it('returns the server list', async () => {
    (getJSON as jest.Mock).mockResolvedValue({ plugins: ['tracking-demo', 'f1-2026'] });
    expect(await listPlugins()).toEqual(['tracking-demo', 'f1-2026']);
  });

  it('falls back to the default on failure', async () => {
    (getJSON as jest.Mock).mockRejectedValue(new Error('network'));
    expect(await listPlugins()).toEqual(['tracking-demo']);
  });
});

describe('resolveSpecData', () => {
  it('converts ISO dates to Date and preserves extra fields', () => {
    const { franchises, items } = resolveSpecData(f12026Spec);
    expect(franchises).toHaveLength(1);
    const monaco = items.find((i) => i.id === 'f1-6')!;
    expect(monaco.start).toBeInstanceOf(Date);
    expect((monaco as unknown as Record<string, unknown>).round).toBe(6);
  });
});
