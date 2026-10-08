import React, { useRef, useState } from 'react';
import {
  FolderOpen,
  HardDrive,
  Star,
  Bookmark,
  ChevronDown,
  Clock,
} from 'lucide-react';
import { LogFileItem, SavedFolder } from '../types';
import { isSupportedLogFileName } from '../utils/logFile';

interface FolderSelectorProps {
  currentFolder: string;
  onFolderSelected: (folderName: string, files: LogFileItem[]) => void;
  savedFolders: SavedFolder[];
  onOpenSavedFolder: (folderPath: string, folderName: string) => void;
  onToggleFavoriteFolder: (folderId: string) => void;
  onOpenSavedFoldersModal: () => void;
}

export function FolderSelector({
  currentFolder,
  onFolderSelected,
  savedFolders,
  onOpenSavedFolder,
  onToggleFavoriteFolder,
  onOpenSavedFoldersModal,
}: Readonly<FolderSelectorProps>) {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showQuickDropdown, setShowQuickDropdown] = useState(false);

  // Check if current folder is already bookmarked/favorite
  const currentSaved = savedFolders.find(
    (f) => f.path.toLowerCase() === currentFolder.toLowerCase()
  );
  const isFavorite = currentSaved?.isFavorite ?? false;

  // Fallback / standard directory input handler via webkitdirectory
  const handleDirectoryInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesArray: File[] = Array.from(fileList);
    // Filter only .log and .txt as requested
    const validFiles = filesArray.filter((f) => {
      return isSupportedLogFileName(f.name);
    });

    if (validFiles.length === 0) {
      alert('Nenhum arquivo .log, .txt ou log rotacionado foi encontrado na pasta selecionada.');
      return;
    }

    // Determine folder path
    const relativePath = validFiles[0].webkitRelativePath;
    let folderPath = currentFolder;
    if (relativePath) {
      const parts = relativePath.split('/');
      if (parts.length > 1) {
        folderPath = `C:\\Logs\\${parts[0]}`;
      }
    }

    // Map to LogFileItem
    const logFileItems: LogFileItem[] = validFiles.map((file, idx) => ({
      id: `local-${idx}-${file.name}`,
      name: file.name,
      path: `${folderPath}\\${file.name}`,
      size: file.size,
      lastModified: file.lastModified,
      file,
    }));

    // Sort by most recent first
    logFileItems.sort((a, b) => b.lastModified - a.lastModified);

    onFolderSelected(folderPath, logFileItems);
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

      const logFileItems: LogFileItem[] = result.files.map((file, idx) => ({
        id: `electron-${idx}-${file.name}`,
        name: file.name,
        path: file.path,
        relativePath: file.relativePath,
        size: file.size,
        createdAt: file.createdAt,
        lastModified: file.lastModified,
      }));
      onFolderSelected(result.folderPath, logFileItems);
      return true;
    } catch (error: unknown) {
      console.error('Falha na seleção nativa do Electron:', error);
      return false;
    }
  };

  const selectBrowserFolder = async (): Promise<boolean> => {
    if (!('showDirectoryPicker' in window)) return false;
    try {
      // @ts-expect-error showDirectoryPicker is standard in modern browsers
      const dirHandle = await window.showDirectoryPicker();
      const collectedFiles: LogFileItem[] = [];
      const folderPath = `C:\\Logs\\${dirHandle.name}`;

      for await (const entry of dirHandle.values()) {
        if (entry.kind !== 'file' || !isSupportedLogFileName(entry.name)) continue;
        const file = await entry.getFile();
        collectedFiles.push({
          id: `dir-${entry.name}`,
          name: entry.name,
          path: `${folderPath}\\${entry.name}`,
          size: file.size,
          lastModified: file.lastModified,
          file,
        });
      }

      if (collectedFiles.length === 0) {
        alert('A pasta selecionada não contém arquivos .log, .txt ou logs rotacionados.');
        return true;
      }

      collectedFiles.sort((a, b) => b.lastModified - a.lastModified);
      onFolderSelected(folderPath, collectedFiles);
      return true;
    } catch (error: unknown) {
      return (error as Error)?.name === 'AbortError';
    }
  };

  const handleSelectFolderClick = async () => {
    if (await selectElectronFolder()) return;
    if (await selectBrowserFolder()) return;
    folderInputRef.current?.click();
  };

  const handleToggleCurrentFavorite = () => {
    if (currentSaved) {
      onToggleFavoriteFolder(currentSaved.id);
    } else {
      onFolderSelected(currentFolder, []); // updates/saves record
      // After save, the record will be available in next render
    }
  };

  // Top 5 recent/favorite folders for quick dropdown
  const quickList = savedFolders.slice(0, 6);

  return (
    <div className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 px-3 py-2 flex flex-wrap items-center justify-between gap-3 text-xs relative">
      {/* Hidden inputs for browser fallbacks */}
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is standard in HTML5 browsers
        webkitdirectory="true"
        multiple
        className="hidden"
        onChange={handleDirectoryInputChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleDirectoryInputChange}
      />

      {/* Left: Folder Path Display & Quick Favorites */}
      <div className="flex items-center gap-2 flex-1 min-w-[320px]">
        <HardDrive className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
        <span className="font-semibold text-slate-700 dark:text-slate-300 select-none">
          Pasta:
        </span>

        {/* Path Display with Star button */}
        <div className="flex-1 flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 font-mono text-slate-800 dark:text-slate-200 shadow-2xs min-w-0">
          <span className="truncate flex-1 select-all" title={currentFolder}>
            {currentFolder}
          </span>

          <button
            type="button"
            onClick={handleToggleCurrentFavorite}
            className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-1.5 shrink-0 ${
              isFavorite
                ? 'text-amber-500'
                : 'text-slate-400 hover:text-amber-500'
            }`}
            title={isFavorite ? 'Remover dos favoritos' : 'Fixar pasta como favorita'}
          >
            <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-500 text-amber-500' : ''}`} />
          </button>
        </div>

        {/* Quick Recent Dropdown Toggle */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowQuickDropdown(!showQuickDropdown)}
            className="px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded flex items-center gap-1 transition-colors cursor-pointer"
            title="Ver pastas recentes e favoritas"
          >
            <Bookmark className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-medium hidden sm:inline">Salvas</span>
            <span className="bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 px-1 rounded-full text-[10px] font-bold">
              {savedFolders.length}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {/* Quick Dropdown Menu */}
          {showQuickDropdown && (
            <div
              className="absolute left-0 top-full mt-1 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                <span>Pastas Recentes / Favoritas</span>
                <span className="text-[10px] lowercase text-sky-600 dark:text-sky-400 font-normal">
                  {quickList.length} de {savedFolders.length}
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto py-1">
                {quickList.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onOpenSavedFolder(item.path, item.name);
                      setShowQuickDropdown(false);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2 transition-colors group cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {item.isFavorite ? (
                          <Star className="w-3 h-3 fill-amber-500 text-amber-500 shrink-0" />
                        ) : (
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        )}
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate text-[11px]">
                          {item.name}
                        </span>
                      </div>
                      <p className="font-mono text-[10px] text-slate-400 truncate pl-4.5">
                        {item.path}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="px-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    onOpenSavedFoldersModal();
                    setShowQuickDropdown(false);
                  }}
                  className="w-full py-1 text-center text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded transition-colors"
                >
                  Gerenciar todas as pastas salvas...
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSelectFolderClick}
          id="btn-select-folder"
          className="bg-sky-700 hover:bg-sky-800 text-white font-medium px-3 py-1.5 rounded shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Selecionar pasta</span>
        </button>

      </div>
    </div>
  );
}
