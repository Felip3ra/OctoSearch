import { FileSortField, LogFileItem, SortDirection } from '../types';

function compareNames(a: LogFileItem, b: LogFileItem): number {
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function sortFiles(
  files: LogFileItem[],
  field: FileSortField = 'name',
  direction: SortDirection = 'asc'
): LogFileItem[] {
  const directionFactor = direction === 'asc' ? 1 : -1;

  return [...files].sort((a, b) => {
    let comparison: number;
    if (field === 'name') {
      comparison = compareNames(a, b);
    } else if (field === 'createdAt') {
      comparison = (a.createdAt ?? a.lastModified) - (b.createdAt ?? b.lastModified);
    } else {
      comparison = a.lastModified - b.lastModified;
    }

    return (comparison || compareNames(a, b)) * directionFactor;
  });
}

/**
 * Sorts log file items alphabetically by name using natural numerical ordering.
 * (e.g. log-1.txt, log-2.txt, log-10.txt, log-20260919.txt, log-20260920.txt, log-20260921.txt)
 */
export function sortFilesByName(files: LogFileItem[], ascending: boolean = true): LogFileItem[] {
  return sortFiles(files, 'name', ascending ? 'asc' : 'desc');
}
