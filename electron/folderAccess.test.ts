import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import folderAccess from './folderAccess.cjs';

const { AllowedFolders, isPathInside, isSupportedLogFileName } = folderAccess;

describe('isPathInside', () => {
  it('handles Windows paths case-insensitively', () => {
    expect(isPathInside('C:\\Logs', 'c:\\logs\\api\\app.log', 'win32')).toBe(true);
    expect(isPathInside('C:\\Logs', 'C:\\Logs', 'win32')).toBe(true);
    expect(isPathInside('C:\\Logs', 'C:\\Logs2\\app.log', 'win32')).toBe(false);
    expect(isPathInside('C:\\Logs', 'C:\\Logs\\..\\Windows\\win.ini', 'win32')).toBe(false);
    expect(isPathInside('C:\\Logs', 'D:\\Logs\\app.log', 'win32')).toBe(false);
  });

  it('handles POSIX paths case-sensitively', () => {
    expect(isPathInside('/var/log', '/var/log/app/app.log', 'linux')).toBe(true);
    expect(isPathInside('/var/log', '/var/Log/app.log', 'linux')).toBe(false);
    expect(isPathInside('/var/log', '/var/log/../../etc/passwd', 'linux')).toBe(false);
    expect(isPathInside('/var/log', '/var/log/..hidden/app.log', 'linux')).toBe(true);
  });
});

describe('isSupportedLogFileName', () => {
  it('accepts logs, rotations and gzip rotations only', () => {
    expect(isSupportedLogFileName('app.log')).toBe(true);
    expect(isSupportedLogFileName('app.txt.3')).toBe(true);
    expect(isSupportedLogFileName('app.log.2.gz')).toBe(true);
    expect(isSupportedLogFileName('id_rsa')).toBe(false);
    expect(isSupportedLogFileName('appsettings.json')).toBe(false);
  });
});

describe('AllowedFolders', () => {
  let directory = '';
  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('persists grants and imports known folders only once, on the first run', () => {
    directory = mkdtempSync(path.join(tmpdir(), 'octosearch-'));
    const store = path.join(directory, 'allowed.json');

    const first = new AllowedFolders(store, 'linux');
    expect(first.has('/srv/logs/app.log')).toBe(false);
    expect(first.importKnown(['/srv/logs'])).toBe(true);
    expect(first.importKnown(['/etc'])).toBe(false);
    expect(first.has('/srv/logs/app.log')).toBe(true);
    expect(first.has('/etc/passwd')).toBe(false);
    expect(JSON.parse(readFileSync(store, 'utf-8')).folders).toEqual(['/srv/logs']);

    const second = new AllowedFolders(store, 'linux');
    expect(second.importKnown(['/etc'])).toBe(false);
    second.add('/opt/app/logs');
    second.add('/opt/app/logs');
    expect(new AllowedFolders(store, 'linux').folders).toEqual(['/srv/logs', '/opt/app/logs']);
  });
});
