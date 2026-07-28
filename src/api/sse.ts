/**
 * Realtime updates: `GET /api/stream` (§3.8) with a Bearer header.
 *
 * ## Why not `EventSource`, and why not `fetch` on native
 *
 * The browser `EventSource` cannot send headers, and the `?key=` fallback the
 * server offers for it is exactly what the README tells native clients not to
 * do (keys leaking into proxy logs). So the stream is read by hand.
 *
 * Two transports, picked at runtime:
 *
 * - **fetch-stream** (web): `response.body.getReader()`, headers included.
 * - **xhr** (native): React Native's `fetch` is whatwg-fetch over XHR — there
 *   is no `response.body`, and the promise only settles when the request
 *   *ends*, which for an infinite stream is never. RN's `XMLHttpRequest`,
 *   however, exposes `responseText` progressively at `readyState === LOADING`,
 *   so the stream is sliced from there. (This is what `react-native-sse` does;
 *   ~80 lines is not worth a dependency.)
 *
 * Frames arrive as `event: <type>` / `data: <json>`. `ready` (once) and `ping`
 * (every 25s) exist only to keep the connection warm and prove liveness.
 */

import { Platform } from 'react-native';
import { loadSession } from './session';
import type { Calendar, DeletedPayload, Tag, YotEvent } from './types';

/* -------------------------------------------------------------------- types */

export type ServerEventType =
  | 'event.created'
  | 'event.updated'
  | 'event.deleted'
  | 'calendar.created'
  | 'calendar.updated'
  | 'calendar.deleted'
  | 'tag.created'
  | 'tag.updated'
  | 'tag.deleted';

/** Payload shape per event type, so `applyServerEvent` can discriminate. */
export interface ServerEventPayloads {
  'event.created': YotEvent;
  'event.updated': YotEvent;
  'event.deleted': DeletedPayload;
  'calendar.created': Calendar;
  'calendar.updated': Calendar;
  'calendar.deleted': DeletedPayload;
  'tag.created': Tag;
  'tag.updated': Tag;
  'tag.deleted': DeletedPayload;
}

const SERVER_EVENT_TYPES = new Set<string>([
  'event.created',
  'event.updated',
  'event.deleted',
  'calendar.created',
  'calendar.updated',
  'calendar.deleted',
  'tag.created',
  'tag.updated',
  'tag.deleted',
]);

export function isServerEventType(value: string): value is ServerEventType {
  return SERVER_EVENT_TYPES.has(value);
}

/** A parsed SSE frame. `event` defaults to `'message'` per the SSE spec. */
export interface SseFrame {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

export type StreamStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface StreamOptions {
  /** Defaults to the stored session's base URL. */
  baseUrl?: string;
  /** Defaults to the stored session's key. */
  key?: string;
  /** Every recognised change frame. `ready` / `ping` never reach here. */
  onEvent?: <T extends ServerEventType>(type: T, payload: ServerEventPayloads[T]) => void;
  /** Connection state changes, for a "live" dot in the UI. */
  onStatus?: (status: StreamStatus) => void;
  /** Heartbeat (`ready` on connect, `ping` every ~25s) — proof of liveness. */
  onHeartbeat?: (kind: 'ready' | 'ping', raw: string) => void;
  /** Transport or protocol failure. The subscription reconnects regardless. */
  onError?: (error: Error) => void;
  /**
   * Called on a 401. The stream stops retrying — a revoked key will not fix
   * itself, and hammering the server every 30s would be rude.
   */
  onUnauthorized?: () => void;
  /** First retry delay. Doubles up to {@link StreamOptions.maxBackoffMs}. */
  minBackoffMs?: number;
  maxBackoffMs?: number;
  /** Force a transport; `'auto'` (default) picks per platform. */
  transport?: 'auto' | 'fetch' | 'xhr';
}

export interface StreamSubscription {
  /** Tear down: aborts the request and cancels any pending retry. */
  close: () => void;
  readonly status: StreamStatus;
}

/* ------------------------------------------------------------------ parsing */

/**
 * Incremental SSE frame parser. Feed it whatever arrives; it holds a partial
 * frame across chunk boundaries and emits only complete ones.
 */
export class SseParser {
  private buffer = '';

  /** Push a chunk of the response body; returns the frames it completed. */
  push(chunk: string): SseFrame[] {
    // Normalise CRLF / CR line endings so the split below is single-form.
    this.buffer += chunk.replace(/\r\n|\r/g, '\n');

    const frames: SseFrame[] = [];
    let boundary = this.buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const frame = parseFrameBlock(block);
      if (frame) frames.push(frame);
      boundary = this.buffer.indexOf('\n\n');
    }
    return frames;
  }

  /** Drop any partial frame (used when a connection dies mid-frame). */
  reset(): void {
    this.buffer = '';
  }
}

/** One `\n\n`-delimited block -> a frame, or `null` if it carried no data. */
export function parseFrameBlock(block: string): SseFrame | null {
  let event: string | undefined;
  let id: string | undefined;
  let retry: number | undefined;
  const dataLines: string[] = [];
  let sawData = false;

  for (const line of block.split('\n')) {
    // The server sends ~2KB of `:` padding on connect to defeat proxy
    // buffering; comments are ignored, as are blank lines.
    if (line === '' || line.startsWith(':')) continue;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    switch (field) {
      case 'event':
        event = value;
        break;
      case 'data':
        dataLines.push(value);
        sawData = true;
        break;
      case 'id':
        id = value;
        break;
      case 'retry': {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isNaN(parsed)) retry = parsed;
        break;
      }
      default:
        break;
    }
  }

  if (!sawData && event === undefined && retry === undefined) return null;
  return { event: event ?? 'message', data: dataLines.join('\n'), id, retry };
}

/** `data:` is JSON for change frames and a bare string for `ping`/`ready`. */
export function parseFrameData(data: string): unknown {
  if (data === '') return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

/* --------------------------------------------------------------- capability */

export interface TransportCapabilities {
  hasXhr: boolean;
  hasFetchStreams: boolean;
}

/** What this runtime actually offers. */
export function detectCapabilities(): TransportCapabilities {
  return {
    hasXhr: typeof XMLHttpRequest !== 'undefined',
    hasFetchStreams:
      typeof Response !== 'undefined' &&
      typeof ReadableStream !== 'undefined' &&
      // whatwg-fetch (RN) defines Response *without* a streaming body.
      Object.prototype.hasOwnProperty.call(Response.prototype, 'body'),
  };
}

/**
 * Web prefers real streams; native prefers XHR, because RN's `fetch` cannot
 * stream and its promise would never settle on an open connection. Either
 * platform falls back to whatever else exists.
 */
export function resolveTransport(
  platformOS: string,
  caps: TransportCapabilities,
): 'fetch' | 'xhr' | null {
  if (platformOS === 'web') {
    if (caps.hasFetchStreams) return 'fetch';
    return caps.hasXhr ? 'xhr' : null;
  }
  if (caps.hasXhr) return 'xhr';
  return caps.hasFetchStreams ? 'fetch' : null;
}

/** Which transport `'auto'` resolves to here. `null` = SSE is impossible. */
export const sseTransport: 'fetch' | 'xhr' | null = resolveTransport(
  Platform.OS,
  detectCapabilities(),
);

/**
 * Whether this platform can stream with a Bearer header at all. Both RN and
 * modern browsers can, so this is `true` in practice — but the app should
 * still check it and fall back to pull-to-sync rather than assume.
 */
export const sseSupported = sseTransport !== null;

/* -------------------------------------------------------------- transports */

/**
 * How much `responseText` the XHR transport tolerates before recycling the
 * connection. 4 MB is roughly a fortnight of 25-second pings plus a busy
 * calendar's frames, and small enough that no device notices holding it.
 */
export const XHR_BUFFER_LIMIT = 4 * 1024 * 1024;

/**
 * The XHR transport reads the stream out of `xhr.responseText`, which is the
 * *entire* response so far — it only ever grows. Slicing from an offset keeps
 * the parser correct but the string itself is retained by the XHR object for as
 * long as the request is open, so a stream left running for days is an
 * unbounded leak. Nothing else reclaims it: the fix is to hang up and let the
 * normal reconnect open a fresh request with an empty buffer.
 */
export function shouldRecycleStream(
  bufferedChars: number,
  limit: number = XHR_BUFFER_LIMIT,
): boolean {
  return bufferedChars >= limit;
}

/**
 * Marks a close that the client asked for to reclaim memory, not a failure.
 * The subscription reconnects immediately at the base delay instead of backing
 * off — there is nothing wrong with the server.
 */
export class StreamRecycledError extends Error {
  constructor(bufferedChars: number) {
    super(`Stream recycled after ${bufferedChars} buffered characters`);
    this.name = 'StreamRecycledError';
    Object.setPrototypeOf(this, StreamRecycledError.prototype);
  }
}

interface TransportCallbacks {
  onOpen: () => void;
  onChunk: (text: string) => void;
  /** Terminal: `status` is the HTTP status when one was received, else 0. */
  onClose: (status: number, error?: Error) => void;
}

interface TransportHandle {
  abort: () => void;
}

function connectViaXhr(
  url: string,
  headers: Record<string, string>,
  cb: TransportCallbacks,
  bufferLimit: number = XHR_BUFFER_LIMIT,
): TransportHandle {
  const xhr = new XMLHttpRequest();
  let offset = 0;
  let opened = false;
  let finished = false;

  const finish = (status: number, error?: Error) => {
    if (finished) return;
    finished = true;
    cb.onClose(status, error);
  };

  const abort = () => {
    try {
      xhr.abort();
    } catch {
      // Already dead.
    }
  };

  xhr.open('GET', url, true);
  for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
  // Ask RN/browsers not to buffer or transform the body.
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.setRequestHeader('Cache-Control', 'no-cache');

  xhr.onreadystatechange = () => {
    if (finished) return;
    if (xhr.readyState === 3 /* LOADING */ || xhr.readyState === 4 /* DONE */) {
      if (xhr.status !== 200) {
        if (xhr.readyState === 4) finish(xhr.status);
        return;
      }
      if (!opened) {
        opened = true;
        cb.onOpen();
      }
      const text = xhr.responseText ?? '';
      if (text.length > offset) {
        const chunk = text.slice(offset);
        offset = text.length;
        cb.onChunk(chunk);
      }
      if (xhr.readyState === 4) {
        finish(xhr.status, new Error('Stream ended'));
        return;
      }
      // Deliver the chunk first, then recycle — no frame is dropped, and the
      // reconnect starts from a clean buffer.
      if (shouldRecycleStream(text.length, bufferLimit)) {
        finish(200, new StreamRecycledError(text.length));
        abort();
      }
    }
  };
  xhr.onerror = () => finish(xhr.status ?? 0, new Error('Stream transport error'));
  xhr.ontimeout = () => finish(0, new Error('Stream timed out'));
  xhr.onabort = () => {
    finished = true;
  };

  try {
    xhr.send();
  } catch (error) {
    finish(0, error instanceof Error ? error : new Error('Stream failed to start'));
  }

  return {
    abort: () => {
      finished = true;
      abort();
    },
  };
}

function connectViaFetch(
  url: string,
  headers: Record<string, string>,
  cb: TransportCallbacks,
): TransportHandle {
  const controller = new AbortController();
  let finished = false;

  const finish = (status: number, error?: Error) => {
    if (finished) return;
    finished = true;
    cb.onClose(status, error);
  };

  void (async () => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { ...headers, Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
        signal: controller.signal,
      });

      if (!response.ok) {
        finish(response.status);
        return;
      }
      const body = response.body;
      if (!body || typeof body.getReader !== 'function') {
        finish(0, new Error('Streaming responses are unavailable'));
        return;
      }

      cb.onOpen();
      const reader = body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) cb.onChunk(decoder.decode(value, { stream: true }));
      }
      finish(200, new Error('Stream ended'));
    } catch (error) {
      if (controller.signal.aborted) {
        finished = true;
        return;
      }
      finish(0, error instanceof Error ? error : new Error('Stream transport error'));
    }
  })();

  return {
    abort: () => {
      finished = true;
      controller.abort();
    },
  };
}

/* ------------------------------------------------------------ subscription */

const DEFAULT_MIN_BACKOFF_MS = 2000;
const DEFAULT_MAX_BACKOFF_MS = 30000;

/**
 * Open the stream and keep it open.
 *
 * Returns immediately; the session lookup and the connection happen in the
 * background. Reconnects with capped exponential backoff (2s → 30s, ±20%
 * jitter so several clients don't retry in lockstep), resetting the delay once
 * a connection produces a frame. A 401 stops the loop for good.
 */
export function subscribeToStream(options: StreamOptions = {}): StreamSubscription {
  const {
    onEvent,
    onStatus,
    onHeartbeat,
    onError,
    onUnauthorized,
    minBackoffMs = DEFAULT_MIN_BACKOFF_MS,
    maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
    transport = 'auto',
  } = options;

  const parser = new SseParser();
  let status: StreamStatus = 'idle';
  let closed = false;
  let attempt = 0;
  let handle: TransportHandle | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const setStatus = (next: StreamStatus) => {
    if (status === next) return;
    status = next;
    onStatus?.(next);
  };

  const backoffFor = (n: number): number => {
    const base = Math.min(maxBackoffMs, minBackoffMs * 2 ** Math.max(0, n - 1));
    const jitter = base * 0.2 * (Math.random() * 2 - 1);
    return Math.max(minBackoffMs / 2, Math.round(base + jitter));
  };

  const handleFrame = (frame: SseFrame) => {
    if (frame.event === 'ready' || frame.event === 'ping') {
      // Liveness only. `ready` also confirms the connection is genuinely up,
      // so it is the right moment to forgive earlier failures.
      attempt = 0;
      setStatus('open');
      onHeartbeat?.(frame.event, frame.data);
      return;
    }
    if (!isServerEventType(frame.event)) return;

    const payload = parseFrameData(frame.data);
    if (payload === undefined || typeof payload !== 'object' || payload === null) return;
    attempt = 0;
    onEvent?.(frame.event, payload as ServerEventPayloads[ServerEventType]);
  };

  const scheduleRetry = () => {
    if (closed) return;
    attempt += 1;
    setStatus('reconnecting');
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, backoffFor(attempt));
  };

  const connect = async () => {
    if (closed) return;

    let baseUrl = options.baseUrl;
    let key = options.key;
    if (!baseUrl || !key) {
      const session = await loadSession();
      if (!session) {
        // Nothing to connect with; a later pairing will re-subscribe.
        setStatus('closed');
        closed = true;
        return;
      }
      baseUrl = baseUrl ?? session.baseUrl;
      key = key ?? session.key;
    }
    if (closed) return;

    const chosen = transport === 'auto' ? sseTransport : transport;
    if (!chosen) {
      setStatus('closed');
      closed = true;
      onError?.(new Error('SSE is not supported on this platform'));
      return;
    }

    parser.reset();
    setStatus('connecting');

    const url = `${baseUrl.replace(/\/+$/, '')}/api/stream`;
    const headers = { Authorization: `Bearer ${key}` };
    const callbacks: TransportCallbacks = {
      onOpen: () => setStatus('open'),
      onChunk: (text) => {
        for (const frame of parser.push(text)) handleFrame(frame);
      },
      onClose: (httpStatus, error) => {
        handle = null;
        if (closed) return;
        if (httpStatus === 401 || httpStatus === 403) {
          closed = true;
          setStatus('closed');
          onUnauthorized?.();
          onError?.(new Error(`Stream rejected (${httpStatus})`));
          return;
        }
        // A recycle is housekeeping, not a fault: forgive the attempt count so
        // the reconnect happens at the base delay instead of a grown backoff.
        if (error instanceof StreamRecycledError) attempt = 0;
        if (error) onError?.(error);
        scheduleRetry();
      },
    };

    handle = chosen === 'fetch'
      ? connectViaFetch(url, headers, callbacks)
      : connectViaXhr(url, headers, callbacks);
  };

  void connect();

  return {
    close: () => {
      closed = true;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      handle?.abort();
      handle = null;
      setStatus('closed');
    },
    get status() {
      return status;
    },
  };
}
