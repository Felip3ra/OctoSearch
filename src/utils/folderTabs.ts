import { FolderTab, LogFileItem } from '../types';
import { getDefaultSelection } from './logFile';

/** Folder paths compare case-insensitively (Windows; harmless elsewhere for these lookups). */
export function samePath(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function getFolderNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || 'Logs';
}

/** Ids of the files whose path is in `paths`. */
export function selectByPaths(files: LogFileItem[], paths: readonly string[]): string[] {
  const wanted = new Set(paths.map((path) => path.toLowerCase()));
  return files.filter((file) => wanted.has(file.path.toLowerCase())).map((file) => file.id);
}

export function createFolderTab(
  id: string,
  folderName: string,
  folderPath: string,
  files: LogFileItem[],
  selectedFileIds: string[] = getDefaultSelection(files)
): FolderTab {
  return {
    id,
    folderName,
    folderPath,
    files,
    selectedFileIds,
    searchTerm: '',
    searchMode: 'include',
    searchFilters: [],
    includeOperator: 'or',
    levelFilter: 'ALL',
    lineLimit: 'ALL',
    customLineLimit: 100,
    lineLimitDirection: 'tail',
  };
}

/** Keeps the selection when a folder is rescanned (ids change, paths do not). */
export function remapSelection(previous: FolderTab, files: LogFileItem[]): string[] {
  const selectedPaths = previous.files.filter((file) => previous.selectedFileIds.includes(file.id)).map((file) => file.path);
  const remapped = selectByPaths(files, selectedPaths);
  return remapped.length > 0 ? remapped : getDefaultSelection(files);
}
