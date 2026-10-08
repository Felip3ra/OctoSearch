import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Copy, ExternalLink,
  FileText, Folder, FolderOpen, Layers, ListChecks, Minus, Search,
  SlidersHorizontal, SquareMousePointer, X,
} from 'lucide-react';
import { FileSortField, LogFileItem, SortDirection } from '../types';
import { sortFiles } from '../utils/fileSorter';

interface FileListProps {
  files: LogFileItem[];
  rootPath?: string;
  selectedFileIds: string[];
  onSelectionChange: (fileIds: string[]) => void;
  sourceColors?: Map<string, string>;
  sortField: FileSortField;
  sortDirection: SortDirection;
  onOpenSortSettings: () => void;
}

interface FolderNode {
  name: string;
  treePath: string;
  absolutePath: string;
  folders: Map<string, FolderNode>;
  files: LogFileItem[];
}

type ContextTarget =
  | { kind: 'file'; file: LogFileItem }
  | { kind: 'folder'; folder: FolderNode };

type CheckState = 'checked' | 'mixed' | 'unchecked';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function relativePathOf(file: LogFileItem): string {
  const relativePath = file.relativePath || file.name;
  let start = 0;
  while (start < relativePath.length && (relativePath[start] === '/' || relativePath[start] === '\\')) {
    start++;
  }
  return relativePath.slice(start).replaceAll('/', '\\');
}

function trimTrailingSeparators(path: string): string {
  let end = path.length;
  while (end > 0 && (path[end - 1] === '/' || path[end - 1] === '\\')) {
    end--;
  }
  return path.slice(0, end);
}

function sortFolders(folders: Iterable<FolderNode>, field: FileSortField, direction: SortDirection): FolderNode[] {
  return Array.from(folders).sort((a, b) =>
    field === 'name' && direction === 'desc'
      ? b.name.localeCompare(a.name, 'pt-BR')
      : a.name.localeCompare(b.name, 'pt-BR')
  );
}

/** Files under a folder in the same order they are rendered in the tree. */
function collectFolderFiles(folder: FolderNode, field: FileSortField, direction: SortDirection): LogFileItem[] {
  return [
    ...sortFolders(folder.folders.values(), field, direction).flatMap((child) =>
      collectFolderFiles(child, field, direction)
    ),
    ...sortFiles(folder.files, field, direction),
  ];
}

function getCheckState(files: LogFileItem[], selected: Set<string>): CheckState {
  const count = files.filter((file) => selected.has(file.id)).length;
  if (count === 0) return 'unchecked';
  return count === files.length ? 'checked' : 'mixed';
}

function Checkbox({ state, color }: Readonly<{ state: CheckState; color?: string }>) {
  const isOn = state !== 'unchecked';
  return (
    <span
      aria-hidden="true"
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
        isOn
          ? 'border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500'
          : 'border-slate-300 bg-white group-hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900'
      }`}
      style={isOn && color ? { backgroundColor: color, borderColor: color } : undefined}
    >
      {state === 'checked' && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
      {state === 'mixed' && <Minus className="h-2.5 w-2.5" strokeWidth={3.5} />}
    </span>
  );
}

export function FileList({
  files, rootPath = '', selectedFileIds, onSelectionChange, sourceColors,
  sortField, sortDirection, onOpenSortSettings,
}: Readonly<FileListProps>) {
  const [fileSearch, setFileSearch] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ target: ContextTarget; x: number; y: number } | null>(null);
  const anchorIdRef = useRef<string | null>(null);

  const selected = useMemo(() => new Set(selectedFileIds), [selectedFileIds]);

  const visibleFiles = useMemo(() => {
    const search = fileSearch.trim().toLocaleLowerCase('pt-BR');
    return search
      ? files.filter((file) => relativePathOf(file).toLocaleLowerCase('pt-BR').includes(search))
      : files;
  }, [fileSearch, files]);

  const tree = useMemo(() => {
    const root: FolderNode = { name: '', treePath: '', absolutePath: rootPath, folders: new Map(), files: [] };
    for (const file of visibleFiles) {
      const parts = relativePathOf(file).split('\\').filter(Boolean);
      let current = root;
      for (const part of parts.slice(0, -1)) {
        const treePath = current.treePath ? `${current.treePath}\\${part}` : part;
        let child = current.folders.get(part);
        if (!child) {
          child = {
            name: part,
            treePath,
            absolutePath: rootPath ? `${trimTrailingSeparators(rootPath)}\\${treePath}` : treePath,
            folders: new Map(),
            files: [],
          };
          current.folders.set(part, child);
        }
        current = child;
      }
      current.files.push(file);
    }
    return root;
  }, [rootPath, visibleFiles]);

  const orderedFiles = useMemo(
    () => collectFolderFiles(tree, sortField, sortDirection),
    [tree, sortField, sortDirection]
  );

  useEffect(() => {
    const paths = new Set<string>();
    files.forEach((file) => {
      let current = '';
      relativePathOf(file).split('\\').slice(0, -1).forEach((part) => {
        current = current ? `${current}\\${part}` : part;
        paths.add(current);
      });
    });
    setExpandedFolders((previous) => new Set([...previous, ...paths]));
  }, [files]);

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

  /** Emits the new selection keeping the folder's file order (stable merge tie-breaks). */
  const commitSelection = (ids: Set<string>) => {
    onSelectionChange(files.filter((file) => ids.has(file.id)).map((file) => file.id));
  };

  const toggleFiles = (targets: LogFileItem[]) => {
    const next = new Set(selected);
    const allSelected = targets.every((file) => next.has(file.id));
    targets.forEach((file) => (allSelected ? next.delete(file.id) : next.add(file.id)));
    commitSelection(next);
  };

  const handleFileClick = (event: React.MouseEvent, file: LogFileItem) => {
    const isAdditive = event.ctrlKey || event.metaKey;

    if (event.shiftKey && anchorIdRef.current) {
      const anchorIndex = orderedFiles.findIndex((item) => item.id === anchorIdRef.current);
      const targetIndex = orderedFiles.findIndex((item) => item.id === file.id);
      if (anchorIndex !== -1 && targetIndex !== -1) {
        const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
        const next = isAdditive ? new Set(selected) : new Set<string>();
        orderedFiles.slice(start, end + 1).forEach((item) => next.add(item.id));
        commitSelection(next);
        return;
      }
    }

    anchorIdRef.current = file.id;
    if (isAdditive) {
      toggleFiles([file]);
    } else {
      onSelectionChange([file.id]);
    }
  };

  const handleCheckboxClick = (event: React.MouseEvent, file: LogFileItem) => {
    event.stopPropagation();
    anchorIdRef.current = file.id;
    toggleFiles([file]);
  };

  const toggleFolder = (treePath: string) => {
    setExpandedFolders((previous) => {
      const next = new Set(previous);
      if (next.has(treePath)) next.delete(treePath); else next.add(treePath);
      return next;
    });
  };

  const openContextMenu = (event: React.MouseEvent, target: ContextTarget) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ target, x: Math.min(event.clientX, window.innerWidth - 230), y: Math.min(event.clientY, window.innerHeight - 200) });
  };

  const handleListKeyDown = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      commitSelection(new Set([...selected, ...orderedFiles.map((file) => file.id)]));
    }
  };

  const allState = getCheckState(orderedFiles, selected);
  const selectedCount = selectedFileIds.length;

  const renderFile = (file: LogFileItem, depth: number) => {
    const isSelected = selected.has(file.id);
    const color = selectedCount > 1 ? sourceColors?.get(file.id) : undefined;
    const displayedDate = sortField === 'createdAt' ? file.createdAt ?? file.lastModified : file.lastModified;
    const displayedDateLabel = sortField === 'createdAt' ? 'Criado' : 'Modificado';
    return (
      <div
        key={file.id}
        id={`file-item-${file.id}`}
        role="option"
        aria-selected={isSelected}
        tabIndex={-1}
        onClick={(event) => handleFileClick(event, file)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleFiles([file]);
          }
        }}
        onContextMenu={(event) => openContextMenu(event, { kind: 'file', file })}
        className={`group relative mx-1.5 flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 transition-colors ${
          isSelected
            ? 'bg-sky-500/10 text-slate-900 dark:bg-sky-400/10 dark:text-slate-50'
            : 'text-slate-600 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800/70'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        title={`${file.path}\n${displayedDateLabel}: ${formatDate(displayedDate)} · ${formatFileSize(file.size)}`}
      >
        <button
          type="button"
          tabIndex={-1}
          onClick={(event) => handleCheckboxClick(event, file)}
          className="-m-1 p-1"
          aria-label={isSelected ? `Remover ${file.name} da seleção` : `Adicionar ${file.name} à seleção`}
        >
          <Checkbox state={isSelected ? 'checked' : 'unchecked'} color={color} />
        </button>
        <FileText className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500'}`} />
        <div className="min-w-0 flex-1">
          <div className={`truncate font-mono text-[11.5px] ${isSelected ? 'font-semibold' : ''}`}>{file.name}</div>
          <div className="truncate text-[10px] text-slate-400 dark:text-slate-500">
            {formatDate(displayedDate)} · {formatFileSize(file.size)}
          </div>
        </div>
      </div>
    );
  };

  const renderFolder = (folder: FolderNode, depth: number): React.ReactNode => {
    const isExpanded = Boolean(fileSearch.trim()) || expandedFolders.has(folder.treePath);
    const folderFiles = collectFolderFiles(folder, sortField, sortDirection);
    const state = getCheckState(folderFiles, selected);
    return (
      <React.Fragment key={folder.treePath}>
        <div
          role="treeitem"
          aria-expanded={isExpanded}
          aria-selected={state === 'checked'}
          tabIndex={-1}
          onClick={() => toggleFolder(folder.treePath)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') toggleFolder(folder.treePath);
          }}
          onContextMenu={(event) => openContextMenu(event, { kind: 'folder', folder })}
          className="group mx-1.5 flex cursor-pointer items-center gap-1.5 rounded-md py-1 pr-2 text-xs font-medium text-slate-700 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800/70"
          style={{ paddingLeft: `${4 + depth * 14}px` }}
        >
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
          <button
            type="button"
            tabIndex={-1}
            onClick={(event) => { event.stopPropagation(); toggleFiles(folderFiles); }}
            className="-m-1 p-1"
            aria-label={`Selecionar todos os arquivos de ${folder.name}`}
            title="Selecionar/desmarcar todos os arquivos desta pasta"
          >
            <Checkbox state={state} />
          </button>
          {isExpanded ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          <span className="rounded-full bg-slate-200/80 px-1.5 text-[10px] tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">{folderFiles.length}</span>
        </div>
        {isExpanded && (
          <div>
            {sortFolders(folder.folders.values(), sortField, sortDirection).map((child) => renderFolder(child, depth + 1))}
            {sortFiles(folder.files, sortField, sortDirection).map((file) => renderFile(file, depth + 1))}
          </div>
        )}
      </React.Fragment>
    );
  };

  let sortLabel = 'Modificação';
  if (sortField === 'name') sortLabel = 'Nome';
  else if (sortField === 'createdAt') sortLabel = 'Criação';

  const menuItemClass = 'flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800';
  const contextFile = contextMenu?.target.kind === 'file' ? contextMenu.target.file : null;
  const contextFolder = contextMenu?.target.kind === 'folder' ? contextMenu.target.folder : null;
  const targetPath = contextFile?.path || contextFolder?.absolutePath || '';

  return (
    <aside className="flex h-52 w-full shrink-0 select-none flex-col border-b border-slate-200 bg-slate-50 md:h-auto md:w-72 md:border-b-0 md:border-r dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Arquivos</span>
          <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{files.length}</span>
        </div>
        <button
          type="button"
          onClick={onOpenSortSettings}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          title="Configurar ordenação dos arquivos"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>{sortLabel}</span>
          {sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={fileSearch}
            onChange={(event) => setFileSearch(event.target.value)}
            placeholder="Filtrar arquivos..."
            className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          {fileSearch && (
            <button type="button" onClick={() => setFileSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Limpar filtro">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {files.length > 0 && (
        <div className="mx-3 mb-1 flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
          <button
            type="button"
            onClick={() => toggleFiles(orderedFiles)}
            disabled={orderedFiles.length === 0}
            className="group flex items-center gap-2 rounded-md py-0.5 pr-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-100"
            title="Selecionar todos os arquivos visíveis (Ctrl+A na lista)"
          >
            <Checkbox state={allState} />
            {fileSearch ? `Todos os filtrados (${orderedFiles.length})` : 'Selecionar todos'}
          </button>
          {selectedCount > 0 && (
            <span className="ml-auto rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-sky-700 dark:text-sky-300">
              {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      <div
        role="listbox"
        aria-multiselectable="true"
        aria-label="Arquivos de log"
        tabIndex={0}
        onKeyDown={handleListKeyDown}
        className="flex-1 space-y-px overflow-y-auto py-1 focus:outline-none"
      >
        {orderedFiles.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-400">
            {fileSearch ? `Nenhum arquivo encontrado para “${fileSearch}”.` : 'Abra uma pasta para listar os arquivos .log, .txt e logs rotacionados.'}
          </div>
        ) : (
          <>
            {sortFolders(tree.folders.values(), sortField, sortDirection).map((folder) => renderFolder(folder, 0))}
            {sortFiles(tree.files, sortField, sortDirection).map((file) => renderFile(file, 0))}
          </>
        )}
      </div>

      {selectedCount > 1 ? (
        <div className="m-2 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-[11px] text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
          <Layers className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 leading-tight">
            <strong>{selectedCount} arquivos</strong> consolidados em ordem cronológica
          </span>
          <button type="button" onClick={() => onSelectionChange([])} className="shrink-0 rounded px-1.5 py-0.5 font-semibold hover:bg-sky-100 dark:hover:bg-sky-900/50">
            Limpar
          </button>
        </div>
      ) : (
        <div className="hidden items-center justify-center gap-1.5 border-t border-slate-200 px-2 py-2 text-[10px] text-slate-400 md:flex dark:border-slate-800">
          <SquareMousePointer className="h-3 w-3" />
          Ctrl+clique ou Shift+clique para selecionar vários
        </div>
      )}

      {contextMenu && (
        <div role="menu" tabIndex={-1} className="fixed z-50 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-xs text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="truncate border-b border-slate-100 px-3 py-1.5 font-mono text-[10px] text-slate-400 dark:border-slate-800" title={targetPath}>
            {contextFile ? contextFile.name : contextFolder?.name}
          </div>
          {contextFile && (
            <>
              <button type="button" role="menuitem" onClick={() => { onSelectionChange([contextFile.id]); setContextMenu(null); }} className={menuItemClass}>
                <FileText className="h-3.5 w-3.5" /> Abrir somente este
              </button>
              <button type="button" role="menuitem" onClick={() => { toggleFiles([contextFile]); setContextMenu(null); }} className={menuItemClass}>
                <ListChecks className="h-3.5 w-3.5" /> {selected.has(contextFile.id) ? 'Remover da seleção' : 'Adicionar à seleção'}
              </button>
            </>
          )}
          {contextFolder && (
            <>
              <button type="button" role="menuitem" onClick={() => { onSelectionChange(collectFolderFiles(contextFolder, sortField, sortDirection).map((file) => file.id)); setContextMenu(null); }} className={menuItemClass}>
                <Layers className="h-3.5 w-3.5" /> Ver somente esta pasta
              </button>
              <button type="button" role="menuitem" onClick={() => { toggleFolder(contextFolder.treePath); setContextMenu(null); }} className={menuItemClass}>
                <FolderOpen className="h-3.5 w-3.5" /> Expandir ou recolher
              </button>
            </>
          )}
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <button type="button" role="menuitem" onClick={() => { void navigator.clipboard.writeText(targetPath); setContextMenu(null); }} className={menuItemClass}>
            <Copy className="h-3.5 w-3.5" /> Copiar caminho
          </button>
          {window.electronAPI?.openInExplorer && (
            <button type="button" role="menuitem" onClick={() => { void window.electronAPI?.openInExplorer?.(targetPath); setContextMenu(null); }} className={menuItemClass}>
              <ExternalLink className="h-3.5 w-3.5" /> Mostrar no Explorer
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
