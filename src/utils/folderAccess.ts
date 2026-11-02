// Messages thrown by the main process (electron/main.cjs) when a folder or file is not granted.
// IPC errors arrive as "Error invoking remote method '...': Error: <message>", so they are matched by text.
const FOLDER_DENIED = 'Acesso à pasta não autorizado';
const FILE_OUTSIDE_GRANTS = 'Arquivo fora das pastas liberadas';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

/** The user answered "Cancelar" when asked to allow the folder. */
export function isFolderAccessDenied(error: unknown): boolean {
  return messageOf(error).includes(FOLDER_DENIED);
}

/** The file's folder is not (or no longer) granted, e.g. after it was revoked in the settings. */
export function isOutsideGrantedFolders(error: unknown): boolean {
  return messageOf(error).includes(FILE_OUTSIDE_GRANTS);
}

/** Error text for the user, without the IPC wrapper. */
export function describeReadError(error: unknown): string {
  if (isOutsideGrantedFolders(error)) return 'a pasta não está liberada para leitura (abra a pasta de novo para permitir)';
  const message = messageOf(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') || 'erro desconhecido';
}
