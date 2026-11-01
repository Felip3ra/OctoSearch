import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { detectEncoding, gunzip, isGzipFileName, skipPartialFirstLine } from './logDecoding';

const utf16le = (text: string) => new Uint8Array(Buffer.from(text, 'utf16le'));

describe('detectEncoding', () => {
  it('recognizes byte order marks', () => {
    expect(detectEncoding(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toEqual({ encoding: 'utf-8', bomLength: 3 });
    expect(detectEncoding(new Uint8Array([0xff, 0xfe, 0x41, 0]))).toEqual({ encoding: 'utf-16le', bomLength: 2 });
    expect(detectEncoding(new Uint8Array([0xfe, 0xff, 0, 0x41]))).toEqual({ encoding: 'utf-16be', bomLength: 2 });
  });

  it('detects UTF-16 without BOM', () => {
    expect(detectEncoding(utf16le('2026-10-06 10:00:00 [INF] olá\r\n')).encoding).toBe('utf-16le');
  });

  it('tells UTF-8 apart from Windows-1252', () => {
    expect(detectEncoding(new TextEncoder().encode('Ação concluída')).encoding).toBe('utf-8');
    // "Ação" in Windows-1252: Ã§ would be invalid UTF-8 as single bytes 0xE7 0xE3.
    const ansi = new Uint8Array([0x41, 0xe7, 0xe3, 0x6f]);
    expect(detectEncoding(ansi).encoding).toBe('windows-1252');
    expect(new TextDecoder('windows-1252').decode(ansi)).toBe('Ação');
  });

  it('accepts a UTF-8 character cut at the end of the read', () => {
    const bytes = new TextEncoder().encode('Ação');
    expect(detectEncoding(bytes.subarray(0, 2)).encoding).toBe('utf-8');
  });
});

describe('skipPartialFirstLine', () => {
  it('drops everything up to the first line break', () => {
    const bytes = new TextEncoder().encode('meio da linha\nlinha inteira\n');
    expect(new TextDecoder().decode(skipPartialFirstLine(bytes, 'utf-8'))).toBe('linha inteira\n');
    expect(skipPartialFirstLine(new TextEncoder().encode('sem quebra'), 'utf-8')).toHaveLength(0);
  });

  it('respects UTF-16 code units', () => {
    const bytes = utf16le('parcial\nlinha\n');
    expect(new TextDecoder('utf-16le').decode(skipPartialFirstLine(bytes, 'utf-16le'))).toBe('linha\n');
  });
});

describe('gzip', () => {
  it('recognizes compressed rotations and decompresses them', async () => {
    expect(isGzipFileName('app.log.1.gz')).toBe(true);
    expect(isGzipFileName('app.log')).toBe(false);
    const compressed = new Uint8Array(gzipSync(Buffer.from('linha 1\nlinha 2')));
    expect(new TextDecoder().decode(await gunzip(compressed))).toBe('linha 1\nlinha 2');
  });
});
