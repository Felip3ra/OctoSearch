import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderTab, LogFileItem, SavedFolder } from '../types';
import { sortFilesByName } from '../utils/fileSorter';
import { isNativeFile } from '../utils/logFile';
import { createFolderTab, getFolderNameFromPath, remapSelection, samePath, selectByPaths } from '../utils/folderTabs';

interface UseTabsOptions {
  savedFolders: SavedFolder[];
  /** Called for folders read from disk, so they can be reopened later from the history. */
  recordFolder: (path: string, name: string, fileCount: number) => void;
}

/** Open folders (one per tab), the active tab and its selected files. */
export function useTabs({ savedFolders, recordFolder }: UseTabsOptions) {
  const [tabs, setTabs] = useState<FolderTab[]>([]);
  const [activeTabId, setActiveTabId] = useState('');
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) || tabs[0] || null, [tabs, activeTabId]);

  // Opening a folder can happen after an await (saved folders, "open with"): it reads the latest
  // tabs and history from refs, so the function itself stays stable.
  const tabsRef = useRef(tabs);
  const savedFoldersRef = useRef(savedFolders);
  useEffect(() => {
    tabsRef.current = tabs;
    savedFoldersRef.current = savedFolders;
  }, [tabs, savedFolders]);

  const activeFiles = activeTab?.files;
  const activeSelection = activeTab?.selectedFileIds;
  const selectedFiles = useMemo(() => {
    if (!activeFiles || !activeSelection) return [];
    const ids = new Set(activeSelection);
    return activeFiles.filter((file) => ids.has(file.id));
  }, [activeFiles, activeSelection]);

  const updateActiveTab = useCallback(
    (updater: (tab: FolderTab) => FolderTab) => {
      if (!activeTab) return;
      setTabs((previous) => previous.map((tab) => (tab.id === activeTab.id ? updater(tab) : tab)));
    },
    [activeTab]
  );

  /**
   * Opens a folder in a new tab, or refreshes the tab already showing the same disk folder.
   * `selectPaths` chooses the selected files (otherwise the previous or default selection).
   */
  const openFolderInTab = useCallback(
    (folderPath: string, rawFiles: LogFileItem[], preferredName?: string, selectPaths: readonly string[] = []) => {
      const files = sortFilesByName(rawFiles, true);
      const requested = selectByPaths(files, selectPaths);
      const isNativeFolder = files.length > 0 && files.every(isNativeFile);
      const savedName = savedFoldersRef.current.find((folder) => samePath(folder.path, folderPath))?.name;
      const existing = isNativeFolder ? tabsRef.current.find((tab) => samePath(tab.folderPath, folderPath)) : undefined;
      const folderName = preferredName?.trim() || existing?.folderName || savedName || getFolderNameFromPath(folderPath);

      if (existing) {
        setTabs((previous) =>
          previous.map((tab) =>
            tab.id === existing.id ? { ...tab, files, selectedFileIds: requested.length > 0 ? requested : remapSelection(tab, files) } : tab
          )
        );
        setActiveTabId(existing.id);
      } else {
        const tab = createFolderTab(`tab-${Date.now()}`, folderName, folderPath, files, requested.length > 0 ? requested : undefined);
        setTabs((previous) => [...previous, tab]);
        setActiveTabId(tab.id);
      }
      // Only real disk paths can be reopened later, so browser imports are not saved to history.
      if (isNativeFolder) recordFolder(folderPath, folderName, files.length);
    },
    [recordFolder]
  );

  /** Adds tabs restored from the previous session before the ones opened meanwhile. */
  const addRestoredTabs = useCallback((restored: FolderTab[], activePath: string | null) => {
    if (restored.length === 0) return;
    setTabs((current) => [...restored.filter((tab) => !current.some((open) => samePath(open.folderPath, tab.folderPath))), ...current]);
    const active = restored.find((tab) => activePath && samePath(tab.folderPath, activePath));
    setActiveTabId((currentId) => currentId || (active || restored[0]).id);
  }, []);

  const closeTab = (tabId: string) => {
    const index = tabs.findIndex((tab) => tab.id === tabId);
    const remaining = tabs.filter((tab) => tab.id !== tabId);
    if (activeTab?.id === tabId) setActiveTabId(remaining[Math.min(Math.max(0, index), remaining.length - 1)]?.id || '');
    setTabs(remaining);
  };

  const renameTab = (tabId: string, alias: string) => {
    const name = alias.trim();
    const tab = tabs.find((item) => item.id === tabId);
    if (!name || !tab) return;
    setTabs((previous) => previous.map((item) => (item.id === tabId ? { ...item, folderName: name } : item)));
    if (tab.files.some(isNativeFile)) recordFolder(tab.folderPath, name, tab.files.length);
  };

  const findTabByPath = (path: string) => tabs.find((tab) => samePath(tab.folderPath, path));
  const setSelection = (fileIds: string[]) => updateActiveTab((tab) => ({ ...tab, selectedFileIds: fileIds }));

  return {
    tabs,
    activeTab,
    selectedFiles,
    setActiveTabId,
    updateActiveTab,
    openFolderInTab,
    addRestoredTabs,
    closeTab,
    renameTab,
    findTabByPath,
    setSelection,
  };
}
