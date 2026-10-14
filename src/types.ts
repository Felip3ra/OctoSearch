export type LogLevel = 'ALL' | 'INF' | 'WRN' | 'ERR' | 'DBG' | 'OTHER';
export type EntryLogLevel = 'INF' | 'WRN' | 'ERR' | 'DBG' | 'OTHER';
export type SearchMode = 'include' | 'exclude';
/** How two included terms combine: 'or' needs either of them, 'and' needs both. */
export type FilterOperator = 'or' | 'and';

export interface SearchFilter {
  id: string;
  text: string;
  mode: SearchMode;
  /**
   * How an included term joins the included term before it. AND binds tighter than OR,
   * so "a E b OU c" means "(a E b) OU c". Missing means the tab/saved default operator.
   */
  connector?: FilterOperator;
}

export interface LogEntry {
  id: number;
  startLine: number;
  endLine: number;
  timestamp: string;
  /** Epoch milliseconds parsed from the timestamp (undefined when the line has no date). */
  time?: number;
  level: EntryLogLevel;
  rawLevel: string;
  message: string;
  stackTrace: string[];
  rawText: string;
  hasStackTrace: boolean;
  sourceFile?: string;
}

export interface LogFileItem {
  id: string;
  name: string;
  path: string;
  relativePath?: string;
  size: number;
  createdAt?: number;
  lastModified: number;
  file?: File;
  content?: string;
}

export type FileSortField = 'name' | 'createdAt' | 'lastModified';
export type SortDirection = 'asc' | 'desc';

export interface FolderTab {
  id: string;
  folderPath: string;
  folderName: string;
  files: LogFileItem[];
  /** Files whose logs are displayed. More than one produces a chronological merged view. */
  selectedFileIds: string[];
  searchTerm: string;
  searchMode: SearchMode;
  searchFilters: SearchFilter[];
  includeOperator?: FilterOperator;
  levelFilter: LogLevel;
  lineLimit?: string;
  customLineLimit?: number;
  lineLimitDirection?: 'tail' | 'head';
}

export interface ParseProgress {
  processedLines: number;
  totalLinesEstimate: number;
  percentage: number;
  isComplete: boolean;
}

export interface SavedFolder {
  id: string;
  name: string;
  path: string;
  lastAccessed: number;
  fileCount: number;
  isFavorite: boolean;
}

/** A named set of search filters the user can re-apply; `group` is '' when ungrouped. */
export interface SavedFilter {
  id: string;
  name: string;
  group: string;
  filters: SearchFilter[];
  includeOperator: FilterOperator;
  levelFilter: LogLevel;
  createdAt: number;
  updatedAt: number;
}

export interface HighlightRule {
  id: string;
  text: string;
  color: string;
  caseSensitive: boolean;
  enabled: boolean;
}

export interface ElectronFolderResult {
  folderPath: string;
  files: {
    name: string;
    path: string;
    relativePath?: string;
    size: number;
    createdAt?: number;
    lastModified: number;
  }[];
}

export interface ElectronAPI {
  isElectron: boolean;
  selectFolder: () => Promise<ElectronFolderResult | null>;
  readFolder: (folderPath: string) => Promise<{ name: string; path: string; relativePath?: string; size: number; createdAt?: number; lastModified: number }[]>;
  readFile: (filePath: string) => Promise<string>;
  checkFileStats?: (filePath: string) => Promise<{ size: number; mtimeMs: number } | null>;
  openInExplorer?: (targetPath: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
