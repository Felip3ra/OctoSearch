import ParserWorker from '../workers/logParser.worker.ts?worker&inline';
import { LogEntry } from '../types';
import { LogEncoding } from './logDecoding';
import { ParseWorkerRequest, ParseWorkerResponse } from './parseWorkerCore';

export interface WorkerParseResult {
  fromIndex: number;
  entries: LogEntry[];
  totalLines: number;
  formatRecognized: boolean;
  encoding: LogEncoding;
  canAppend: boolean;
}

interface Pending {
  resolve: (result: WorkerParseResult | null) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: number) => void;
  onPartial?: (entries: LogEntry[]) => void;
  /** Records received in partial results; the final result continues this timeline. */
  received?: LogEntry[];
}

/** Applies a delta (unchanged records before `fromIndex`) with a single copy of the kept part. */
function applyDelta(current: LogEntry[], fromIndex: number, entries: LogEntry[]): LogEntry[] {
  const next = current.slice(0, fromIndex);
  for (const entry of entries) next.push(entry);
  return next;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, Pending>();

/**
 * Strings arrive from the worker as separate copies; the few distinct levels are shared by all
 * records instead (millions of "INF"s are tens of MB).
 */
const sharedLevels = new Map<string, string>();
function shareLevelStrings(entries: LogEntry[]): void {
  for (const entry of entries) {
    let level = sharedLevels.get(entry.level);
    if (level === undefined) sharedLevels.set(entry.level, (level = entry.level));
    entry.level = level as LogEntry['level'];
    let rawLevel = sharedLevels.get(entry.rawLevel);
    if (rawLevel === undefined) sharedLevels.set(entry.rawLevel, (rawLevel = entry.rawLevel));
    entry.rawLevel = rawLevel;
  }
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new ParserWorker();
  worker.onmessage = (event: MessageEvent<ParseWorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.requestId);
    if (!request) return;
    if (response.type === 'progress') {
      request.onProgress?.(response.progress);
      return;
    }
    if (response.type === 'partial') {
      shareLevelStrings(response.entries);
      request.received = applyDelta(request.received ?? [], response.fromIndex, response.entries);
      request.onPartial?.(request.received);
      return;
    }
    pending.delete(response.requestId);
    if (response.type === 'error') request.reject(new Error(response.message));
    else if (response.type === 'reset') request.resolve(null);
    else {
      const { type: _type, requestId: _requestId, ...result } = response;
      shareLevelStrings(result.entries);
      if (request.received) {
        result.entries = applyDelta(request.received, result.fromIndex, result.entries);
        result.fromIndex = 0;
      }
      request.resolve(result);
    }
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Falha no processamento do log.');
    pending.forEach((request) => request.reject(error));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** Copies the bytes into a standalone buffer that can be transferred to the worker without cloning. */
function toTransferable(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer;
  }
  return bytes.slice().buffer as ArrayBuffer;
}

type WithoutRequestId<T> = T extends unknown ? Omit<T, 'requestId'> : never;

function send(
  request: WithoutRequestId<Exclude<ParseWorkerRequest, { type: 'dispose' }>>,
  onProgress?: (progress: number) => void,
  onPartial?: (entries: LogEntry[]) => void
): Promise<WorkerParseResult | null> {
  const requestId = nextRequestId++;
  const message = { ...request, requestId } as ParseWorkerRequest & { requestId: number; bytes: ArrayBuffer };
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject, onProgress, onPartial });
    getWorker().postMessage(message, [message.bytes]);
  });
}

/** Parses a whole file; `onPartial` receives the records parsed so far while a large file is read. */
export function parseInWorker(
  key: string,
  bytes: Uint8Array,
  options: { gzip: boolean; truncated: boolean; referenceTime: number },
  onProgress?: (progress: number) => void,
  onPartial?: (entries: LogEntry[]) => void
): Promise<WorkerParseResult> {
  return send({ type: 'parse', key, bytes: toTransferable(bytes), ...options }, onProgress, onPartial) as Promise<WorkerParseResult>;
}

/** Continues a parsed file with the bytes appended to it; null means it must be parsed again in full. */
export function appendInWorker(key: string, bytes: Uint8Array): Promise<WorkerParseResult | null> {
  return send({ type: 'append', key, bytes: toTransferable(bytes) });
}

export function disposeWorkerSessions(keys: string[]): void {
  if (worker && keys.length > 0) worker.postMessage({ type: 'dispose', keys } satisfies ParseWorkerRequest);
}
