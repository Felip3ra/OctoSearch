import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import zipReader from './zipReader.cjs';

const { joinZipPath, listZipEntries, readZipEntry, splitZipPath } = zipReader;

/** Minimal zip writer for the tests: one stored and the others deflated. */
function createZip(files: { name: string; content: string; store?: boolean; encrypted?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const raw = Buffer.from(file.content, 'utf-8');
    const data = file.store ? raw : deflateRawSync(raw);
    const name = Buffer.from(file.name, 'utf-8');
    const flags = 0x800 | (file.encrypted ? 1 : 0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(file.store ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(file.store ? 0 : 8, 10);
    central.writeUInt16LE((6 << 11) | (30 << 5), 12);
    central.writeUInt16LE((46 << 9) | (10 << 5) | 8, 14);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

describe('zipReader', () => {
  let directory = '';
  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('lists and extracts stored and deflated logs, skipping encrypted ones', async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'octosearch-zip-'));
    const zip = path.join(directory, 'logs.zip');
    writeFileSync(zip, createZip([
      { name: 'api/app.log', content: '2026-10-06 10:00:00 [INF] ação\n'.repeat(50) },
      { name: 'leia-me.txt', content: 'texto', store: true },
      { name: 'segredo.log', content: 'x', encrypted: true },
    ]));

    const entries = await listZipEntries(zip);
    expect(entries.map((entry: { name: string }) => entry.name)).toEqual(['api/app.log', 'leia-me.txt']);
    expect(new Date(entries[0].lastModified).getFullYear()).toBe(2026);
    expect((await readZipEntry(zip, 'api/app.log')).toString('utf-8')).toContain('[INF] ação');
    expect((await readZipEntry(zip, 'leia-me.txt')).toString('utf-8')).toBe('texto');
    await expect(readZipEntry(zip, 'nao-existe.log')).rejects.toThrow(/não encontrado/);
  });

  it('builds and splits paths inside a zip', () => {
    const full = joinZipPath('C:\\Logs\\antigos.zip', 'api/app.log');
    expect(splitZipPath(full)).toEqual({ zipPath: 'C:\\Logs\\antigos.zip', innerName: 'api/app.log' });
    expect(splitZipPath('C:\\Logs\\app.log')).toBeNull();
  });
});
