jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { act } from '@testing-library/react-native';
import { usePlugins } from '@/store/plugins';

const F1 = { id: 'f1-2026', title: 'F1 2026', description: 'F1 season', version: 1 };
const TRACK = { id: 'tracking-demo', title: 'Tracking', description: 'Demo', version: 1 };

describe('usePlugins', () => {
  beforeEach(() => {
    act(() => {
      usePlugins.setState({ added: [], activeId: null, activeTitle: null });
    });
  });

  it('adds a plugin (dedupes by id)', () => {
    act(() => {
      usePlugins.getState().add(F1);
      usePlugins.getState().add(F1);
    });
    expect(usePlugins.getState().added).toEqual([F1]);
  });

  it('removes a plugin and clears active if it was active', () => {
    act(() => {
      usePlugins.setState({ added: [F1], activeId: 'f1-2026', activeTitle: 'F1 2026' });
      usePlugins.getState().remove('f1-2026');
    });
    expect(usePlugins.getState().added).toEqual([]);
    expect(usePlugins.getState().activeId).toBeNull();
    expect(usePlugins.getState().activeTitle).toBeNull();
  });

  it('keeps active when removing a different plugin', () => {
    act(() => {
      usePlugins.setState({ added: [F1, TRACK], activeId: 'f1-2026', activeTitle: 'F1 2026' });
      usePlugins.getState().remove('tracking-demo');
    });
    expect(usePlugins.getState().activeId).toBe('f1-2026');
    expect(usePlugins.getState().added).toEqual([F1]);
  });

  it('sets the active plugin', () => {
    act(() => {
      usePlugins.getState().setActive('f1-2026', 'F1 2026');
    });
    expect(usePlugins.getState().activeId).toBe('f1-2026');
    expect(usePlugins.getState().activeTitle).toBe('F1 2026');
  });
});
