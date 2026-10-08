import React, { useEffect, useRef, useState } from 'react';
import { FolderTab, LogFileItem, SavedFolder } from '../types';
import { sortFilesByName } from '../utils/fileSorter';
import { isSupportedLogFileName, nativeFilesToItems } from '../utils/logFile';
import {
  Folder,
  FolderOpen,
  Plus,
  X,
  Monitor,
  Star,
  Bookmark,
  ChevronDown,
  Clock,
  Moon,
  Sun,
  Copy,
  ExternalLink,
  Pencil,
  Check,
  ScanSearch,
  Settings,
} from 'lucide-react';

interface FolderTabsProps {
  tabs: FolderTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onOpenNewFolder: (folderPath: string, files: LogFileItem[]) => void;
  onRenameFolder: (tabId: string, alias: string) => void;
  onOpenDesktopModal: () => void;
  savedFolders: SavedFolder[];
  onOpenSavedFolder: (folderPath: string, folderName: string) => void;
  onToggleFavoriteFolder: (folderId: string) => void;
  onToggleActiveFavorite: () => void;
  onOpenSavedFoldersModal: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

const iconButtonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer';
const menuItemClass = 'flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800';

export function FolderTabs({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onOpenNewFolder,
  onRenameFolder,
  onOpenDesktopModal,
  savedFolders,
  onOpenSavedFolder,
  onToggleFavoriteFolder,
  onToggleActiveFavorite,
  onOpenSavedFoldersModal,
  isDarkMode,
  onToggleTheme,
  onOpenSettings,
}: Readonly<FolderTabsProps>) {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showQuickDropdown, setShowQuickDropdown] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ tab: FolderTab; x: number; y: number } | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState('');

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const currentSaved = activeTab
    ? savedFolders.find((f) => f.path.toLowerCase() === activeTab.folderPath.toLowerCase())
    : null;
  const isCurrentFavorite = currentSaved?.isFavorite ?? false;
  const isDesktop = Boolean(window.electronAPI?.isElectron);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!showQuickDropdown) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setShowQuickDropdown(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowQuickDropdown(false);
    };
    window.addEventListener('mousedown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [showQuickDropdown]);

  const openContextMenu = (event: React.MouseEvent, tab: FolderTab) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      tab,
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 220),
    });
  };

  // Directory picker fallback (<input webkitdirectory>)
  const handleDirectoryInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const validFiles = Array.from(fileList).filter((f) => isSupportedLogFileName(f.name));
    if (validFiles.length === 0) {
      alert('Nenhum arquivo .log, .txt ou log rotacionado foi encontrado na pasta selecionada.');
      return;
    }

    const parts = validFiles[0].webkitRelativePath?.split('/') || [];
    const folderPath = `C:\\Logs\\${parts.length > 1 ? parts[0] : 'NovaPasta'}`;
    const stamp = Date.now();

    const logFileItems: LogFileItem[] = validFiles.map((file, idx) => {
      const relativePath = file.webkitRelativePath
        ? file.webkitRelativePath.split('/').slice(1).join('\\') || file.name
        : file.name;
      return {
        id: `local-${stamp}-${idx}-${file.name}`,
        name: file.name,
        relativePath,
        path: `${folderPath}\\${relativePath}`,
        size: file.size,
        lastModified: file.lastModified,
        file,
      };
    });

    onOpenNewFolder(folderPath, sortFilesByName(logFileItems, true));
    e.target.value = '';
  };

  const selectElectronFolder = async (): Promise<boolean> => {
    if (!window.electronAPI?.selectFolder) return false;
    try {
      const result = await window.electronAPI.selectFolder();
      if (!result) return true;
      if (result.files.length === 0) {
        alert(`A pasta selecionada (${result.folderPath}) não contém arquivos de log compatíveis.`);
        return true;
      }
      onOpenNewFolder(result.folderPath, nativeFilesToItems(result.files, 'electron'));
      return true;
    } catch (error: unknown) {
      console.error('Erro na seleção nativa do Electron:', error);
      return false;
    }
  };

  const selectBrowserFolder = async (): Promise<boolean> => {
    if (!('showDirectoryPicker' in window)) return false;
    try {
      // @ts-expect-error standard in modern desktop browsers
      const dirHandle = await window.showDirectoryPicker();
      const collectedFiles: LogFileItem[] = [];
      const folderPath = `C:\\Logs\\${dirHandle.name}`;
      const stamp = Date.now();

      const collectDirectory = async (handle: any, relativeDirectory = ''): Promise<void> => {
        for await (const entry of handle.values()) {
          const relativePath = relativeDirectory ? `${relativeDirectory}\\${entry.name}` : entry.name;
          if (entry.kind === 'directory') {
            await collectDirectory(entry, relativePath);
            continue;
          }
          if (entry.kind !== 'file' || !isSupportedLogFileName(entry.name)) continue;
          const file = await entry.getFile();
          collectedFiles.push({
            id: `dir-${stamp}-${relativePath}`,
            name: entry.name,
            relativePath,
            path: `${folderPath}\\${relativePath}`,
            size: file.size,
            lastModified: file.lastModified,
            file,
          });
        }
      };

      await collectDirectory(dirHandle);
      if (collectedFiles.length === 0) {
        alert('A pasta selecionada não contém arquivos .log, .txt ou logs rotacionados.');
        return true;
      }

      onOpenNewFolder(folderPath, collectedFiles);
      return true;
    } catch (error: unknown) {
      return (error as Error)?.name === 'AbortError';
    }
  };

  const triggerDirectoryPicker = async () => {
    if (await selectElectronFolder()) return;
    if (await selectBrowserFolder()) return;
    folderInputRef.current?.click();
  };

  const quickList = [...savedFolders]
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || b.lastAccessed - a.lastAccessed)
    .slice(0, 8);
  const contextSavedFolder = contextMenu
    ? savedFolders.find((folder) => folder.path.toLowerCase() === contextMenu.tab.folderPath.toLowerCase())
    : null;

  const startEditingAlias = (tab: FolderTab) => {
    setEditingTabId(tab.id);
    setAliasDraft(tab.folderName);
    setContextMenu(null);
  };

  const finishEditingAlias = (tabId: string) => {
    const normalizedAlias = aliasDraft.trim();
    if (normalizedAlias) onRenameFolder(tabId, normalizedAlias);
    setEditingTabId(null);
    setAliasDraft('');
  };

  return (
    <header className="relative flex select-none flex-col border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80">
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error standard in HTML5 browsers
        webkitdirectory="true"
        multiple
        className="hidden"
        onChange={handleDirectoryInputChange}
      />

      {/* Row 1: brand, folder tabs and global actions */}
      <div className="flex h-12 items-center gap-2 px-3">
        <div className="flex shrink-0 items-center gap-2 pr-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-sky-500 to-indigo-600 text-white shadow-sm shadow-sky-500/30">
            <ScanSearch className="h-4 w-4" />
          </div>
          <span className="hidden text-sm font-semibold tracking-tight text-slate-900 sm:inline dark:text-white">OctoSearch</span>
        </div>

        <div role="tablist" aria-label="Pastas abertas" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain py-1">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                id={`folder-tab-${tab.id}`}
                role="tab"
                tabIndex={0}
                aria-selected={isActive}
                onClick={() => onSelectTab(tab.id)}
                onDoubleClick={() => startEditingAlias(tab)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelectTab(tab.id);
                }}
                onContextMenu={(event) => openContextMenu(event, tab)}
                title={`${tab.folderName}\n${tab.folderPath}\nDuplo clique para renomear`}
                className={`group flex h-8 max-w-[220px] shrink-0 cursor-pointer items-center gap-2 rounded-md px-2.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-slate-700'
                    : 'text-slate-500 hover:bg-slate-200/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
                }`}
              >
                {isActive ? (
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                ) : (
                  <Folder className="h-3.5 w-3.5 shrink-0" />
                )}

                {editingTabId === tab.id ? (
                  <form
                    className="flex min-w-0 items-center gap-1"
                    onSubmit={(event) => {
                      event.preventDefault();
                      finishEditingAlias(tab.id);
                    }}
                  >
                    <input
                      value={aliasDraft}
                      onChange={(event) => setAliasDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setEditingTabId(null);
                          setAliasDraft('');
                        }
                      }}
                      onBlur={() => finishEditingAlias(tab.id)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Apelido da pasta ${tab.folderName}`}
                      className="w-28 rounded border border-sky-400 bg-white px-1.5 py-0.5 text-xs outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-sky-600 dark:bg-slate-900"
                      autoFocus
                      maxLength={60}
                    />
                    <button type="submit" title="Salvar apelido" disabled={!aliasDraft.trim()} className="rounded p-0.5 text-emerald-600 hover:bg-emerald-100 disabled:opacity-30 dark:hover:bg-emerald-950/60">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </form>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{tab.folderName}</span>
                )}

                <span className={`shrink-0 rounded-full px-1.5 text-[10px] tabular-nums ${isActive ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'bg-slate-200/80 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {tab.files.length}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  title="Fechar pasta"
                  aria-label={`Fechar pasta ${tab.folderName}`}
                  className={`-mr-1 shrink-0 cursor-pointer rounded p-0.5 text-slate-400 transition-opacity hover:bg-slate-200 hover:text-rose-600 dark:hover:bg-slate-700 dark:hover:text-rose-400 ${isActive ? '' : 'opacity-0 group-hover:opacity-100'}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={triggerDirectoryPicker}
            title="Abrir pasta em uma nova aba"
            aria-label="Abrir pasta em uma nova aba"
            className={iconButtonClass}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {!isDesktop && (
            <button
              type="button"
              onClick={onOpenDesktopModal}
              id="btn-open-desktop-guide"
              title="Como gerar e executar como aplicativo desktop (.exe)"
              className="mr-1 hidden h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-200/70 md:inline-flex dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Monitor className="h-3.5 w-3.5" />
              Versão desktop
            </button>
          )}
          <button
            type="button"
            onClick={onToggleTheme}
            title={isDarkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
            aria-label={isDarkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
            aria-pressed={isDarkMode}
            className={iconButtonClass}
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button type="button" onClick={onOpenSettings} title="Configurações (Ctrl+,)" aria-label="Configurações" className={iconButtonClass}>
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Row 2: current folder path and folder actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
        <div
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 pl-2.5 pr-1 dark:border-slate-700/80 dark:bg-slate-950/60"
          onContextMenu={(event) => activeTab && openContextMenu(event, activeTab)}
        >
          <Folder className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 select-all truncate font-mono text-[11.5px] text-slate-700 dark:text-slate-300" title={activeTab?.folderPath}>
            {activeTab?.folderPath || 'Nenhuma pasta aberta'}
          </span>
          {activeTab && (
            <button
              type="button"
              onClick={onToggleActiveFavorite}
              className={`shrink-0 cursor-pointer rounded p-1 transition-colors hover:bg-slate-200 dark:hover:bg-slate-800 ${isCurrentFavorite ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'}`}
              title={isCurrentFavorite ? 'Remover dos favoritos' : 'Fixar esta pasta como favorita'}
            >
              <Star className={`h-3.5 w-3.5 ${isCurrentFavorite ? 'fill-amber-400' : ''}`} />
            </button>
          )}
        </div>

        <div ref={dropdownRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowQuickDropdown(!showQuickDropdown)}
            aria-expanded={showQuickDropdown}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Pastas salvas e favoritas"
          >
            <Bookmark className="h-3.5 w-3.5 text-amber-500" />
            <span className="hidden sm:inline">Pastas salvas</span>
            <span className="rounded-full bg-slate-100 px-1.5 text-[10px] tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">{savedFolders.length}</span>
            <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${showQuickDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showQuickDropdown && (
            <div className="absolute right-0 top-full z-40 mt-1.5 w-[calc(100vw-1.5rem)] max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl sm:w-96 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Favoritas e recentes</span>
                <span className="text-[10px] text-slate-400">{quickList.length} de {savedFolders.length}</span>
              </div>

              <div className="max-h-72 overflow-y-auto p-1">
                {quickList.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs text-slate-400">As pastas abertas aparecerão aqui.</div>
                )}
                {quickList.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onOpenSavedFolder(item.path, item.name);
                      setShowQuickDropdown(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {item.isFavorite ? (
                      <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{item.name}</div>
                      <div className="truncate font-mono text-[10px] text-slate-400">{item.path}</div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="border-t border-slate-100 p-1 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickDropdown(false);
                    onOpenSavedFoldersModal();
                  }}
                  className="w-full cursor-pointer rounded-lg py-1.5 text-center text-xs font-medium text-sky-600 transition-colors hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/40"
                >
                  Gerenciar pastas salvas…
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={triggerDirectoryPicker}
          id="btn-select-folder"
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-sky-600 px-3 font-medium text-white shadow-sm shadow-sky-600/20 transition-colors hover:bg-sky-700"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span>Abrir pasta</span>
        </button>
      </div>

      {contextMenu && (
        <div
          role="menu"
          className="fixed z-50 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-xs text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          tabIndex={-1}
        >
          <div className="truncate border-b border-slate-100 px-3 py-1.5 font-mono text-[10px] text-slate-400 dark:border-slate-800" title={contextMenu.tab.folderPath}>
            {contextMenu.tab.folderName}
          </div>
          <button type="button" role="menuitem" onClick={() => { onSelectTab(contextMenu.tab.id); setContextMenu(null); }} className={menuItemClass}>
            <FolderOpen className="h-3.5 w-3.5" /> Ativar pasta
          </button>
          <button type="button" role="menuitem" onClick={() => startEditingAlias(contextMenu.tab)} className={menuItemClass}>
            <Pencil className="h-3.5 w-3.5" /> Alterar apelido
          </button>
          {contextSavedFolder && (
            <button type="button" role="menuitem" onClick={() => { onToggleFavoriteFolder(contextSavedFolder.id); setContextMenu(null); }} className={menuItemClass}>
              <Star className={`h-3.5 w-3.5 ${contextSavedFolder.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />
              {contextSavedFolder.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => { void navigator.clipboard.writeText(contextMenu.tab.folderPath); setContextMenu(null); }} className={menuItemClass}>
            <Copy className="h-3.5 w-3.5" /> Copiar caminho
          </button>
          {window.electronAPI?.openInExplorer && (
            <button type="button" role="menuitem" onClick={() => { void window.electronAPI?.openInExplorer?.(contextMenu.tab.folderPath); setContextMenu(null); }} className={menuItemClass}>
              <ExternalLink className="h-3.5 w-3.5" /> Mostrar no Explorer
            </button>
          )}
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <button type="button" role="menuitem" onClick={() => { onCloseTab(contextMenu.tab.id); setContextMenu(null); }} className={`${menuItemClass} text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40`}>
            <X className="h-3.5 w-3.5" /> Fechar aba
          </button>
        </div>
      )}
    </header>
  );
}
