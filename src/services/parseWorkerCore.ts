import { LogEntry } from '../types';
import { LogParseSession, textChunks } from './logParser';
import { detectEncoding, gunzip, LogEncoding, skipPartialFirstLine } from './logDecoding';

export type ParseWorkerRequest =
  | {
      type: 'parse';
      requestId: number;
      key: string;
      bytes: ArrayBuffer;
      gzip: boolean;
      /** The read starts mid-file (large file opened by its end): the first partial line is dropped. */
      truncated: boolean;
      referenceTime: number;
    }
  | { type: 'append'; requestId: number; key: string; bytes: ArrayBuffer }
  | { type: 'dispose'; keys: string[] }
  /** Stops a parse that is queued or running; nothing else is posted for it. */
  | { type: 'cancel'; requestId: number };

export type ParseWorkerResponse =
  | { type: 'progress'; requestId: number; progress: number }
  /**
   * Records parsed so far while a large file is still being read, so the UI can show them early.
   * Same delta semantics as a result: entries before `fromIndex` are unchanged, the rest replace them.
   */
  | { type: 'partial'; requestId: number; fromIndex: number; entries: LogEntry[]; totalLines: number }
  | {
      type: 'result';
      requestId: number;
      fromIndex: number;
      entries: LogEntry[];
      totalLines: number;
      formatRecognized: boolean;
      encoding: LogEncoding;
      canAppend: boolean;
    }
  /** The file cannot be continued incrementally and must be read again in full. */
  | { type: 'reset'; requestId: number }
  | { type: 'error'; requestId: number; message: string };

export interface ParseWorkerOptions {
  /** Time before the first partial result, and between the next ones (ms). */
  firstPartialMs?: number;
  partialIntervalMs?: number;
  chunkSize?: number;
  now?: () => number;
  /** Lets waiting messages (a cancel) be delivered between two chunks of a long parse. */
  yieldToMessages?: () => Promise<void>;
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

interface Session {
  parser: LogParseSession;
  decoder: TextDecoder;
  encoding: LogEncoding;
}

/**
 * Parsing state kept off the UI thread. Sessions survive between messages so the live tail only
 * decodes and parses the bytes appended since the previous read.
 */
export class ParseWorkerCore {
  private sessions = new Map<string, Session>();
  private queue: Promise<void> = Promise.resolve();
  /** Requests queued or running, and the ones among them that were cancelled. */
  private active = new Set<number>();
  private cancelled = new Set<number>();

  constructor(
    private readonly post: (response: ParseWorkerResponse) => void,
    private readonly options: ParseWorkerOptions = {}
  ) {}

  /**
   * Messages are handled one at a time, in order, even when one of them awaits (gzip).
   * A cancel skips the line: it marks its request, which stops at the next chunk (or never starts).
   */
  handle(request: ParseWorkerRequest): Promise<void> {
    if (request.type === 'cancel') {
      if (this.active.has(request.requestId)) this.cancelled.add(request.requestId);
      return Promise.resolve();
    }
    if (request.type !== 'dispose') this.active.add(request.requestId);
    this.queue = this.queue.then(() => this.process(request));
    return this.queue;
  }

  private async process(request: Exclude<ParseWorkerRequest, { type: 'cancel' }>): Promise<void> {
    if (request.type === 'dispose') {
      request.keys.forEach((key) => this.sessions.delete(key));
      return;
    }
    const { requestId } = request;
    try {
      if (this.cancelled.has(requestId)) return;
      if (request.type === 'parse') await this.parse(request);
      else this.append(request);
    } catch (error) {
      if (!this.cancelled.has(requestId)) {
        this.post({ type: 'error', requestId, message: (error as Error)?.message || String(error) });
      }
    } finally {
      this.active.delete(requestId);
      this.cancelled.delete(requestId);
    }
  }

  private async parse(request: Extract<ParseWorkerRequest, { type: 'parse' }>): Promise<void> {
    this.sessions.delete(request.key);
    let bytes: Uint8Array = new Uint8Array(request.bytes);
    if (request.gzip) bytes = await gunzip(bytes);
    if (this.cancelled.has(request.requestId)) return;

    const { encoding, bomLength } = detectEncoding(bytes);
    let body: Uint8Array = bytes.subarray(bomLength);
    if (request.truncated) body = skipPartialFirstLine(body, encoding);

    const decoder = new TextDecoder(encoding);
    const parser = new LogParseSession({ referenceTime: request.referenceTime });
    const text = decoder.decode(body, { stream: true });
    const { firstPartialMs = 300, partialIntervalMs = 500, chunkSize, now = Date.now, yieldToMessages = yieldToEventLoop } = this.options;
    let processed = 0;
    let lastProgress = -1;
    let nextPartialAt = now() + firstPartialMs;
    for (const chunk of textChunks(text, chunkSize)) {
      parser.push(chunk);
      processed += chunk.length;
      if (processed >= text.length) break;
      const progress = Math.min(99, Math.round((processed / text.length) * 100));
      if (progress !== lastProgress) {
        lastProgress = progress;
        this.post({ type: 'progress', requestId: request.requestId, progress });
      }
      // Partial results only for dated, recognized logs: time-only logs are anchored to a day
      // when the file ends, and unrecognized ones are re-split line by line at the end.
      if (parser.canAppend && now() >= nextPartialAt) {
        nextPartialAt = now() + partialIntervalMs;
        const { fromIndex, entries, totalLines } = parser.snapshot();
        this.post({ type: 'partial', requestId: request.requestId, fromIndex, entries, totalLines });
      }
      await yieldToMessages();
      if (this.cancelled.has(request.requestId)) return;
    }

    const snapshot = parser.snapshot();
    const canAppend = parser.canAppend && !request.gzip;
    if (canAppend) this.sessions.set(request.key, { parser, decoder, encoding });
    this.post({ type: 'result', requestId: request.requestId, ...snapshot, encoding, canAppend });
  }

  private append(request: Extract<ParseWorkerRequest, { type: 'append' }>): void {
    const session = this.sessions.get(request.key);
    if (!session || !session.parser.canAppend) {
      this.sessions.delete(request.key);
      this.post({ type: 'reset', requestId: request.requestId });
      return;
    }
    session.parser.push(session.decoder.decode(new Uint8Array(request.bytes), { stream: true }));
    const snapshot = session.parser.snapshot();
    if (!session.parser.canAppend) {
      // A time-only line showed up in a dated log: fall back to a full read.
      this.sessions.delete(request.key);
      this.post({ type: 'reset', requestId: request.requestId });
      return;
    }
    this.post({ type: 'result', requestId: request.requestId, ...snapshot, encoding: session.encoding, canAppend: true });
  }
}
