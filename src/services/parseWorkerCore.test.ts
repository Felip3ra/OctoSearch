import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ParseWorkerCore, ParseWorkerResponse } from './parseWorkerCore';
import { entryMessage } from './logEntry';

function createCore() {
  const responses: ParseWorkerResponse[] = [];
  const core = new ParseWorkerCore((response) => responses.push(response));
  const last = () => responses.at(-1)!;
  return { core, responses, last };
}

const bytesOf = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const parseRequest = (text: string | ArrayBuffer, extra: Partial<{ gzip: boolean; truncated: boolean; key: string }> = {}) => ({
  type: 'parse' as const,
  requestId: 1,
  key: extra.key ?? 'a',
  bytes: typeof text === 'string' ? bytesOf(text) : text,
  gzip: extra.gzip ?? false,
  truncated: extra.truncated ?? false,
  referenceTime: Date.now(),
});

describe('ParseWorkerCore', () => {
  it('parses and then continues with appended bytes only', async () => {
    const { core, last } = createCore();
    await core.handle(parseRequest('2026-10-06 10:00:00 [INF] um\n2026-10-06 10:00:01 [ERR] dois\n'));
    const first = last();
    expect(first).toMatchObject({ type: 'result', fromIndex: 0, canAppend: true, encoding: 'utf-8' });
    expect(first.type === 'result' && first.entries.map(entryMessage)).toEqual(['um', 'dois']);

    await core.handle({ type: 'append', requestId: 2, key: 'a', bytes: bytesOf('   at A.B()\n2026-10-06 10:00:02 [INF] três\n') });
    const second = last();
    expect(second).toMatchObject({ type: 'result', requestId: 2, fromIndex: 1 });
    expect(second.type === 'result' && second.entries.map((entry) => [entryMessage(entry), entry.stackLines])).toEqual([
      ['dois', 1],
      ['três', 0],
    ]);
  });

  it('joins a multi-byte character split between two reads', async () => {
    const { core, last } = createCore();
    await core.handle(parseRequest('2026-10-06 10:00:00 [INF] a\n'));
    const accented = new TextEncoder().encode('2026-10-06 10:00:01 [INF] ação\n');
    const cut = accented.indexOf(0xc3) + 1;
    await core.handle({ type: 'append', requestId: 2, key: 'a', bytes: accented.slice(0, cut).buffer as ArrayBuffer });
    await core.handle({ type: 'append', requestId: 3, key: 'a', bytes: accented.slice(cut).buffer as ArrayBuffer });
    const result = last();
    expect(result.type === 'result' && entryMessage(result.entries.at(-1)!)).toBe('ação');
  });

  it('asks for a full read when the file cannot be continued', async () => {
    const { core, last } = createCore();
    await core.handle({ type: 'append', requestId: 9, key: 'desconhecido', bytes: bytesOf('x\n') });
    expect(last()).toEqual({ type: 'reset', requestId: 9 });

    await core.handle(parseRequest('[10:00:00 INF] só hora\n', { key: 'hora' }));
    expect(last()).toMatchObject({ type: 'result', canAppend: false });
    await core.handle({ type: 'append', requestId: 10, key: 'hora', bytes: bytesOf('[10:00:01 INF] b\n') });
    expect(last()).toEqual({ type: 'reset', requestId: 10 });
  });

  it('decompresses gzip and drops the partial first line of a truncated read', async () => {
    const { core, last } = createCore();
    const gz = gzipSync(Buffer.from('2026-10-06 10:00:00 [WRN] compactado\n'));
    await core.handle(parseRequest(new Uint8Array(gz).buffer as ArrayBuffer, { gzip: true }));
    const gzResult = last();
    expect(gzResult).toMatchObject({ type: 'result', canAppend: false });
    expect(gzResult.type === 'result' && entryMessage(gzResult.entries[0])).toBe('compactado');

    await core.handle(parseRequest('cortado] fim\n2026-10-06 10:00:00 [INF] inteiro\n', { truncated: true }));
    const truncated = last();
    expect(truncated.type === 'result' && truncated.entries.map(entryMessage)).toEqual(['inteiro']);
  });

  it('reports errors instead of throwing', async () => {
    const { core, last } = createCore();
    await core.handle(parseRequest(bytesOf('não é gzip'), { gzip: true }));
    expect(last()).toMatchObject({ type: 'error', requestId: 1 });
  });
});
