import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Bell, Files, FolderLock, Keyboard, Moon, Settings, Sun, WrapText, X } from 'lucide-react';
import { FileSortField, SortDirection } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  isDarkMode: boolean;
  wordWrap: boolean;
  fileSortField: FileSortField;
  sortDirection: SortDirection;
  onToggleTheme: () => void;
  onToggleWordWrap: () => void;
  onFileSortFieldChange: (field: FileSortField) => void;
  onSortDirectionChange: (direction: SortDirection) => void;
  notifyErrors: boolean;
  notifyTerms: string;
  onNotifyErrorsChange: (enabled: boolean) => void;
  onNotifyTermsChange: (terms: string) => void;
  onClose: () => void;
}

const SHORTCUTS = [
  ['Ctrl + F', 'Focar a pesquisa'],
  ['Enter / Shift + Enter', 'Incluir / excluir o termo pesquisado'],
  ['Esc', 'Limpar a pesquisa atual'],
  ['Ctrl + clique', 'Adicionar/remover arquivo da seleção'],
  ['Shift + clique', 'Selecionar um intervalo de arquivos'],
  ['Ctrl + A (na lista)', 'Selecionar todos os arquivos'],
  ['Ctrl + Shift + W', 'Alternar quebra de linha'],
  ['F8 / Shift + F8', 'Próximo / anterior erro (ERR)'],
  ['Ctrl + B', 'Marcar / desmarcar o registro selecionado'],
  ['F2 / Shift + F2', 'Próximo / anterior registro marcado'],
  ['Ctrl + G', 'Ir para uma linha'],
  ['Ctrl + ,', 'Abrir configurações'],
];

interface NotificationsSectionProps {
  errors: boolean;
  terms: string;
  onErrorsChange: (enabled: boolean) => void;
  onTermsChange: (terms: string) => void;
}

/** System notifications for the live view (desktop app only). */
function NotificationsSection({ errors, terms, onErrorsChange, onTermsChange }: Readonly<NotificationsSectionProps>) {
  if (!window.electronAPI?.notify) return null;
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
        <Bell className="h-3.5 w-3.5" />
        Notificações do tempo real
      </h3>
      <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
          <span>Avisar quando surgir um erro (ERR)</span>
          <input type="checkbox" checked={errors} onChange={(event) => onErrorsChange(event.target.checked)} className="h-4 w-4 accent-sky-600" />
        </label>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-200">
          <span>Avisar também quando aparecer algum destes termos (separados por vírgula)</span>
          <input
            type="text"
            value={terms}
            onChange={(event) => onTermsChange(event.target.value)}
            placeholder="timeout, OutOfMemory, pagamento recusado"
            className="mt-1.5 w-full rounded border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-800"
          />
        </label>
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          O aviso do sistema aparece só quando a janela do OctoSearch não está em foco, para os arquivos com o tempo
          real ligado. Vários registros seguidos viram um aviso só.
        </p>
      </div>
    </div>
  );
}

/** Long paths keep their end, which is what tells two folders apart. */
function shortenPath(folder: string, max = 64): string {
  return folder.length > max ? `…${folder.slice(folder.length - max + 1)}` : folder;
}

function folderName(folder: string): string {
  return folder.split(/[\\/]/).filter(Boolean).pop() || folder;
}

/** Folders the desktop app may read; each one can be revoked (the app asks again the next time). */
function AllowedFoldersSection() {
  const api = window.electronAPI;
  const [folders, setFolders] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api?.listAllowedFolders?.().then(
      (list) => {
        if (!cancelled) setFolders(list);
      },
      () => {
        if (!cancelled) setError('Não foi possível carregar a lista.');
      }
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (!api?.listAllowedFolders || !api.revokeFolder) return null;
  const revokeFolder = api.revokeFolder;

  const revoke = async (folder: string) => {
    try {
      await revokeFolder(folder);
      setFolders((current) => current?.filter((item) => item !== folder) ?? null);
    } catch {
      setError('Não foi possível revogar a pasta.');
    }
  };

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
        <FolderLock className="h-3.5 w-3.5" />
        Pastas liberadas
      </h3>
      <p className="mb-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        O OctoSearch só lê logs dentro destas pastas (e das subpastas). Ao revogar uma pasta, as abas dela param de
        atualizar e o app pede permissão de novo na próxima vez que ela for aberta.
      </p>
      {error && <p className="mb-2 text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
      {folders && folders.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 dark:border-slate-700">Nenhuma pasta liberada.</p>
      )}
      {folders && folders.length > 0 && (
        <ul className="max-h-40 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {folders.map((folder) => (
            <li key={folder} className="flex items-center gap-2 px-3 py-1.5">
              <span className="min-w-0 flex-1" title={folder}>
                <span className="block truncate text-xs font-medium text-slate-800 dark:text-slate-100">{folderName(folder)}</span>
                <span className="block truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">{shortenPath(folder)}</span>
              </span>
              <button
                type="button"
                onClick={() => void revoke(folder)}
                className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-600 dark:text-slate-300 dark:hover:border-rose-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
              >
                Revogar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SettingsModal({
  isOpen,
  isDarkMode,
  wordWrap,
  fileSortField,
  sortDirection,
  onToggleTheme,
  onToggleWordWrap,
  onFileSortFieldChange,
  onSortDirectionChange,
  notifyErrors,
  notifyTerms,
  onNotifyErrorsChange,
  onNotifyTermsChange,
  onClose,
}: Readonly<SettingsModalProps>) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
    >
      <button
        type="button"
        aria-label="Fechar configurações"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <dialog
        open
        aria-modal="true"
        aria-labelledby="settings-title"
        className="relative z-10 m-0 w-full max-w-lg overflow-hidden rounded-xl border border-slate-300 bg-white p-0 text-inherit shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <h2 id="settings-title" className="text-sm font-semibold">
              Configurações
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Fechar configurações"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[calc(100vh-8rem)] space-y-5 overflow-y-auto p-4">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Aparência e leitura
            </h3>
            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {isDarkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  Tema
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {isDarkMode ? 'Escuro' : 'Claro'}
                </span>
              </button>
              <button
                type="button"
                onClick={onToggleWordWrap}
                className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <WrapText className="h-4 w-4" />
                  Quebra de linha
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${wordWrap ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                  {wordWrap ? 'Ativada' : 'Desativada'}
                </span>
              </button>
            </div>
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Files className="h-3.5 w-3.5" />
              Ordenação dos arquivos
            </h3>
            <div className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-700">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
                <span>Ordenar por</span>
                <select
                  value={fileSortField}
                  onChange={(event) => onFileSortFieldChange(event.target.value as FileSortField)}
                  className="mt-1.5 w-full rounded border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-600 dark:bg-slate-800"
                >
                  <option value="name">Nome</option>
                  <option value="createdAt">Data de criação</option>
                  <option value="lastModified">Última modificação</option>
                </select>
              </label>

              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
                <span>Direção</span>
                <select
                  value={sortDirection}
                  onChange={(event) => onSortDirectionChange(event.target.value as SortDirection)}
                  className="mt-1.5 w-full rounded border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-600 dark:bg-slate-800"
                >
                  <option value="asc">Crescente / mais antigos</option>
                  <option value="desc">Decrescente / mais recentes</option>
                </select>
              </label>

              <div className="sm:col-span-2 flex items-start gap-2 rounded bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                {sortDirection === 'asc' ? <ArrowUp className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <ArrowDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>
                  A data de criação real está disponível no aplicativo desktop. No navegador,
                  arquivos sem essa informação usam a última modificação.
                </span>
              </div>
            </div>
          </div>

          <NotificationsSection
            errors={notifyErrors}
            terms={notifyTerms}
            onErrorsChange={onNotifyErrorsChange}
            onTermsChange={onNotifyTermsChange}
          />

          <AllowedFoldersSection />

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Keyboard className="h-3.5 w-3.5" />
              Atalhos
            </h3>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
              {SHORTCUTS.map(([shortcut, description]) => (
                <div key={shortcut} className="contents">
                  <kbd className="rounded border border-slate-300 bg-slate-100 px-2 py-1 text-center font-mono text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    {shortcut}
                  </kbd>
                  <span className="self-center text-slate-600 dark:text-slate-300">{description}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
