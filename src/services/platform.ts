import { ElectronAPI } from '../types';

/**
 * The only place that knows where the app runs. The desktop bridge comes from electron/preload.cjs;
 * in the browser it does not exist and every desktop-only feature reports itself as unavailable.
 * Components and hooks ask here instead of reaching for `window.electronAPI`.
 */
export function desktop(): ElectronAPI | null {
  return typeof window === 'undefined' ? null : window.electronAPI ?? null;
}

export const capabilities = {
  /** Saved folders, session restore and "open with" read folders by path (desktop only). */
  get readsFoldersByPath(): boolean {
    return Boolean(desktop()?.readFolder);
  },
  get watchesFiles(): boolean {
    return Boolean(desktop()?.checkFileStats);
  },
  get notifies(): boolean {
    return Boolean(desktop()?.notify);
  },
  get revealsInFileManager(): boolean {
    return Boolean(desktop()?.openInExplorer);
  },
};

/**
 * Error codes the main process puts at the start of its messages ("[CODE] text"), so the UI reacts
 * to the kind of error instead of to its wording. Keep in sync with `ErrorCode` in electron/main.cjs.
 */
export type DesktopErrorCode = 'FOLDER_DENIED' | 'OUTSIDE_ALLOWED_FOLDERS' | 'UNSUPPORTED_FILE' | 'NOT_FOUND';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

export function desktopErrorCode(error: unknown): DesktopErrorCode | null {
  const match = /\[([A-Z_]+)\]/.exec(messageOf(error));
  return (match?.[1] as DesktopErrorCode | undefined) ?? null;
}

/** Text for the user: without the IPC wrapper and the code, and explained when the cause is known. */
export function describeDesktopError(error: unknown): string {
  if (desktopErrorCode(error) === 'OUTSIDE_ALLOWED_FOLDERS') {
    return 'a pasta não está liberada para leitura (abra a pasta de novo para permitir)';
  }
  const message = messageOf(error)
    .replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
    .replace(/^\[[A-Z_]+\]\s*/, '');
  return message || 'erro desconhecido';
}
