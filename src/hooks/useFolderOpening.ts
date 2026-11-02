import { useCallback, useEffect, useState } from 'react';
import { FolderTab, LaunchPath, LogFileItem, SavedFolder } from '../types';
import { capabilities, desktop, desktopErrorCode } from '../services/platform';
import { sortFilesByName } from '../utils/fileSorter';
import { createFolderTab, samePath, selectByPaths } from '../utils/folderTabs';
import { isNativeFile, nativeFilesToItems } from '../utils/logFile';

const OPEN_TABS_STORAGE_KEY = 'log-viewer-open-tabs-v1';

interface PersistedTab {
  path: string;
  name: string;
  selectedPaths: string[];
}

interface PersistedSession {
  tabs: PersistedTab[];
  activePath: string | null;
}

export interface DeniedFolder {
  path: string;
  name: string;
}

function loadPersistedSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(OPEN_TABS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.tabs)) return null;
    return {
      tabs: parsed.tabs.filter(
        (tab: PersistedTab) => typeof tab?.path === 'string' && typeof tab?.name === 'string' && Array.isArray(tab?.selectedPaths)
      ),
      activePath: typeof parsed.activePath === 'string' ? parsed.activePath : null,
    };
  } catch {
    return null;
  }
}

function withDeniedFolder(list: DeniedFolder[], path: string, name: string): DeniedFolder[] {
  return list.some((item) => samePath(item.path, path)) ? list : [...list, { path, name }];
}

/** Notices shown instead of `alert()`: the app decides how to present them. */
export type FolderNotice = (message: string) => void;

interface UseFolderOpeningOptions {
  tabs: FolderTab[];
  activeTab: FolderTab | null;
  savedFolders: SavedFolder[];
  openFolderInTab: (folderPath: string, files: LogFileItem[], preferredName?: string, selectPaths?: readonly string[]) => void;
  addRestoredTabs: (tabs: FolderTab[], activePath: string | null) => void;
  setActiveTabId: (id: string) => void;
  setIsLoading: (loading: boolean) => void;
  setLoadingProgress: (progress: number) => void;
  notify: FolderNotice;
}

/**
 * Everything that opens disk folders by path (desktop app): saved folders, the previous session,
 * files sent by the system ("open with", double click) and the folders whose access was denied.
 */
export function useFolderOpening({
  tabs,
  activeTab,
  savedFolders,
  openFolderInTab,
  addRestoredTabs,
  setActiveTabId,
  setIsLoading,
  setLoadingProgress,
  notify,
}: UseFolderOpeningOptions) {
  const [deniedFolders, setDeniedFolders] = useState<DeniedFolder[]>([]);
  // The browser has no session to restore (and none is saved).
  const [isSessionRestored, setIsSessionRestored] = useState(() => !capabilities.readsFoldersByPath);

  const openSavedFolder = async (folderPath: string, folderName: string) => {
    const existing = tabs.find((tab) => samePath(tab.folderPath, folderPath));
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const api = desktop();
    if (!api?.readFolder) {
      notify(
        `Para abrir a pasta "${folderPath}" no navegador, use o botão "Abrir pasta" para conceder permissão de leitura. No aplicativo desktop, as pastas salvas abrem diretamente.`
      );
      return;
    }
    try {
      setIsLoading(true);
      setLoadingProgress(10);
      const nativeFiles = await api.readFolder(folderPath);
      setDeniedFolders((current) => current.filter((item) => !samePath(item.path, folderPath)));
      if (nativeFiles.length === 0) {
        notify(`A pasta ${folderPath} não contém arquivos de log compatíveis.`);
        return;
      }
      openFolderInTab(folderPath, nativeFilesToItems(nativeFiles, 'electron'), folderName);
    } catch (error) {
      if (desktopErrorCode(error) === 'FOLDER_DENIED') {
        setDeniedFolders((current) => withDeniedFolder(current, folderPath, folderName));
        return;
      }
      console.error('Erro ao ler pasta nativamente:', error);
      notify(`Erro ao abrir pasta: ${(error as Error)?.message || error}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Each requested file opens its folder in a tab (or reuses the tab) with that file selected.
  const openLaunchPaths = useCallback(
    async (batch: LaunchPath[]) => {
      const api = desktop();
      if (!api?.readFolder) return;
      const folders = new Map<string, LaunchPath[]>();
      for (const item of batch) {
        const key = [...folders.keys()].find((folder) => samePath(folder, item.folder)) ?? item.folder;
        folders.set(key, [...(folders.get(key) ?? []), item]);
      }
      for (const [folder, items] of folders) {
        try {
          const files = nativeFilesToItems(await api.readFolder(folder), `launch-${Date.now()}`);
          if (files.length === 0) {
            notify(`A pasta ${folder} não contém arquivos de log compatíveis.`);
            continue;
          }
          openFolderInTab(folder, files, undefined, items.filter((item) => !item.isDirectory).map((item) => item.path));
        } catch (error) {
          notify(`Não foi possível abrir ${folder}: ${(error as Error)?.message || error}`);
        }
      }
    },
    [openFolderInTab, notify]
  );

  // Paths the system asked to open: queued at startup by the main process, or sent while running.
  useEffect(() => {
    const api = desktop();
    if (!api?.takeLaunchPaths) return;
    const unsubscribe = api.onOpenPaths?.((paths) => void openLaunchPaths(paths));
    api.takeLaunchPaths().then((paths) => {
      if (paths.length > 0) void openLaunchPaths(paths);
    }, () => {});
    return unsubscribe;
  }, [openLaunchPaths]);

  // Restore the tabs that were open in the last desktop session (once, at startup).
  // First run after the update (no session saved yet): reopen only the favorite folders.
  const [initialSavedFolders] = useState(savedFolders);
  useEffect(() => {
    const api = desktop();
    if (!api?.readFolder) return;
    let cancelled = false;
    const session = loadPersistedSession();
    const toRestore: PersistedTab[] = session
      ? session.tabs
      : initialSavedFolders.filter((folder) => folder.isFavorite).map((folder) => ({ path: folder.path, name: folder.name, selectedPaths: [] }));

    const restore = async () => {
      // Folders saved before the app asked for folder access keep working without a prompt
      // (the main process accepts this list only once, on the first run of that version).
      const known = [...initialSavedFolders.map((folder) => folder.path), ...(session?.tabs.map((tab) => tab.path) ?? [])];
      await (api.importKnownFolders?.(known).catch(() => false) ?? Promise.resolve(false));
      if (toRestore.length === 0 || cancelled) return;

      setIsLoading(true);
      setLoadingProgress(0);
      const restored: FolderTab[] = [];
      for (let index = 0; index < toRestore.length; index++) {
        // Unmounted meanwhile (development double mount): stop before asking for more folders.
        if (cancelled) return;
        const persisted = toRestore[index];
        if (!restored.some((tab) => samePath(tab.folderPath, persisted.path))) {
          try {
            const nativeFiles = await api.readFolder(persisted.path);
            if (nativeFiles.length > 0) {
              const files = sortFilesByName(nativeFilesToItems(nativeFiles, `restored-${index}`), true);
              const selection = selectByPaths(files, persisted.selectedPaths);
              restored.push(createFolderTab(`restored-tab-${index}-${Date.now()}`, persisted.name, persisted.path, files, selection.length > 0 ? selection : undefined));
            }
          } catch (error) {
            if (desktopErrorCode(error) === 'FOLDER_DENIED') setDeniedFolders((current) => withDeniedFolder(current, persisted.path, persisted.name));
            else console.warn(`Não foi possível restaurar a pasta "${persisted.path}".`, error);
          }
        }
        setLoadingProgress(Math.round(((index + 1) / toRestore.length) * 100));
      }
      if (cancelled) return;
      addRestoredTabs(restored, session?.activePath ?? null);
      setIsLoading(false);
    };
    void restore().finally(() => {
      if (!cancelled) setIsSessionRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initialSavedFolders, addRestoredTabs, setIsLoading, setLoadingProgress]);

  // Persist which disk folders are open (and their selection) for the next session.
  useEffect(() => {
    if (!isSessionRestored || !capabilities.readsFoldersByPath) return;
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
  }, [isSessionRestored, tabs, activeTab]);

  return { deniedFolders, dismissDeniedFolders: () => setDeniedFolders([]), openSavedFolder };
}
