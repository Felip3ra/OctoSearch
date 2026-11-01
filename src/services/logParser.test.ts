import { describe, expect, it } from 'vitest';
import { LogParseSession, normalizeLogLevel, parseLogContentAsync } from './logParser';

const parse = (content: string, referenceTime?: number) => parseLogContentAsync(content, undefined, { referenceTime });

describe('normalizeLogLevel', () => {
  it('maps the usual aliases', () => {
    expect(normalizeLogLevel('Information')).toBe('INF');
    expect(normalizeLogLevel('warn')).toBe('WRN');
    expect(normalizeLogLevel('FATAL')).toBe('ERR');
    expect(normalizeLogLevel('trace')).toBe('DBG');
    expect(normalizeLogLevel('whatever')).toBe('OTHER');
    expect(normalizeLogLevel(undefined)).toBe('OTHER');
  });
});

describe('parseLogContentAsync', () => {
  it('parses Serilog lines and attaches stack traces to the previous record', async () => {
    const result = await parse(
      [
        '2026-10-06 10:00:00.123 -03:00 [INF] Aplicação iniciada',
        '2026-10-06 10:00:01.000 -03:00 [ERR] Falha ao salvar pedido',
        'System.InvalidOperationException: erro',
        '   at Pedidos.Salvar() in Pedidos.cs:line 42',
        '2026-10-06 10:00:02.000 -03:00 [WRN] Lento',
      ].join('\n')
    );
    expect(result.formatRecognized).toBe(true);
    expect(result.entries.map((entry) => entry.level)).toEqual(['INF', 'ERR', 'WRN']);
    expect(result.entries[1].stackTrace).toHaveLength(2);
    expect(result.entries[1].hasStackTrace).toBe(true);
    expect(result.entries[1].time).toBe(Date.UTC(2026, 9, 6, 13, 0, 1));
    expect(result.totalLines).toBe(5);
  });

  it('parses log4net, NLog and Microsoft.Extensions.Logging layouts', async () => {
    const log4net = await parse('2026-10-06 10:00:00,123 [12] ERROR Pedidos.Servico - Falhou');
    expect(log4net.entries[0]).toMatchObject({ level: 'ERR', rawLevel: 'ERROR' });

    const nlog = await parse('2026-10-06 10:00:00.1234|WARN|Pedidos|Demorou');
    expect(nlog.entries[0]).toMatchObject({ level: 'WRN' });

    const mel = await parse('fail: Pedidos.Api[0]\n      Pedido 10 inválido');
    expect(mel.entries[0]).toMatchObject({ level: 'ERR', message: 'Pedidos.Api[0]: Pedido 10 inválido' });
  });

  it('parses Serilog compact JSON', async () => {
    const result = await parse('{"@t":"2026-10-06T13:00:00.000Z","@mt":"Pedido {Id} salvo","Id":7}\n{"@t":"2026-10-06T13:00:01Z","@l":"Error","@m":"Erro","@x":"Ex\\n at A"}');
    expect(result.entries[0]).toMatchObject({ level: 'INF', message: 'Pedido 7 salvo' });
    expect(result.entries[1]).toMatchObject({ level: 'ERR', message: 'Erro', stackTrace: ['Ex', ' at A'] });
  });

  it('falls back to one entry per line for unknown formats', async () => {
    const result = await parse('linha um\nlinha dois\n\nlinha três');
    expect(result.formatRecognized).toBe(false);
    expect(result.entries.map((entry) => entry.message)).toEqual(['linha um', 'linha dois', 'linha três']);
    expect(result.entries.map((entry) => entry.startLine)).toEqual([1, 2, 4]);
  });

  it('anchors time-only logs to the reference day and rolls over at midnight', async () => {
    const reference = new Date(2026, 9, 7, 9, 0, 0).getTime();
    const result = await parse('[23:59:58 INF] antes\n[00:00:02 INF] depois', reference);
    expect(new Date(result.entries[0].time!).getDate()).toBe(6);
    expect(new Date(result.entries[1].time!).getDate()).toBe(7);
  });
});

describe('LogParseSession', () => {
  const content = [
    '2026-10-06 10:00:00.000 [INF] um',
    '2026-10-06 10:00:01.000 [ERR] dois',
    'System.Exception: ruim',
    '   at X.Y()',
    '2026-10-06 10:00:02.000 [INF] três',
    '2026-10-06 10:00:03.000 [WRN] quatro',
  ].join('\r\n');

  function applySnapshot(current: ReturnType<LogParseSession['snapshot']>['entries'], session: LogParseSession) {
    const snapshot = session.snapshot();
    return [...current.slice(0, snapshot.fromIndex), ...snapshot.entries];
  }

  it('produces the same records no matter how the text is split', async () => {
    const full = (await parse(content)).entries;
    for (const size of [1, 3, 7, 20, 64]) {
      const session = new LogParseSession();
      let entries: typeof full = [];
      for (let index = 0; index < content.length; index += size) {
        session.push(content.slice(index, index + size));
        entries = applySnapshot(entries, session);
      }
      expect(entries).toEqual(full);
    }
  });

  it('keeps the open record and the unfinished line provisional', () => {
    const session = new LogParseSession();
    session.push('2026-10-06 10:00:00.000 [ERR] falha\nSystem.Exception');
    let entries = applySnapshot([], session);
    expect(entries).toHaveLength(1);
    expect(entries[0].stackTrace).toEqual(['System.Exception']);

    session.push(': detalhe\n   at A.B()\n2026-10-06 10:00:01.000 [INF] ok\n');
    entries = applySnapshot(entries, session);
    expect(entries).toHaveLength(2);
    expect(entries[0].stackTrace).toEqual(['System.Exception: detalhe', '   at A.B()']);
    expect(entries[1].message).toBe('ok');
  });

  it('refuses incremental appends for time-only and unrecognized logs', () => {
    const timeOnly = new LogParseSession();
    timeOnly.push('[10:00:00 INF] a\n');
    expect(timeOnly.canAppend).toBe(false);

    const unknown = new LogParseSession();
    unknown.push('texto livre\n');
    expect(unknown.canAppend).toBe(false);

    const dated = new LogParseSession();
    dated.push('2026-10-06 10:00:00 [INF] a\n');
    expect(dated.canAppend).toBe(true);
  });
});
