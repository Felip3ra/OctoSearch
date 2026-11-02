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
  | { type: 'dispose'; keys: string[] };

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
}

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

  constructor(
    private readonly post: (response: ParseWorkerResponse) => void,
    private readonly options: ParseWorkerOptions = {}
  ) {}

  /** Messages are handled one at a time, in order, even when one of them awaits (gzip). */
  handle(request: ParseWorkerRequest): Promise<void> {
    this.queue = this.queue.then(() => this.process(request));
    return this.queue;
  }

  private async process(request: ParseWorkerRequest): Promise<void> {
    if (request.type === 'dispose') {
      request.keys.forEach((key) => this.sessions.delete(key));
      return;
    }
    try {
      if (request.type === 'parse') await this.parse(request);
      else this.append(request);
    } catch (error) {
      this.post({ type: 'error', requestId: request.requestId, message: (error as Error)?.message || String(error) });
    }
  }

  private async parse(request: Extract<ParseWorkerRequest, { type: 'parse' }>): Promise<void> {
    this.sessions.delete(request.key);
    let bytes: Uint8Array = new Uint8Array(request.bytes);
    if (request.gzip) bytes = await gunzip(bytes);

    const { encoding, bomLength } = detectEncoding(bytes);
    let body: Uint8Array = bytes.subarray(bomLength);
    if (request.truncated) body = skipPartialFirstLine(body, encoding);

    const decoder = new TextDecoder(encoding);
    const parser = new LogParseSession({ referenceTime: request.referenceTime });
    const text = decoder.decode(body, { stream: true });
    const { firstPartialMs = 300, partialIntervalMs = 500, chunkSize, now = Date.now } = this.options;
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
