import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  LogFileItem,
  LogEntry,
  LogLevel,
  FolderTab,
  SavedFolder,
  HighlightRule,
  SearchFilter,
  SearchMode,
  FileSortField,
  SortDirection,
} from './types';
import { parseLogContentAsync } from './services/logParser';
import { filterLogEntries } from './services/logSearch';
import { getSourceColor, mergeLogSources } from './services/logMerge';
import { sortFilesByName } from './utils/fileSorter';
import {
  buildSourceLabels,
  getDefaultSelection,
  isNativeFile,
  isSupportedLogFileName,
  nativeFilesToItems,
} from './utils/logFile';
import { normalizeHighlightColor } from './utils/highlightColor';
import {
  getSavedFolders,
  saveFolderRecord,
  toggleFavoriteFolder,
  removeSavedFolder,
  addManualSavedFolder,
} from './services/folderStorage';
import { FolderTabs } from './components/FolderTabs';
import { FileList } from './components/FileList';
import { VirtualLogViewer } from './components/VirtualLogViewer';
import { StatusBar } from './components/StatusBar';
import { DesktopModal } from './components/DesktopModal';
import { SavedFoldersModal } from './components/SavedFoldersModal';
import { HighlightRulesModal } from './components/HighlightRulesModal';
import { SettingsModal } from './components/SettingsModal';
import {
  Search,
  X,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  Radio,
  ArrowDown,
  Highlighter,
  Minus,
  Plus,
  Settings,
  WrapText,
  Layers,
  FileText,
  FolderOpen,
} from 'lucide-react';

function getFolderNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || 'Logs';
}

function samePath(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function createFolderTab(
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
    levelFilter: 'ALL',
    lineLimit: 'ALL',
    customLineLimit: 100,
    lineLimitDirection: 'tail',
  };
}

/** Keeps the selection when a folder is rescanned (ids change, paths do not). */
function remapSelection(previous: FolderTab, files: LogFileItem[]): string[] {
  const selectedPaths = new Set(
    previous.files
      .filter((file) => previous.selectedFileIds.includes(file.id))
      .map((file) => file.path.toLowerCase())
  );
  const remapped = files.filter((file) => selectedPaths.has(file.path.toLowerCase())).map((file) => file.id);
  return remapped.length > 0 ? remapped : getDefaultSelection(files);
}

async function readLogFileContent(file: LogFileItem): Promise<string> {
  if (file.content) return file.content;
  if (window.electronAPI?.readFile && isNativeFile(file)) return window.electronAPI.readFile(file.path);
  if (file.file) return file.file.text();
  throw new Error(`Conteúdo do arquivo "${file.name}" não disponível.`);
}

interface ParsedFile {
  entries: LogEntry[];
  totalLines: number;
  formatRecognized: boolean;
  size: number;
  mtime: number;
}

async function parseFile(
  content: string,
  referenceTime: number,
  onProgress?: (progress: number) => void
): Promise<Pick<ParsedFile, 'entries' | 'totalLines' | 'formatRecognized'>> {
  if (!content.trim()) return { entries: [], totalLines: 0, formatRecognized: true };
  return parseLogContentAsync(content, onProgress, { referenceTime });
}

const HIGHLIGHT_RULES_STORAGE_KEY = 'log-viewer-highlight-rules-v1';
const OPEN_TABS_STORAGE_KEY = 'log-viewer-open-tabs-v1';
const MAX_CUSTOM_LINE_LIMIT = 500000;

interface PersistedTab {
  path: string;
  name: string;
  selectedPaths: string[];
}

interface PersistedSession {
  tabs: PersistedTab[];
  activePath: string | null;
}

function loadPersistedSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(OPEN_TABS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.tabs)) return null;
    return {
      tabs: parsed.tabs.filter(
        (tab: PersistedTab) =>
          typeof tab?.path === 'string' && typeof tab?.name === 'string' && Array.isArray(tab?.selectedPaths)
      ),
      activePath: typeof parsed.activePath === 'string' ? parsed.activePath : null,
    };
  } catch {
    return null;
  }
}

function loadHighlightRules(): HighlightRule[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HIGHLIGHT_RULES_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((rule): HighlightRule[] => {
      const color = normalizeHighlightColor(rule?.color);
      if (
        typeof rule?.id !== 'string' ||
        typeof rule?.text !== 'string' ||
        !color ||
        typeof rule?.caseSensitive !== 'boolean' ||
        typeof rule?.enabled !== 'boolean'
      ) {
        return [];
      }
      return [{ ...rule, color }];
    });
  } catch {
    return [];
  }
}

const LEVEL_OPTIONS: { value: LogLevel; label: string; dot?: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'ERR', label: 'ERR', dot: 'bg-rose-500' },
  { value: 'WRN', label: 'WRN', dot: 'bg-amber-500' },
  { value: 'INF', label: 'INF', dot: 'bg-sky-500' },
  { value: 'DBG', label: 'DBG', dot: 'bg-slate-400' },
  { value: 'OTHER', label: 'Outros', dot: 'bg-violet-400' },
];

const toolbarButtonClass =
  'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40';
const neutralButtonClass =
  'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100';
const activeButtonClass = 'bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300';

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() =>
    document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
    try {
      localStorage.setItem('log-viewer-theme', isDarkMode ? 'dark' : 'light');
    } catch {
      // Keep theme switching functional when browser storage is unavailable.
    }
  }, [isDarkMode]);

  // Tabs State (each tab represents an open folder)
  const [tabs, setTabs] = useState<FolderTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');

  const activeTab = useMemo(() => {
    return tabs.find((t) => t.id === activeTabId) || tabs[0] || null;
  }, [tabs, activeTabId]);

  // Files currently displayed (one file, or several merged chronologically)
  const activeFiles = activeTab?.files;
  const activeSelection = activeTab?.selectedFileIds;
  const selectedFiles = useMemo(() => {
    if (!activeFiles || !activeSelection) return [];
    const ids = new Set(activeSelection);
    return activeFiles.filter((file) => ids.has(file.id));
  }, [activeFiles, activeSelection]);
  const isMergedView = selectedFiles.length > 1;

  const sourceInfo = useMemo(() => {
    const labels = buildSourceLabels(selectedFiles);
    const colorById = new Map<string, string>();
    const colorByLabel = new Map<string, string>();
    selectedFiles.forEach((file, index) => {
      const color = getSourceColor(index);
      colorById.set(file.id, color);
      colorByLabel.set(labels.get(file.id) || file.name, color);
    });
    return { labels, colorById, colorByLabel };
  }, [selectedFiles]);

  // Log entries state
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [totalOriginalLines, setTotalOriginalLines] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unrecognizedFiles, setUnrecognizedFiles] = useState<string[]>([]);
  const parsedFilesRef = useRef(new Map<string, ParsedFile>());
  const loadRequestRef = useRef(0);

  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [isDesktopModalOpen, setIsDesktopModalOpen] = useState<boolean>(false);

  // Saved Folders Persistence State
  const [savedFolders, setSavedFolders] = useState<SavedFolder[]>(() => getSavedFolders());
  const didRestoreSession = useRef(false);
  const isSessionRestored = useRef(false);
  const [isSavedFoldersModalOpen, setIsSavedFoldersModalOpen] = useState<boolean>(false);
  const [isHighlightRulesModalOpen, setIsHighlightRulesModalOpen] = useState(false);
  const [highlightRules, setHighlightRules] = useState<HighlightRule[]>(loadHighlightRules);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [wordWrap, setWordWrap] = useState(() => {
    try {
      return localStorage.getItem('log-viewer-word-wrap') === 'true';
    } catch {
      return false;
    }
  });
  const [fileSortField, setFileSortField] = useState<FileSortField>(() => {
    try {
      const saved = localStorage.getItem('log-viewer-file-sort-field');
      return saved === 'createdAt' || saved === 'lastModified' ? saved : 'name';
    } catch {
      return 'name';
    }
  });
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
    try {
      return localStorage.getItem('log-viewer-file-sort-direction') === 'desc' ? 'desc' : 'asc';
    } catch {
      return 'asc';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(HIGHLIGHT_RULES_STORAGE_KEY, JSON.stringify(highlightRules));
    } catch {
      // Highlighting remains available for the current session.
    }
  }, [highlightRules]);

  useEffect(() => {
    try {
      localStorage.setItem('log-viewer-word-wrap', String(wordWrap));
    } catch {
      // Keep the preference active for the current session.
    }
  }, [wordWrap]);

  useEffect(() => {
    try {
      localStorage.setItem('log-viewer-file-sort-field', fileSortField);
      localStorage.setItem('log-viewer-file-sort-direction', sortDirection);
    } catch {
      // Keep sorting active for the current session.
    }
  }, [fileSortField, sortDirection]);

  // Live tailing / Real-time auto-follow state
  const [isLiveTailing, setIsLiveTailing] = useState<boolean>(true);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [lastLiveUpdate, setLastLiveUpdate] = useState<Date | null>(null);
  const canWatchFiles = Boolean(window.electronAPI?.checkFileStats) && selectedFiles.some(isNativeFile);

  // Drag and drop overlay state
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  /** Rebuilds the visible timeline from the per-file parse cache. */
  const applyParsedFiles = useCallback(
    (files: LogFileItem[], parsed: Map<string, ParsedFile>) => {
      const labels = buildSourceLabels(files);
      const sources = files.flatMap((file) => {
        const result = parsed.get(file.id);
        return result ? [{ label: labels.get(file.id) || file.name, entries: result.entries }] : [];
      });
      setEntries(mergeLogSources(sources));
      setTotalOriginalLines(files.reduce((total, file) => total + (parsed.get(file.id)?.totalLines || 0), 0));
      setUnrecognizedFiles(files.filter((file) => parsed.get(file.id)?.formatRecognized === false).map((file) => file.name));
    },
    []
  );

  const loadSelection = useCallback(
    async (files: LogFileItem[]) => {
      const requestId = ++loadRequestRef.current;
      const isCurrent = () => requestId === loadRequestRef.current;
      setIsLoading(true);
      setLoadingProgress(0);
      setErrorMessage(null);

      const parsed = new Map<string, ParsedFile>();
      const failures: string[] = [];
      try {
        for (let index = 0; index < files.length; index++) {
          const file = files[index];
          const progressBase = (index / files.length) * 100;
          const progressSpan = 100 / files.length;
          try {
            const content = await readLogFileContent(file);
            if (!isCurrent()) return;
            const result = await parseFile(content, file.lastModified, (progress) => {
              if (isCurrent()) setLoadingProgress(Math.round(progressBase + (progress * progressSpan) / 100));
            });
            if (!isCurrent()) return;
            parsed.set(file.id, { ...result, size: file.size, mtime: file.lastModified });
          } catch (err: unknown) {
            console.error(err);
            failures.push(`${file.name}: ${(err as Error)?.message || 'erro desconhecido'}`);
            // Unknown stats make live polling retry this file instead of blocking the whole selection.
            parsed.set(file.id, { entries: [], totalLines: 0, formatRecognized: true, size: -1, mtime: -1 });
          }
          setLoadingProgress(Math.round(progressBase + progressSpan));
        }

        parsedFilesRef.current = parsed;
        applyParsedFiles(files, parsed);
        if (failures.length > 0) {
          setErrorMessage(
            failures.length === files.length && files.length === 1
              ? failures[0]
              : `Não foi possível ler ${failures.length} de ${files.length} arquivo(s): ${failures.join(' | ')}`
          );
        }
      } finally {
        if (isCurrent()) setIsLoading(false);
      }
    },
    [applyParsedFiles]
  );

  // Load whenever the selection changes
  useEffect(() => {
    if (selectedFiles.length === 0) {
      loadRequestRef.current++;
      parsedFilesRef.current = new Map();
      setEntries([]);
      setTotalOriginalLines(0);
      setErrorMessage(null);
      setUnrecognizedFiles([]);
      setIsLoading(false);
      return;
    }
    void loadSelection(selectedFiles);
  }, [selectedFiles, loadSelection]);

  // Live polling (Electron): watches every selected file and re-merges only when one changes.
  useEffect(() => {
    const checkFileStats = window.electronAPI?.checkFileStats;
    const watchedFiles = selectedFiles.filter(isNativeFile);
    if (!isLiveTailing || !checkFileStats || watchedFiles.length === 0) return;

    let isPolling = false;
    let disposed = false;

    const intervalId = setInterval(async () => {
      const parsed = parsedFilesRef.current;
      if (isPolling || !selectedFiles.every((file) => parsed.has(file.id))) return;
      isPolling = true;
      try {
        let changed = false;
        for (const file of watchedFiles) {
          const current = parsed.get(file.id);
          const stats = await checkFileStats(file.path);
          if (disposed) return;
          if (!current || !stats || (stats.size === current.size && stats.mtimeMs === current.mtime)) continue;

          const content = await window.electronAPI!.readFile(file.path);
          const result = await parseFile(content, stats.mtimeMs);
          if (disposed) return;
          parsed.set(file.id, { ...result, size: stats.size, mtime: stats.mtimeMs });
          changed = true;
        }
        if (changed && parsed === parsedFilesRef.current) {
          applyParsedFiles(selectedFiles, parsed);
          setLastLiveUpdate(new Date());
        }
      } catch (err) {
        console.error('Erro ao verificar atualização dos arquivos em tempo real:', err);
      } finally {
        isPolling = false;
      }
    }, 1500);

    return () => {
      disposed = true;
      clearInterval(intervalId);
    };
  }, [isLiveTailing, selectedFiles, applyParsedFiles]);

  const updateActiveTab = useCallback(
    (updater: (tab: FolderTab) => FolderTab) => {
      if (!activeTab) return;
      setTabs((prev) => prev.map((tab) => (tab.id === activeTab.id ? updater(tab) : tab)));
    },
    [activeTab]
  );

  // Close a tab
  const handleCloseTab = (tabIdToClose: string) => {
    const indexToClose = tabs.findIndex((t) => t.id === tabIdToClose);
    const newTabs = tabs.filter((t) => t.id !== tabIdToClose);

    if (activeTab?.id === tabIdToClose) {
      const nextIndex = Math.min(Math.max(0, indexToClose), newTabs.length - 1);
      setActiveTabId(newTabs[nextIndex]?.id || '');
    }
    setTabs(newTabs);
  };

  // Open a folder in a new tab (or refresh the existing tab for the same native folder)
  const handleOpenNewFolder = (folderPath: string, rawFiles: LogFileItem[], preferredName?: string) => {
    const files = sortFilesByName(rawFiles, true);
    const isNativeFolder = files.length > 0 && files.every(isNativeFile);
    const savedName = savedFolders.find((folder) => samePath(folder.path, folderPath))?.name;
    const existing = isNativeFolder ? tabs.find((tab) => samePath(tab.folderPath, folderPath)) : undefined;
    const folderName = preferredName?.trim() || existing?.folderName || savedName || getFolderNameFromPath(folderPath);

    if (existing) {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === existing.id ? { ...tab, files, selectedFileIds: remapSelection(tab, files) } : tab
        )
      );
      setActiveTabId(existing.id);
    } else {
      const newTab = createFolderTab(`tab-${Date.now()}`, folderName, folderPath, files);
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }

    // Only real disk paths can be reopened later, so browser imports are not saved to history.
    if (isNativeFolder) {
      setSavedFolders(saveFolderRecord(folderPath, folderName, files.length));
    }
  };

  const handleRenameFolder = (tabId: string, alias: string) => {
    const normalizedAlias = alias.trim();
    const tabToRename = tabs.find((tab) => tab.id === tabId);
    if (!normalizedAlias || !tabToRename) return;

    setTabs((previous) =>
      previous.map((tab) => (tab.id === tabId ? { ...tab, folderName: normalizedAlias } : tab))
    );
    if (tabToRename.files.some(isNativeFile)) {
      setSavedFolders(saveFolderRecord(tabToRename.folderPath, normalizedAlias, tabToRename.files.length));
    }
  };

  // Open a saved folder directly when running in Electron
  const handleOpenSavedFolder = async (folderPath: string, folderName: string) => {
    const existing = tabs.find((t) => samePath(t.folderPath, folderPath));
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    if (!window.electronAPI?.readFolder) {
      alert(
        `Para abrir a pasta "${folderPath}" no navegador, use o botão "Abrir pasta" para conceder permissão de leitura. No aplicativo desktop (.exe), as pastas salvas abrem diretamente.`
      );
      return;
    }

    try {
      setIsLoading(true);
      setLoadingProgress(10);
      const nativeFiles = await window.electronAPI.readFolder(folderPath);
      if (nativeFiles.length === 0) {
        alert(`A pasta ${folderPath} não contém arquivos de log compatíveis.`);
        return;
      }
      handleOpenNewFolder(folderPath, nativeFilesToItems(nativeFiles, 'electron'), folderName);
    } catch (err: unknown) {
      console.error('Erro ao ler pasta nativamente:', err);
      alert(`Erro ao abrir pasta: ${(err as Error)?.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Restore the tabs that were open in the last desktop session.
  // First run after the update (no session saved yet): reopen only the favorite folders.
  useEffect(() => {
    if (didRestoreSession.current) return;
    didRestoreSession.current = true;

    if (!window.electronAPI?.readFolder) {
      isSessionRestored.current = true;
      return;
    }

    const session = loadPersistedSession();
    const toRestore: PersistedTab[] = session
      ? session.tabs
      : savedFolders
          .filter((folder) => folder.isFavorite)
          .map((folder) => ({ path: folder.path, name: folder.name, selectedPaths: [] }));

    if (toRestore.length === 0) {
      isSessionRestored.current = true;
      return;
    }

    const restore = async () => {
      setIsLoading(true);
      setLoadingProgress(0);
      const restoredTabs: FolderTab[] = [];

      for (let index = 0; index < toRestore.length; index++) {
        const persisted = toRestore[index];
        if (!restoredTabs.some((tab) => samePath(tab.folderPath, persisted.path))) {
          try {
            const nativeFiles = await window.electronAPI!.readFolder(persisted.path);
            if (nativeFiles.length > 0) {
              const files = sortFilesByName(nativeFilesToItems(nativeFiles, `restored-${index}`), true);
              const selectedPaths = new Set(persisted.selectedPaths.map((path) => path.toLowerCase()));
              const selection = files.filter((file) => selectedPaths.has(file.path.toLowerCase())).map((file) => file.id);
              restoredTabs.push(
                createFolderTab(
                  `restored-tab-${index}-${Date.now()}`,
                  persisted.name,
                  persisted.path,
                  files,
                  selection.length > 0 ? selection : undefined
                )
              );
            }
          } catch (error) {
            console.warn(`Não foi possível restaurar a pasta "${persisted.path}".`, error);
          }
        }
        setLoadingProgress(Math.round(((index + 1) / toRestore.length) * 100));
      }

      isSessionRestored.current = true;
      if (restoredTabs.length > 0) {
        setTabs((currentTabs) => [
          ...restoredTabs.filter((tab) => !currentTabs.some((open) => samePath(open.folderPath, tab.folderPath))),
          ...currentTabs,
        ]);
        const activeRestored = restoredTabs.find((tab) => session?.activePath && samePath(tab.folderPath, session.activePath));
        setActiveTabId((currentId) => currentId || (activeRestored || restoredTabs[0]).id);
      }
      setIsLoading(false);
    };

    void restore();
  }, [savedFolders]);

  // Persist which native folders are open (and their selection) for the next session.
  useEffect(() => {
    if (!isSessionRestored.current || !window.electronAPI) return;
    const session: PersistedSession = {
      tabs: tabs
        .filter((tab) => tab.files.some(isNativeFile))
        .map((tab) => ({
          path: tab.folderPath,
          name: tab.folderName,
          selectedPaths: tab.files.filter((file) => tab.selectedFileIds.includes(file.id)).map((file) => file.path),
        })),
      activePath: activeTab?.folderPath || null,
    };
    try {
      localStorage.setItem(OPEN_TABS_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Session restore is a convenience only.
    }
  }, [tabs, activeTab]);

  const handleToggleFavoriteFolder = (folderId: string) => {
    setSavedFolders(toggleFavoriteFolder(folderId));
  };

  const handleToggleActiveFavorite = () => {
    if (!activeTab) return;
    const saved = savedFolders.find((folder) => samePath(folder.path, activeTab.folderPath));
    if (saved) {
      handleToggleFavoriteFolder(saved.id);
      return;
    }
    const updated = saveFolderRecord(activeTab.folderPath, activeTab.folderName, activeTab.files.length);
    const created = updated.find((folder) => samePath(folder.path, activeTab.folderPath));
    setSavedFolders(created ? toggleFavoriteFolder(created.id) : updated);
  };

  const handleRemoveSavedFolder = (folderId: string) => {
    setSavedFolders(removeSavedFolder(folderId));
  };

  const handleAddManualFolder = (folderPath: string) => {
    setSavedFolders(addManualSavedFolder(folderPath));
  };

  const handleSelectionChange = (fileIds: string[]) => {
    updateActiveTab((tab) => ({ ...tab, selectedFileIds: fileIds }));
  };

  // Search, level and line count (stored per-tab)
  const searchTerm = activeTab?.searchTerm || '';
  const searchMode = activeTab?.searchMode || 'include';
  const searchFilters = activeTab?.searchFilters || [];
  const includedSearchTerms = useMemo(
    () => searchFilters.filter((filter) => filter.mode === 'include').map((filter) => filter.text),
    [searchFilters]
  );
  const levelFilter = activeTab?.levelFilter || 'ALL';
  const lineLimit = activeTab?.lineLimit || 'ALL';
  const customLineLimit = activeTab?.customLineLimit || 100;
  const lineLimitDirection = activeTab?.lineLimitDirection || 'tail';

  const setSearchTerm = (term: string) => updateActiveTab((tab) => ({ ...tab, searchTerm: term }));

  const addSearchFilter = (mode: SearchMode) => {
    const normalizedText = searchTerm.trim();
    if (!normalizedText) return;
    const key = normalizedText.toLocaleLowerCase('pt-BR');

    updateActiveTab((tab) => {
      const sameText = (filter: SearchFilter) => filter.text.toLocaleLowerCase('pt-BR') === key;
      const currentFilters = tab.searchFilters || [];
      if (currentFilters.some((filter) => filter.mode === mode && sameText(filter))) {
        return { ...tab, searchTerm: '', searchMode: mode };
      }
      // Including and excluding the same text would always yield zero results: the new intent replaces the old one.
      const withoutOpposite = currentFilters.filter((filter) => !sameText(filter));
      const newFilter: SearchFilter = {
        id: `search-filter-${Date.now()}-${crypto.randomUUID()}`,
        text: normalizedText,
        mode,
      };
      return { ...tab, searchTerm: '', searchMode: mode, searchFilters: [...withoutOpposite, newFilter] };
    });
  };

  const removeSearchFilter = (filterId: string) =>
    updateActiveTab((tab) => ({
      ...tab,
      searchFilters: (tab.searchFilters || []).filter((filter) => filter.id !== filterId),
    }));

  const clearSearchFilters = () => updateActiveTab((tab) => ({ ...tab, searchTerm: '', searchFilters: [] }));
  const setLevelFilter = (level: LogLevel) => updateActiveTab((tab) => ({ ...tab, levelFilter: level }));
  const setLineLimit = (limit: string) => updateActiveTab((tab) => ({ ...tab, lineLimit: limit }));
  const setCustomLineLimit = (count: number) =>
    updateActiveTab((tab) => ({ ...tab, customLineLimit: Math.min(MAX_CUSTOM_LINE_LIMIT, Math.max(1, count)) }));
  const setLineLimitDirection = (direction: 'tail' | 'head') =>
    updateActiveTab((tab) => ({ ...tab, lineLimitDirection: direction }));

  const filteredEntries = useMemo(() => {
    return filterLogEntries(entries, {
      searchTerm: '',
      searchMode,
      searchFilters,
      level: levelFilter,
      lineLimit,
      customLineLimit,
      lineLimitDirection,
    });
  }, [entries, searchMode, searchFilters, levelFilter, lineLimit, customLineLimit, lineLimitDirection]);

  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: entries.length, INF: 0, WRN: 0, ERR: 0, DBG: 0, OTHER: 0 };
    entries.forEach((entry) => {
      counts[entry.level]++;
    });
    return counts;
  }, [entries]);

  const clearAllFilters = useCallback(() => {
    updateActiveTab((tab) => ({
      ...tab,
      searchTerm: '',
      searchMode: 'include',
      searchFilters: [],
      levelFilter: 'ALL',
      lineLimit: 'ALL',
    }));
  }, [updateActiveTab]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        document.getElementById('search-log-input')?.focus();
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'w') {
        event.preventDefault();
        setWordWrap((current) => !current);
        return;
      }
      if (event.ctrlKey && event.key === ',') {
        event.preventDefault();
        setIsSettingsOpen(true);
        return;
      }
      if (event.key === 'Escape') {
        if (isSettingsOpen) setIsSettingsOpen(false);
        else if (searchTerm) setSearchTerm('');
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  });

  // Drag and drop handlers (opens dropped folder or files into a new tab)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length === 0) return;
    const validFiles = droppedFiles.filter((f) => isSupportedLogFileName(f.name));

    if (validFiles.length === 0) {
      alert('Por favor, solte arquivos .log, .txt ou logs rotacionados como .log.1.');
      return;
    }

    let folderName = 'Importados';
    const relativeParts = validFiles[0].webkitRelativePath?.split('/') || [];
    if (relativeParts.length > 1) folderName = relativeParts[0];
    const folderPath = `C:\\Logs\\${folderName}`;

    const stamp = Date.now();
    const newItems: LogFileItem[] = validFiles.map((file, idx) => {
      const relativePath = file.webkitRelativePath
        ? file.webkitRelativePath.split('/').slice(1).join('\\') || file.name
        : file.name;
      return {
        id: `dropped-${stamp}-${idx}`,
        name: file.name,
        relativePath,
        path: `${folderPath}\\${relativePath}`,
        size: file.size,
        lastModified: file.lastModified,
        file,
      };
    });

    handleOpenNewFolder(folderPath, newItems, folderName);
  };

  // Copy all visible filtered entries
  const handleCopyVisible = async () => {
    if (filteredEntries.length === 0) return;
    try {
      const textToCopy = filteredEntries
        .map((entry) => (isMergedView && entry.sourceFile ? `[${entry.sourceFile}] ${entry.rawText}` : entry.rawText))
        .join('\n');
      await navigator.clipboard.writeText(textToCopy);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      // Clipboard can be unavailable without user permission.
    }
  };

  const handleReload = () => {
    if (selectedFiles.length > 0) void loadSelection(selectedFiles);
  };

  const hasActiveFilters =
    searchFilters.length > 0 || levelFilter !== 'ALL' || lineLimit !== 'ALL';
  const enabledHighlightRules = highlightRules.filter((rule) => rule.enabled);
  const limitCountLabel = lineLimit === 'custom' ? customLineLimit : lineLimit;
  const limitDirectionLabel = lineLimitDirection === 'tail' ? 'Últimos' : 'Primeiros';

  let viewerTitle = 'Nenhum arquivo selecionado';
  if (isMergedView) viewerTitle = `${selectedFiles.length} arquivos consolidados`;
  else if (selectedFiles[0]) viewerTitle = selectedFiles[0].name;

  const statusFile: LogFileItem | null = isMergedView
    ? {
        id: 'merged',
        name: `${selectedFiles.length} arquivos selecionados`,
        path: activeTab?.folderPath || '',
        size: selectedFiles.reduce((total, file) => total + file.size, 0),
        lastModified: Math.max(0, ...selectedFiles.map((file) => file.lastModified)),
      }
    : selectedFiles[0] || null;

  let emptyTitle = 'Nenhum registro encontrado';
  let emptyDescription = hasActiveFilters
    ? 'Nenhum registro corresponde aos filtros aplicados.'
    : 'O arquivo selecionado está vazio.';
  if (!activeTab) {
    emptyTitle = 'Abra uma pasta de logs';
    emptyDescription = 'Use “Abrir pasta”, escolha uma pasta salva ou arraste arquivos .log/.txt para esta janela.';
  } else if (selectedFiles.length === 0) {
    emptyTitle = 'Nenhum arquivo selecionado';
    emptyDescription = 'Marque um ou mais arquivos no painel lateral. Vários arquivos são exibidos juntos em ordem cronológica.';
  }

  return (
    <div
      id="app-container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex h-screen h-dvh w-full max-w-full select-none flex-col overflow-hidden bg-slate-100 font-sans text-slate-800 dark:bg-slate-950 dark:text-slate-100"
    >
      {isDraggingOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-sky-500/10 p-6 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-sky-500 bg-white/95 px-10 py-8 text-center shadow-2xl dark:bg-slate-900/95">
            <FolderOpen className="mx-auto mb-3 h-8 w-8 text-sky-500" />
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100">Solte a pasta ou os arquivos aqui</p>
            <p className="mt-1 text-xs text-slate-500">Uma nova aba será aberta com os arquivos importados</p>
          </div>
        </div>
      )}

      <FolderTabs
        tabs={tabs}
        activeTabId={activeTab?.id || ''}
        onSelectTab={setActiveTabId}
        onCloseTab={handleCloseTab}
        onOpenNewFolder={handleOpenNewFolder}
        onRenameFolder={handleRenameFolder}
        onOpenDesktopModal={() => setIsDesktopModalOpen(true)}
        savedFolders={savedFolders}
        onOpenSavedFolder={handleOpenSavedFolder}
        onToggleFavoriteFolder={handleToggleFavoriteFolder}
        onToggleActiveFavorite={handleToggleActiveFavorite}
        onOpenSavedFoldersModal={() => setIsSavedFoldersModalOpen(true)}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode((current) => !current)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
        <FileList
          files={activeTab?.files ?? []}
          rootPath={activeTab?.folderPath || ''}
          selectedFileIds={activeTab?.selectedFileIds ?? []}
          onSelectionChange={handleSelectionChange}
          sourceColors={sourceInfo.colorById}
          sortField={fileSortField}
          sortDirection={sortDirection}
          onOpenSortSettings={() => setIsSettingsOpen(true)}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-white dark:bg-slate-900">
          {/* Toolbar */}
          <div className="flex flex-col gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {/* Search */}
              <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:min-w-[320px]">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="search-log-input"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addSearchFilter(event.shiftKey ? 'exclude' : 'include');
                      }
                    }}
                    disabled={!activeTab}
                    placeholder="Buscar nos logs…  Enter inclui · Shift+Enter exclui"
                    className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-8 font-mono text-xs text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-950"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      title="Limpar pesquisa (Esc)"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex h-8 shrink-0 overflow-hidden rounded-md border border-slate-200 text-[11px] font-semibold dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => addSearchFilter('include')}
                    disabled={!searchTerm.trim()}
                    title="Mostrar registros que contêm este texto. Vários termos incluídos funcionam como OU (Enter)"
                    className="flex items-center gap-1 px-2.5 text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Incluir
                  </button>
                  <button
                    type="button"
                    onClick={() => addSearchFilter('exclude')}
                    disabled={!searchTerm.trim()}
                    title="Ocultar registros que contêm este texto, além dos filtros de inclusão (Shift+Enter)"
                    className="flex items-center gap-1 border-l border-slate-200 px-2.5 text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/50"
                  >
                    <Minus className="h-3.5 w-3.5" /> Excluir
                  </button>
                </div>
              </div>

              {/* Limit */}
              <div className="flex items-center gap-1.5">
                <select
                  id="select-line-limit"
                  value={lineLimit}
                  onChange={(e) => setLineLimit(e.target.value)}
                  title="Limitar a quantidade de registros exibidos (um registro inclui sua stack trace)"
                  className="h-8 cursor-pointer rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  <option value="ALL">Todos os registros</option>
                  <option value="50">50 registros</option>
                  <option value="100">100 registros</option>
                  <option value="500">500 registros</option>
                  <option value="1000">1.000 registros</option>
                  <option value="5000">5.000 registros</option>
                  <option value="custom">Personalizado…</option>
                </select>
                {lineLimit === 'custom' && (
                  <input
                    type="number"
                    min={1}
                    max={MAX_CUSTOM_LINE_LIMIT}
                    value={customLineLimit}
                    onChange={(e) => setCustomLineLimit(Number.parseInt(e.target.value, 10) || 1)}
                    className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 font-mono text-xs text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    aria-label="Quantidade de registros"
                  />
                )}
                {lineLimit !== 'ALL' && (
                  <div className="flex h-8 shrink-0 rounded-md bg-slate-100 p-0.5 text-[11px] font-medium dark:bg-slate-800">
                    {(['tail', 'head'] as const).map((direction) => (
                      <button
                        key={direction}
                        type="button"
                        onClick={() => setLineLimitDirection(direction)}
                        title={direction === 'tail' ? 'Mostrar os registros mais recentes (fim do log)' : 'Mostrar os primeiros registros (início do log)'}
                        className={`cursor-pointer rounded px-2 transition-colors ${
                          lineLimitDirection === direction
                            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        {direction === 'tail' ? 'Últimos' : 'Primeiros'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Level segmented control + actions */}
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain">
              <div role="radiogroup" aria-label="Filtrar por nível" className="flex shrink-0 rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
                {LEVEL_OPTIONS.map((option) => {
                  const isActive = levelFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => setLevelFilter(option.value)}
                      className={`flex h-7 cursor-pointer items-center gap-1.5 rounded px-2 text-[11px] font-semibold transition-colors ${
                        isActive
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-50'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {option.dot && <span className={`h-1.5 w-1.5 rounded-full ${option.dot}`} />}
                      {option.label}
                      <span className="font-normal tabular-nums text-slate-400 dark:text-slate-500">
                        {levelCounts[option.value].toLocaleString('pt-BR')}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="ml-auto flex min-w-max items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setIsHighlightRulesModalOpen(true)}
                  title="Configurar marcadores que destacam linhas por texto"
                  className={`${toolbarButtonClass} ${enabledHighlightRules.length > 0 ? 'text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40' : neutralButtonClass}`}
                >
                  <Highlighter className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Marcadores</span>
                  {enabledHighlightRules.length > 0 && (
                    <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">{enabledHighlightRules.length}</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setWordWrap((current) => !current)}
                  title="Alternar quebra de linha (Ctrl+Shift+W)"
                  aria-pressed={wordWrap}
                  className={`${toolbarButtonClass} ${wordWrap ? activeButtonClass : neutralButtonClass}`}
                >
                  <WrapText className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Quebrar linhas</span>
                </button>

                <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

                <button
                  type="button"
                  onClick={() => setIsLiveTailing(!isLiveTailing)}
                  disabled={!window.electronAPI?.checkFileStats}
                  title={
                    window.electronAPI?.checkFileStats
                      ? isLiveTailing
                        ? 'Tempo real ativo: os arquivos selecionados são recarregados quando mudam no disco'
                        : 'Ativar acompanhamento em tempo real'
                      : 'Tempo real disponível apenas no aplicativo desktop'
                  }
                  className={`${toolbarButtonClass} ${
                    isLiveTailing && canWatchFiles
                      ? 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40'
                      : neutralButtonClass
                  }`}
                >
                  <span className="relative flex h-2 w-2">
                    {isLiveTailing && canWatchFiles && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${isLiveTailing && canWatchFiles ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  </span>
                  <span>Tempo real</span>
                </button>

                {isLiveTailing && canWatchFiles && (
                  <button
                    type="button"
                    onClick={() => setAutoScroll(!autoScroll)}
                    aria-pressed={autoScroll}
                    title={autoScroll ? 'Auto-rolagem ativa: acompanha a última linha' : 'Auto-rolagem pausada: mantém sua posição'}
                    className={`${toolbarButtonClass} ${autoScroll ? activeButtonClass : neutralButtonClass}`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Auto-rolar</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleReload}
                  title={isMergedView ? 'Recarregar os arquivos selecionados' : 'Recarregar arquivo'}
                  disabled={isLoading || selectedFiles.length === 0}
                  className={`${toolbarButtonClass} ${neutralButtonClass} px-2`}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={handleCopyVisible}
                  title="Copiar registros visíveis para a área de transferência"
                  disabled={filteredEntries.length === 0}
                  className={`${toolbarButtonClass} ${neutralButtonClass}`}
                >
                  {copiedAll ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span className="hidden lg:inline">{copiedAll ? 'Copiado!' : 'Copiar'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  title="Configurações (Ctrl+,)"
                  className={`${toolbarButtonClass} ${neutralButtonClass} px-2`}
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Active filter chips */}
          {(hasActiveFilters || enabledHighlightRules.length > 0) && (
            <div className="flex min-h-10 items-center gap-1.5 overflow-x-auto border-b border-slate-200 px-3 py-1.5 text-[11px] dark:border-slate-800">
              {[
                ...searchFilters.filter((filter) => filter.mode === 'include'),
                ...searchFilters.filter((filter) => filter.mode === 'exclude'),
              ].map((filter, index, ordered) => (
                <React.Fragment key={filter.id}>
                {index > 0 && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {filter.mode === 'include' ? 'ou' : ordered[index - 1].mode === 'include' ? 'e não' : 'nem'}
                  </span>
                )}
                {index === 0 && filter.mode === 'exclude' && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">sem</span>
                )}
                <button
                  type="button"
                  onClick={() => removeSearchFilter(filter.id)}
                  className={`group flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium transition-colors ${
                    filter.mode === 'exclude'
                      ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
                  }`}
                  title="Remover filtro"
                >
                  {filter.mode === 'exclude' ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  <span className="font-mono">{filter.text}</span>
                  <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                </button>
                </React.Fragment>
              ))}
              {levelFilter !== 'ALL' && (
                <button type="button" onClick={() => setLevelFilter('ALL')} className="group flex shrink-0 items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 font-medium text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300">
                  Nível: {LEVEL_OPTIONS.find((option) => option.value === levelFilter)?.label}
                  <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                </button>
              )}
              {lineLimit !== 'ALL' && (
                <button type="button" onClick={() => setLineLimit('ALL')} className="group flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-medium text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300">
                  {limitDirectionLabel} {Number(limitCountLabel).toLocaleString('pt-BR')} registros
                  <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                </button>
              )}
              {enabledHighlightRules.map((rule) => (
                <span key={rule.id} className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: rule.color }} />
                  <span className="font-mono">{rule.text}</span>
                </span>
              ))}
              {hasActiveFilters && (
                <button type="button" onClick={clearAllFilters} className="ml-auto shrink-0 rounded px-1.5 py-0.5 font-medium text-slate-500 hover:bg-slate-100 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800">
                  Limpar filtros
                </button>
              )}
            </div>
          )}

          {/* Viewer header */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex min-w-0 items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
              {isMergedView ? <Layers className="h-3.5 w-3.5 shrink-0 text-sky-500" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
              <span className="truncate" title={selectedFiles.map((file) => file.path).join('\n')}>{viewerTitle}</span>
              {isMergedView && (
                <div className="hidden min-w-0 items-center gap-1 sm:flex">
                  {selectedFiles.slice(0, 6).map((file) => (
                    <span
                      key={file.id}
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: sourceInfo.colorById.get(file.id) }}
                      title={sourceInfo.labels.get(file.id)}
                    />
                  ))}
                  {selectedFiles.length > 6 && <span className="text-[10px] text-slate-400">+{selectedFiles.length - 6}</span>}
                </div>
              )}
            </div>
            <div className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              <strong className="font-semibold text-slate-700 dark:text-slate-200">{filteredEntries.length.toLocaleString('pt-BR')}</strong>
              {' '}de {entries.length.toLocaleString('pt-BR')} registros
            </div>
          </div>

          {unrecognizedFiles.length > 0 && (
            <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span className="min-w-0 break-words">
                Formato de log não reconhecido em <strong>{unrecognizedFiles.join(', ')}</strong>. As linhas são exibidas
                uma a uma, sem data e nível{isMergedView ? ', no início da linha do tempo' : ''}.
              </span>
              <button type="button" onClick={() => setUnrecognizedFiles([])} className="ml-auto shrink-0 rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/40" aria-label="Fechar aviso">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start gap-2 border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <span className="min-w-0 break-words">{errorMessage}</span>
              <button type="button" onClick={() => setErrorMessage(null)} className="ml-auto shrink-0 rounded p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900/40" aria-label="Fechar aviso">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="relative flex min-h-0 flex-1 flex-col">
            {isLoading && (
              <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-sky-500/10">
                <div className="h-full bg-sky-500 transition-[width] duration-200" style={{ width: `${loadingProgress}%` }} />
              </div>
            )}
            <VirtualLogViewer
              entries={filteredEntries}
              allEntries={entries}
              searchTerms={includedSearchTerms}
              autoScroll={isLiveTailing && canWatchFiles && autoScroll}
              highlightRules={highlightRules}
              wordWrap={wordWrap}
              sourceColors={sourceInfo.colorByLabel}
              emptyTitle={isLoading ? 'Carregando…' : emptyTitle}
              emptyDescription={isLoading ? `Processando ${selectedFiles.length} arquivo(s)…` : emptyDescription}
            />
          </div>
        </main>
      </div>

      <StatusBar
        currentFile={statusFile}
        totalLines={totalOriginalLines}
        totalEntries={entries.length}
        filteredCount={filteredEntries.length}
        searchFilters={searchFilters}
        levelFilter={levelFilter}
        lineLimit={lineLimit}
        customLineLimit={customLineLimit}
        lineLimitDirection={lineLimitDirection}
        isLoading={isLoading}
        loadingProgress={loadingProgress}
        errorMessage={errorMessage}
        isWatching={isLiveTailing && canWatchFiles}
        autoScroll={isLiveTailing && canWatchFiles && autoScroll}
        lastLiveUpdate={lastLiveUpdate}
      />

      <DesktopModal isOpen={isDesktopModalOpen} onClose={() => setIsDesktopModalOpen(false)} />

      <SavedFoldersModal
        isOpen={isSavedFoldersModalOpen}
        onClose={() => setIsSavedFoldersModalOpen(false)}
        savedFolders={savedFolders}
        currentFolderPath={activeTab?.folderPath || ''}
        onOpenFolder={handleOpenSavedFolder}
        onToggleFavorite={handleToggleFavoriteFolder}
        onRemoveFolder={handleRemoveSavedFolder}
        onAddManualFolder={handleAddManualFolder}
      />

      <HighlightRulesModal
        isOpen={isHighlightRulesModalOpen}
        rules={highlightRules}
        onChange={setHighlightRules}
        onClose={() => setIsHighlightRulesModalOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        isDarkMode={isDarkMode}
        wordWrap={wordWrap}
        fileSortField={fileSortField}
        sortDirection={sortDirection}
        onToggleTheme={() => setIsDarkMode((current) => !current)}
        onToggleWordWrap={() => setWordWrap((current) => !current)}
        onFileSortFieldChange={setFileSortField}
        onSortDirectionChange={setSortDirection}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
