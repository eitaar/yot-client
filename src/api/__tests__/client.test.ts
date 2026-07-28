/**
 * Client tests. The transport is injected with `setFetchImplementation`, so
 * these exercise real URL building, real envelope parsing and the real session
 * module (over mocked storage) without touching the network.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ApiError,
  MAX_EVENT_LIMIT,
  authHeaders,
  completePairing,
  deleteEvent,
  getEvent,
  imageSource,
  imageUrl,
  listAllEvents,
  listCalendars,
  listEvents,
  logout,
  normalizeBaseUrl,
  pair,
  probeHealth,
  refreshScope,
  setFetchImplementation,
  setUnauthorizedHandler,
  updateEvent,
} from '@/api/client';
import { clearSession, loadScope, loadSession, resetSessionCache, saveSession } from '@/api/session';

/** Minimal `Response` stand-in: the client only uses ok/status/text. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

/** A 200 that is not JSON at all — a captive portal or proxy interstitial. */
function htmlResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response;
}

type Call = { url: string; init?: RequestInit };

function recorder(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return handler({ url, init });
  };
  setFetchImplementation(impl);
  return calls;
}

const BASE = 'https://cal.example.com';

beforeEach(async () => {
  setUnauthorizedHandler(null);
  resetSessionCache();
  await AsyncStorage.clear();
  await clearSession();
  resetSessionCache();
});

afterEach(() => {
  setFetchImplementation(null);
});

describe('normalizeBaseUrl', () => {
  it('offers https only for a public bare host', () => {
    expect(normalizeBaseUrl('cal.example.com')).toEqual(['https://cal.example.com']);
  });

  it('never offers plain http for a public host, port or no port', () => {
    // Regression (L5): an explicit port used to be taken as "this is a LAN box",
    // so a public host with a flaky TLS probe could be retried over http — and
    // the pairing PIN would go out in cleartext.
    expect(normalizeBaseUrl('cal.example.com:8443')).toEqual(['https://cal.example.com:8443']);
    expect(normalizeBaseUrl('yot.example.co.uk:4010')).toEqual([
      'https://yot.example.co.uk:4010',
    ]);
  });

  it('still offers http for a LAN host with a port', () => {
    expect(normalizeBaseUrl('192.168.1.10:4010')).toEqual([
      'https://192.168.1.10:4010',
      'http://192.168.1.10:4010',
    ]);
    expect(normalizeBaseUrl('raspberrypi:4010')).toEqual([
      'https://raspberrypi:4010',
      'http://raspberrypi:4010',
    ]);
  });

  it('adds an http candidate for LAN and loopback hosts', () => {
    expect(normalizeBaseUrl('192.168.1.10:4010')).toEqual([
      'https://192.168.1.10:4010',
      'http://192.168.1.10:4010',
    ]);
    expect(normalizeBaseUrl('localhost')).toEqual(['https://localhost', 'http://localhost']);
    expect(normalizeBaseUrl('yot-box')).toEqual(['https://yot-box', 'http://yot-box']);
    expect(normalizeBaseUrl('mini.local')).toEqual(['https://mini.local', 'http://mini.local']);
    expect(normalizeBaseUrl('10.0.0.4')).toEqual(['https://10.0.0.4', 'http://10.0.0.4']);
  });

  it('respects an explicit scheme without guessing a second candidate', () => {
    expect(normalizeBaseUrl('http://cal.example.com')).toEqual(['http://cal.example.com']);
    expect(normalizeBaseUrl('https://192.168.1.10:4010')).toEqual(['https://192.168.1.10:4010']);
  });

  it('strips trailing slashes and a trailing /api', () => {
    expect(normalizeBaseUrl('https://cal.example.com/api/')).toEqual(['https://cal.example.com']);
    expect(normalizeBaseUrl('cal.example.com///')).toEqual(['https://cal.example.com']);
  });

  it('keeps a sub-path mount', () => {
    expect(normalizeBaseUrl('https://example.com/yot')).toEqual(['https://example.com/yot']);
  });

  it('rejects junk', () => {
    expect(normalizeBaseUrl('')).toEqual([]);
    expect(normalizeBaseUrl('   ')).toEqual([]);
    expect(normalizeBaseUrl('ftp://cal.example.com')).toEqual([]);
    expect(normalizeBaseUrl('cal example.com')).toEqual([]);
  });
});

describe('probeHealth', () => {
  it('falls through to the http candidate when https refuses', async () => {
    const calls = recorder(async ({ url }) => {
      if (url.startsWith('https://')) throw new TypeError('Network request failed');
      return jsonResponse({ status: 'ok' });
    });

    const result = await probeHealth('192.168.1.10:4010', { timeoutMs: 50 });

    expect(result).toEqual({ ok: true, baseUrl: 'http://192.168.1.10:4010' });
    expect(calls.map((c) => c.url)).toEqual([
      'https://192.168.1.10:4010/api/health',
      'http://192.168.1.10:4010/api/health',
    ]);
  });

  it('reports unreachable when no candidate answers', async () => {
    recorder(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(probeHealth('cal.example.com', { timeoutMs: 50 })).resolves.toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('treats a non-2xx /health as not-a-Yot-server', async () => {
    recorder(async () => jsonResponse({ error: { code: 'not_found', message: 'Not found' } }, 404));
    await expect(probeHealth('cal.example.com', { timeoutMs: 50 })).resolves.toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('rejects unusable input without any request', async () => {
    const calls = recorder(async () => jsonResponse({ status: 'ok' }));
    await expect(probeHealth('ftp://nope')).resolves.toEqual({
      ok: false,
      reason: 'invalid_url',
    });
    expect(calls).toHaveLength(0);
  });
});

describe('pair', () => {
  it('sends the native client body and returns the key', async () => {
    const calls = recorder(async () => jsonResponse({ ok: true, scope: 'write', key: 'cal_abc' }));

    const result = await pair(BASE, '123456', 'Pixel 9');

    expect(result).toEqual({ ok: true, scope: 'write', key: 'cal_abc' });
    expect(calls[0].url).toBe(`${BASE}/api/auth/pair`);
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      pin: '123456',
      client: 'native',
      device_name: 'Pixel 9',
    });
  });

  it('maps 401 to invalid_pin', async () => {
    recorder(async () =>
      jsonResponse({ error: { code: 'unauthorized', message: 'Invalid PIN' } }, 401),
    );
    const result = await pair(BASE, '000000');
    expect(result).toEqual({ ok: false, reason: 'invalid_pin', message: expect.any(String) });
  });

  it('maps 429 to rate_limited', async () => {
    recorder(async () =>
      jsonResponse({ error: { code: 'rate_limited', message: 'Too many attempts' } }, 429),
    );
    const result = await pair(BASE, '000000');
    expect(result).toEqual({ ok: false, reason: 'rate_limited', message: expect.any(String) });
  });

  it('does not run the 401 handler for a bad PIN', async () => {
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    recorder(async () =>
      jsonResponse({ error: { code: 'unauthorized', message: 'Invalid PIN' } }, 401),
    );

    await pair(BASE, '000000');

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('flags a web-shaped response with no key', async () => {
    recorder(async () => jsonResponse({ ok: true, scope: 'write' }));
    const result = await pair(BASE, '123456');
    expect(result).toMatchObject({ ok: false, reason: 'no_key' });
  });

  it('reports an unreachable server', async () => {
    recorder(async () => {
      throw new TypeError('Network request failed');
    });
    const result = await pair(BASE, '123456');
    expect(result).toMatchObject({ ok: false, reason: 'unreachable' });
  });
});

describe('authenticated requests', () => {
  beforeEach(async () => {
    await saveSession({ baseUrl: BASE, key: 'cal_secret' });
  });

  it('sends the Bearer header and clamps limit to the API maximum', async () => {
    const calls = recorder(async () => jsonResponse([]));

    await listEvents({ from: '2026-07-01T00:00:00.000Z', to: '2026-07-31T00:00:00.000Z', limit: 9999 });

    const { url, init } = calls[0];
    expect(url).toContain(`${BASE}/api/events?`);
    expect(url).toContain(`limit=${MAX_EVENT_LIMIT}`);
    expect(url).toContain('from=2026-07-01T00%3A00%3A00.000Z');
    expect(url).toContain('to=2026-07-31T00%3A00%3A00.000Z');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer cal_secret');
  });

  it('defaults limit to the maximum rather than the server default of 50', async () => {
    const calls = recorder(async () => jsonResponse([]));
    await listEvents();
    expect(calls[0].url).toBe(`${BASE}/api/events?limit=500`);
  });

  it('parses the error envelope into a typed ApiError', async () => {
    recorder(async () =>
      jsonResponse({ error: { code: 'not_found', message: 'Not found' } }, 404),
    );

    const error = await getEvent('missing').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'not_found', message: 'Not found', status: 404 });
  });

  it('carries validation details through', async () => {
    recorder(async () =>
      jsonResponse(
        {
          error: {
            code: 'validation_error',
            message: 'Invalid body',
            details: [{ path: ['title'], message: 'Required' }],
          },
        },
        400,
      ),
    );

    const error = (await updateEvent('e1', { title: '' }).catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe('validation_error');
    expect(error.details).toHaveLength(1);
  });

  it('invokes the unauthorized handler on a 401 from an authenticated call', async () => {
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    recorder(async () =>
      jsonResponse({ error: { code: 'unauthorized', message: 'Unauthorized' } }, 401),
    );

    await expect(getEvent('e1')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('fails closed (and notifies) when no session is stored', async () => {
    await clearSession();
    resetSessionCache();
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    const calls = recorder(async () => jsonResponse([]));

    const error = (await listEvents().catch((e: unknown) => e)) as ApiError;

    expect(error.status).toBe(401);
    expect(calls).toHaveLength(0);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('keeps null (clear) and drops undefined (leave alone) in a PATCH body', async () => {
    const calls = recorder(async () => jsonResponse({ id: 'e1' }));

    await updateEvent('e1', { title: 'New', location: null, description: undefined });

    expect(calls[0].init?.method).toBe('PATCH');
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toEqual({ title: 'New', location: null });
    expect('description' in body).toBe(false);
  });

  it('treats 204 from DELETE as success', async () => {
    recorder(async () => jsonResponse(undefined, 204));
    await expect(deleteEvent('e1')).resolves.toBeUndefined();
  });
});

describe('logout', () => {
  it('revokes the key server-side and clears local storage', async () => {
    await saveSession({ baseUrl: BASE, key: 'cal_secret' });
    const calls = recorder(async () => jsonResponse({ ok: true }));

    await logout();

    expect(calls[0].url).toBe(`${BASE}/api/auth/logout`);
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe(
      'Bearer cal_secret',
    );
    resetSessionCache();
    await expect(loadSession()).resolves.toBeNull();
  });

  it('still clears locally when the server is unreachable', async () => {
    await saveSession({ baseUrl: BASE, key: 'cal_secret' });
    recorder(async () => {
      throw new TypeError('Network request failed');
    });

    await logout();

    resetSessionCache();
    await expect(loadSession()).resolves.toBeNull();
  });
});

describe('payload shape validation (M7)', () => {
  beforeEach(async () => {
    await saveSession({ baseUrl: BASE, key: 'cal_secret' });
  });

  const PORTAL = '<!doctype html><title>Sign in to WiFi</title>';

  it('rejects a non-JSON 200 for /events instead of reading it as no events', async () => {
    recorder(async () => htmlResponse(PORTAL));

    const error = (await listEvents().catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('http_error');
    // Not a 401 (would log the user out) and not a network error (would be
    // retried silently); a real 200 whose body is wrong.
    expect(error.status).toBe(200);
    expect(error.isUnauthorized).toBe(false);
    expect(error.isNetwork).toBe(false);
  });

  it('rejects a non-JSON 200 for /calendars', async () => {
    recorder(async () => htmlResponse(PORTAL));
    await expect(listCalendars()).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects a JSON 200 of the wrong shape (object where a list is promised)', async () => {
    recorder(async () => jsonResponse({ events: [] }));
    await expect(listEvents()).rejects.toBeInstanceOf(ApiError);
  });

  it('propagates the failure out of listAllEvents rather than returning []', async () => {
    recorder(async () => htmlResponse(PORTAL));
    // The old paging loop saw a non-array, broke, and returned [] — which
    // `sync()` then persisted as the truth for the whole window.
    await expect(listAllEvents({ from: 'a', to: 'b' })).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects a non-object 200 for a single event', async () => {
    recorder(async () => htmlResponse(PORTAL));
    await expect(getEvent('evt_1')).rejects.toBeInstanceOf(ApiError);
    recorder(async () => htmlResponse(PORTAL));
    await expect(updateEvent('evt_1', { title: 'x' })).rejects.toBeInstanceOf(ApiError);
  });

  it('still accepts a legitimately empty list', async () => {
    recorder(async () => jsonResponse([]));
    await expect(listEvents()).resolves.toEqual([]);
  });
});

describe('scope persistence (M4)', () => {
  it('completePairing stores the scope the server reported', async () => {
    recorder(async () => jsonResponse({ ok: true, scope: 'read', key: 'cal_ro' }));

    const result = await completePairing(BASE, '123456');

    expect(result).toEqual({ ok: true, scope: 'read', key: 'cal_ro' });
    // Survives a cold read — the UI has to gate Edit/Delete before any request.
    resetSessionCache();
    await expect(loadScope()).resolves.toBe('read');
    await expect(loadSession()).resolves.toMatchObject({ scope: 'read' });
  });

  it('defaults to write for a session saved without one', async () => {
    await saveSession({ baseUrl: BASE, key: 'cal_secret' });
    resetSessionCache();
    await expect(loadScope()).resolves.toBe('write');
  });

  it('refreshScope adopts a downgrade from GET /auth/session', async () => {
    await saveSession({ baseUrl: BASE, key: 'cal_secret', scope: 'write' });
    recorder(async () => jsonResponse({ scope: 'read' }));

    await expect(refreshScope()).resolves.toBe('read');
    resetSessionCache();
    await expect(loadScope()).resolves.toBe('read');
  });

  it('refreshScope keeps the stored scope when the server is unreachable', async () => {
    await saveSession({ baseUrl: BASE, key: 'cal_secret', scope: 'read' });
    recorder(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(refreshScope()).resolves.toBe('read');
  });

  it('clearSession forgets the scope', async () => {
    await saveSession({ baseUrl: BASE, key: 'cal_ro', scope: 'read' });
    await clearSession();
    resetSessionCache();
    await expect(loadScope()).resolves.toBe('write');
  });
});

describe('image helpers', () => {
  it('builds an /api/img URL with no key in the query string', () => {
    const url = imageUrl(BASE, 'cover 1.jpg');
    expect(url).toBe(`${BASE}/api/img/cover%201.jpg`);
    expect(url).not.toContain('key=');
  });

  it('returns Bearer headers for expo-image, and {} without a key', () => {
    expect(authHeaders('cal_secret')).toEqual({ Authorization: 'Bearer cal_secret' });
    expect(authHeaders(null)).toEqual({});
    expect(imageSource(BASE, 'a.png', 'cal_secret')).toEqual({
      uri: `${BASE}/api/img/a.png`,
      headers: { Authorization: 'Bearer cal_secret' },
    });
  });
});
