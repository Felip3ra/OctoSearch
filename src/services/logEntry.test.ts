import { describe, expect, it } from 'vitest';
import { parseLogContentAsync } from './logParser';
import { entryMessage, entrySearchText, entryStackTrace, entryTimestamp } from './logEntry';

describe('compact records', () => {
  it('keeps timestamp, message and stack trace as positions in the raw text', async () => {
    const { entries } = await parseLogContentAsync(
      '2026-10-06 10:00:01.000 -03:00 [ERR] Falha ao salvar\nSystem.Exception: erro\n   at A.B()'
    );
    const [entry] = entries;
    expect(entry).not.toHaveProperty('message');
    expect(entry).not.toHaveProperty('timestamp');
    expect(entry).not.toHaveProperty('stackTrace');
    expect(entryTimestamp(entry)).toBe('2026-10-06 10:00:01.000 -03:00');
    expect(entryMessage(entry)).toBe('Falha ao salvar');
    expect(entryStackTrace(entry)).toEqual(['System.Exception: erro', '   at A.B()']);
    expect(entrySearchText(entry)).toBe(entry.rawText);
  });

  it('stores the texts that are not part of the raw line', async () => {
    const mel = (await parseLogContentAsync('fail: Pedidos.Api[0]\n      Pedido inválido\n   at X')).entries[0];
    expect(entryMessage(mel)).toBe('Pedidos.Api[0]: Pedido inválido');
    expect(entryStackTrace(mel)).toEqual(['   at X']);

    const json = (await parseLogContentAsync('{"@t":"2026-10-06T13:00:01Z","@l":"Error","@m":"Erro","@x":"Ex\\n at A"}')).entries[0];
    expect(json.stackTrace).toEqual(['Ex', ' at A']);
    expect(entrySearchText(json)).toContain('\nEx\n at A');
  });
});
