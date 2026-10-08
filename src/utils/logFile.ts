import { LogFileItem } from '../types';

/**
 * Accepts regular log files and common numeric rotations:
 * application.log, application.txt, application.log.1, application.txt.12.
 */
export function isSupportedLogFileName(fileName: string): boolean {
  return /\.(?:log|txt)(?:\.\d+)?$/i.test(fileName.trim());
}

type NativeFile = Awaited<ReturnType<NonNullable<Window['electronAPI']>['readFolder']>>[number];

/** Maps files returned by the Electron main process into LogFileItems. */
export function nativeFilesToItems(nativeFiles: NativeFile[], idPrefix: string): LogFileItem[] {
  const stamp = Date.now();
  return nativeFiles.map((file, index) => ({
    id: `${idPrefix}-${stamp}-${index}-${file.name}`,
    name: file.name,
    path: file.path,
    relativePath: file.relativePath,
    size: file.size,
    createdAt: file.createdAt,
    lastModified: file.lastModified,
  }));
}

/** Files read straight from disk by Electron (real paths that can be reopened and watched). */
export function isNativeFile(file: LogFileItem): boolean {
  return Boolean(file.path) && !file.file && !file.content;
}

/** The most recently written file is the most useful default when a folder is opened. */
export function getDefaultSelection(files: LogFileItem[]): string[] {
  if (files.length === 0) return [];
  const newest = files.reduce((best, file) => (file.lastModified > best.lastModified ? file : best));
  return [newest.id];
}

/** Short labels for source badges; uses the relative path only when names collide. */
export function buildSourceLabels(files: LogFileItem[]): Map<string, string> {
  const nameCount = new Map<string, number>();
  files.forEach((file) => nameCount.set(file.name, (nameCount.get(file.name) || 0) + 1));
  return new Map(
    files.map((file) => [
      file.id,
      (nameCount.get(file.name) || 0) > 1 ? file.relativePath || file.path || file.name : file.name,
    ])
  );
}
