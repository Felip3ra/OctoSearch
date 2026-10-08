import React, { useState } from 'react';
import {
  Folder,
  Star,
  Clock,
  Trash2,
  X,
  Plus,
  Search,
  Check,
  FolderOpen,
  Monitor,
} from 'lucide-react';
import { SavedFolder } from '../types';

interface SavedFoldersModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedFolders: SavedFolder[];
  currentFolderPath: string;
  onOpenFolder: (folderPath: string, folderName: string) => void;
  onToggleFavorite: (folderId: string) => void;
  onRemoveFolder: (folderId: string) => void;
  onAddManualFolder: (folderPath: string) => void;
}

export function SavedFoldersModal({
  isOpen,
  onClose,
  savedFolders,
  currentFolderPath,
  onOpenFolder,
  onToggleFavorite,
  onRemoveFolder,
  onAddManualFolder,
}: Readonly<SavedFoldersModalProps>) {
  const [filterQuery, setFilterQuery] = useState('');
  const [newFolderPath, setNewFolderPath] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const isElectron = Boolean(window.electronAPI?.isElectron);

  if (!isOpen) return null;

  const handleAddSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newFolderPath.trim()) return;
    onAddManualFolder(newFolderPath.trim());
    setNewFolderPath('');
    setShowAddInput(false);
  };

  const filtered = savedFolders.filter((item) => {
    const q = filterQuery.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q);
  });

  const favorites = filtered.filter((f) => f.isFavorite);
  const recents = filtered.filter((f) => !f.isFavorite);

  const formatLastAccessed = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Agora mesmo';
    if (mins < 60) return `Há ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Há ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Há ${days}d`;
  };

  let recentFoldersContent: React.ReactNode;
  if (recents.length > 0) {
    recentFoldersContent = (
      <div className="grid grid-cols-1 gap-2">
        {recents.map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            isCurrent={folder.path.toLowerCase() === currentFolderPath.toLowerCase()}
            onOpen={() => {
              onOpenFolder(folder.path, folder.name);
              onClose();
            }}
            onToggleFavorite={() => onToggleFavorite(folder.id)}
            onRemove={() => onRemoveFolder(folder.id)}
            formatTime={formatLastAccessed}
          />
        ))}
      </div>
    );
  } else if (favorites.length > 0) {
    recentFoldersContent = (
      <p className="text-xs text-slate-400 italic">Todas as pastas salvas foram favoritadas acima.</p>
    );
  } else {
    recentFoldersContent = (
      <div className="text-center py-8 text-slate-500 dark:text-slate-400">
        <Folder className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
        <p className="text-sm font-medium">Nenhuma pasta encontrada</p>
        <p className="text-xs mt-1">
          Selecione uma pasta de logs no topo da tela ou clique em &quot;Adicionar Caminho&quot; para registrar.
        </p>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4"
    >
      <button
        type="button"
        aria-label="Fechar pastas salvas"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        className="relative z-10 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[95dvh] sm:max-h-[85vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-600/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Pastas Salvas e Histórico
                {isElectron && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 flex items-center gap-1">
                    <Monitor className="w-2.5 h-2.5" /> Desktop Nativo
                  </span>
                )}
              </h2>
              <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">
                Acesse suas pastas de logs do Windows com 1 clique ou favorite os diretórios mais frequentes.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar: Search and Add */}
        <div className="px-3 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900">
          <div className="relative flex-1 min-w-0 w-full sm:min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Buscar por nome ou caminho da pasta..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAddInput(!showAddInput)}
            className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 border border-sky-200 dark:border-sky-800 transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar Caminho</span>
          </button>
        </div>

        {/* Add Manual Folder Form */}
        {showAddInput && (
          <form
            onSubmit={handleAddSubmit}
            className="px-3 sm:px-5 py-3 bg-sky-50/70 dark:bg-sky-950/20 border-b border-sky-100 dark:border-sky-900/30 flex flex-wrap sm:flex-nowrap items-center gap-2"
          >
            <input
              type="text"
              value={newFolderPath}
              onChange={(e) => setNewFolderPath(e.target.value)}
              placeholder="Ex: C:\Logs\Producao ou D:\Servicos\Logs"
              className="w-full sm:flex-1 px-3 py-1.5 text-xs rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
              autoFocus
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-sky-600 hover:bg-sky-700 text-white transition-colors flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Salvar</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddInput(false)}
              className="px-2.5 py-1.5 text-xs rounded-md text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
          </form>
        )}

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-5">
          {/* Favorites Section */}
          {favorites.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                <span>Pastas Favoritas ({favorites.length})</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {favorites.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    isCurrent={folder.path.toLowerCase() === currentFolderPath.toLowerCase()}
                    onOpen={() => {
                      onOpenFolder(folder.path, folder.name);
                      onClose();
                    }}
                    onToggleFavorite={() => onToggleFavorite(folder.id)}
                    onRemove={() => onRemoveFolder(folder.id)}
                    formatTime={formatLastAccessed}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recent Section */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Histórico de Pastas Recentes ({recents.length})</span>
            </div>

            {recentFoldersContent}
          </div>
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 flex items-center justify-between">
          <span>
            {isElectron
              ? '⚡ Modo Desktop: As pastas salvas são lidas diretamente do seu Windows.'
              : '💾 Modo Web: O histórico fica salvo localmente no seu navegador.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

interface FolderCardProps {
  folder: SavedFolder;
  isCurrent: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onRemove: () => void;
  formatTime: (ts: number) => string;
}

function FolderCard({
  folder,
  isCurrent,
  onOpen,
  onToggleFavorite,
  onRemove,
  formatTime,
}: Readonly<FolderCardProps>) {
  return (
    <div
      className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border transition-all ${
        isCurrent
          ? 'bg-sky-50/80 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800 shadow-xs'
          : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
      }`}
    >
      <button
        type="button"
        className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer text-left"
        onClick={onOpen}
      >
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            folder.isFavorite
              ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/80 dark:text-amber-400'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
          }`}
        >
          <Folder className="w-5 h-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {folder.name}
            </span>
            {isCurrent && (
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-sky-600 text-white">
                Aberta agora
              </span>
            )}
          </div>
          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {folder.path}
          </p>
          <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1">
            {folder.fileCount > 0 && <span>{folder.fileCount} arquivos detectados</span>}
            <span>{formatTime(folder.lastAccessed)}</span>
          </div>
        </div>
      </button>

      <div className="flex items-center justify-end gap-1 shrink-0 w-full sm:w-auto">
        <button
          type="button"
          onClick={onToggleFavorite}
          className={`p-1.5 rounded-md transition-colors ${
            folder.isFavorite
              ? 'text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-950/60'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
          title={folder.isFavorite ? 'Desfavoritar pasta' : 'Fixar como favorita'}
        >
          <Star
            className={`w-4 h-4 ${folder.isFavorite ? 'fill-amber-500 text-amber-500' : ''}`}
          />
        </button>

        <button
          type="button"
          onClick={onOpen}
          className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-sky-600 hover:bg-sky-700 text-white transition-colors flex items-center gap-1"
          title="Carregar logs desta pasta"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Abrir</span>
        </button>

        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
          title="Remover do histórico"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
