/**
 * Settings store tests: defaults, updates, persistence round-trip, and the
 * Auto/Manual time-zone resolution.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SETTINGS_STORAGE_KEY,
  defaultSettings,
  deviceTimeZone,
  selectTimeZone,
  useSettings,
} from '@/store/settings';

beforeEach(async () => {
  await AsyncStorage.clear();
  useSettings.getState().reset();
});

describe('defaults', () => {
  it('matches the design spec: Mon, 12h, Auto tz, calendar view, dynamic feed', () => {
    const s = useSettings.getState();
    expect(s.weekStart).toBe('Mon');
    expect(s.timeFormat).toBe('12h');
    expect(s.tzMode).toBe('Auto');
    expect(s.defaultView).toBe('calendar');
    expect(s.feedLayout).toBe('dynamic');
    expect(s.autoSuggest).toBe(true);
    expect(s.smartNotifs).toBe(false);
    expect(s.onboarded).toBe(false);
    expect(s.serverUrl).toBeNull();
  });
});

describe('updates', () => {
  it('setters change exactly their field', () => {
    useSettings.getState().setWeekStart('Sun');
    useSettings.getState().setTimeFormat('24h');
    useSettings.getState().setFeedLayout('mosaic');
    const s = useSettings.getState();
    expect(s.weekStart).toBe('Sun');
    expect(s.timeFormat).toBe('24h');
    expect(s.feedLayout).toBe('mosaic');
    expect(s.defaultView).toBe('calendar'); // untouched
  });

  it('update() applies a bulk patch (pairing writes server + onboarded)', () => {
    useSettings.getState().update({ serverUrl: 'https://cal.example.com', onboarded: true });
    expect(useSettings.getState().serverUrl).toBe('https://cal.example.com');
    expect(useSettings.getState().onboarded).toBe(true);
  });

  it('reset() returns to defaults but stays hydrated (Disconnect flow)', () => {
    useSettings.getState().update({ onboarded: true, serverUrl: 'x', weekStart: 'Sun' });
    useSettings.getState().reset();
    const s = useSettings.getState();
    expect(s.onboarded).toBe(false);
    expect(s.serverUrl).toBeNull();
    expect(s.weekStart).toBe('Mon');
    expect(s.hydrated).toBe(true);
  });
});

describe('persistence', () => {
  it('writes to AsyncStorage and rehydrates on a fresh launch', async () => {
    useSettings.getState().update({ weekStart: 'Sun', feedLayout: 'stories', onboarded: true });
    await new Promise((resolve) => setTimeout(resolve, 0)); // let persist flush

    const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state).toMatchObject({ weekStart: 'Sun', feedLayout: 'stories' });
    // `hydrated` is runtime-only and must not be persisted.
    expect('hydrated' in JSON.parse(raw!).state).toBe(false);

    // Fresh launch. Blanking via setState also re-persists the blank state,
    // so put the captured snapshot back before rehydrating.
    useSettings.setState({ ...defaultSettings });
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, raw!);
    await useSettings.persist.rehydrate();

    const s = useSettings.getState();
    expect(s.weekStart).toBe('Sun');
    expect(s.feedLayout).toBe('stories');
    expect(s.onboarded).toBe(true);
    expect(s.hydrated).toBe(true);
  });
});

describe('time zone resolution', () => {
  it('Auto mode follows the device zone', () => {
    useSettings.getState().setTimeZone('Asia/Tokyo');
    useSettings.getState().setTzMode('Auto');
    expect(selectTimeZone(useSettings.getState())).toBe(deviceTimeZone());
  });

  it('Manual mode pins the chosen zone', () => {
    useSettings.getState().setTzMode('Manual');
    useSettings.getState().setTimeZone('Asia/Tokyo');
    expect(selectTimeZone(useSettings.getState())).toBe('Asia/Tokyo');
  });
});
