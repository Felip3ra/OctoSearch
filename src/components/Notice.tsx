import React from 'react';
import { AlertTriangle, Info, ShieldAlert, X } from 'lucide-react';
import { DeniedFolder } from '../hooks/useFolderOpening';

type NoticeTone = 'warning' | 'info' | 'error';

const TONES: Record<NoticeTone, { box: string; icon: string; close: string; Icon: typeof Info }> = {
  warning: {
    box: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
    icon: 'text-amber-500',
    close: 'hover:bg-amber-100 dark:hover:bg-amber-900/40',
    Icon: AlertTriangle,
  },
  info: {
    box: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200',
    icon: 'text-sky-500',
    close: 'hover:bg-sky-100 dark:hover:bg-sky-900/40',
    Icon: Info,
  },
  error: {
    box: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200',
    icon: 'text-rose-500',
    close: 'hover:bg-rose-100 dark:hover:bg-rose-900/40',
    Icon: AlertTriangle,
  },
};

interface NoticeProps {
  tone: NoticeTone;
  onDismiss: () => void;
  children: React.ReactNode;
}

/** A dismissible strip above the records (unknown format, truncated file, errors). */
export function Notice({ tone, onDismiss, children }: Readonly<NoticeProps>) {
  const { box, icon, close, Icon } = TONES[tone];
  return (
    <div className={`flex items-start gap-2 border-b px-3 py-2 text-xs ${box}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${icon}`} />
      <span className="min-w-0 break-words">{children}</span>
      <button type="button" onClick={onDismiss} className={`ml-auto shrink-0 rounded p-0.5 ${close}`} aria-label="Fechar aviso">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface DeniedFoldersNoticeProps {
  folders: DeniedFolder[];
  onAllow: (folder: DeniedFolder) => void;
  onDismiss: () => void;
}

/** Folders whose access was not allowed, each with a button to ask again. */
export function DeniedFoldersNotice({ folders, onAllow, onDismiss }: Readonly<DeniedFoldersNoticeProps>) {
  if (folders.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
      <span className="min-w-0">
        {folders.length === 1
          ? 'O acesso a esta pasta não foi permitido, por isso ela não foi aberta:'
          : 'O acesso a estas pastas não foi permitido, por isso elas não foram abertas:'}
      </span>
      {folders.map((folder) => (
        <span key={folder.path} className="flex min-w-0 items-center gap-1.5 rounded border border-amber-300 bg-white/70 py-0.5 pl-2 pr-0.5 dark:border-amber-800 dark:bg-amber-950/50">
          <span className="max-w-72 truncate font-semibold" title={folder.path}>{folder.name}</span>
          <button
            type="button"
            onClick={() => onAllow(folder)}
            className="shrink-0 rounded bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-600"
          >
            Permitir e abrir
          </button>
        </span>
      ))}
      <button type="button" onClick={onDismiss} className="ml-auto shrink-0 rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/40" aria-label="Fechar aviso">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
