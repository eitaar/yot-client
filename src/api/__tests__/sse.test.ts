jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

import {
  SseParser,
  isServerEventType,
  parseFrameBlock,
  parseFrameData,
  resolveTransport,
  sseSupported,
  sseTransport,
} from '@/api/sse';

describe('SseParser', () => {
  it('emits a frame once its blank line arrives', () => {
    const parser = new SseParser();
    expect(parser.push('event: event.created\ndata: {"id":"e1"}')).toEqual([]);
    expect(parser.push('\n\n')).toEqual([
      { event: 'event.created', data: '{"id":"e1"}', id: undefined, retry: undefined },
    ]);
  });

  it('reassembles a frame split mid-token across chunks', () => {
    const parser = new SseParser();
    parser.push('event: event.up');
    parser.push('dated\ndata: {"id":');
    const frames = parser.push('"e2"}\n\n');
    expect(frames).toHaveLength(1);
    expect(frames[0].event).toBe('event.updated');
    expect(JSON.parse(frames[0].data)).toEqual({ id: 'e2' });
  });

  it('handles several frames in one chunk', () => {
    const parser = new SseParser();
    const frames = parser.push(
      'event: ready\ndata: connected\n\nevent: ping\ndata: 1760000000000\n\n',
    );
    expect(frames.map((f) => f.event)).toEqual(['ready', 'ping']);
  });

  it('ignores the padding comments the server sends to defeat proxy buffering', () => {
    const parser = new SseParser();
    const frames = parser.push(`${':'.padEnd(64, 'x')}\n\nevent: ping\ndata: 1\n\n`);
    expect(frames.map((f) => f.event)).toEqual(['ping']);
  });

  it('normalises CRLF line endings', () => {
    const parser = new SseParser();
    const frames = parser.push('event: event.deleted\r\ndata: {"id":"e3"}\r\n\r\n');
    expect(frames).toHaveLength(1);
    expect(frames[0].event).toBe('event.deleted');
  });

  it('joins multi-line data with newlines', () => {
    const frame = parseFrameBlock('event: x\ndata: line one\ndata: line two');
    expect(frame?.data).toBe('line one\nline two');
  });

  it('defaults the event name to "message" and reads id/retry', () => {
    const frame = parseFrameBlock('data: hi\nid: 7\nretry: 5000');
    expect(frame).toEqual({ event: 'message', data: 'hi', id: '7', retry: 5000 });
  });

  it('drops a block with nothing in it', () => {
    expect(parseFrameBlock(': just a comment')).toBeNull();
  });

  it('forgets a partial frame on reset', () => {
    const parser = new SseParser();
    parser.push('event: event.created\ndata: {"id"');
    parser.reset();
    expect(parser.push(':"e9"}\n\n')).toEqual([]);
  });
});

describe('parseFrameData', () => {
  it('parses JSON payloads', () => {
    expect(parseFrameData('{"id":"e1","title":"x"}')).toEqual({ id: 'e1', title: 'x' });
  });

  it('passes through the bare strings used by ready and ping', () => {
    expect(parseFrameData('connected')).toBe('connected');
    expect(parseFrameData('1760000000000')).toBe(1760000000000);
    expect(parseFrameData('')).toBeUndefined();
  });
});

describe('event type guard', () => {
  it('accepts the documented change types and rejects the rest', () => {
    expect(isServerEventType('event.created')).toBe(true);
    expect(isServerEventType('calendar.deleted')).toBe(true);
    expect(isServerEventType('tag.updated')).toBe(true);
    expect(isServerEventType('ready')).toBe(false);
    expect(isServerEventType('ping')).toBe(false);
    expect(isServerEventType('event.exploded')).toBe(false);
  });
});

describe('transport selection', () => {
  const rn = { hasXhr: true, hasFetchStreams: false };
  const browser = { hasXhr: true, hasFetchStreams: true };

  it('uses XHR on native — RN fetch cannot stream and never settles', () => {
    expect(resolveTransport('ios', rn)).toBe('xhr');
    expect(resolveTransport('android', rn)).toBe('xhr');
  });

  it('uses fetch streams on web, where headers and streaming both work', () => {
    expect(resolveTransport('web', browser)).toBe('fetch');
  });

  it('falls back to XHR on a web runtime without streams', () => {
    expect(resolveTransport('web', { hasXhr: true, hasFetchStreams: false })).toBe('xhr');
  });

  it('reports no transport when the runtime has neither', () => {
    expect(resolveTransport('ios', { hasXhr: false, hasFetchStreams: false })).toBeNull();
  });

  it('exposes a capability flag the app can gate SSE on', () => {
    expect(sseSupported).toBe(sseTransport !== null);
  });
});
