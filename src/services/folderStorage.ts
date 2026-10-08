import { SavedFolder } from '../types';

const STORAGE_KEY = 'saved_log_folders_v1';

const SEEDED_FOLDER_IDS = new Set(['saved-app', 'saved-n4']);

function createFolderId(): string {
  return `folder-${Date.now()}-${crypto.randomUUID()}`;
}

function trimTrailingSeparators(path: string): string {
  let end = path.length;
  while (end > 0 && (path[end - 1] === '/' || path[end - 1] === '\\')) {
    end--;
  }
  return path.slice(0, end);
}

export function getSavedFolders(): SavedFolder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const savedFolders = parsed.filter(
        (folder): folder is SavedFolder =>
          typeof folder === 'object' &&
          folder !== null &&
          !SEEDED_FOLDER_IDS.has(folder.id)
      );
      if (savedFolders.length !== parsed.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedFolders));
      }
      return savedFolders;
    }
    return [];
  } catch (err) {
    console.warn('Erro ao carregar pastas salvas do localStorage:', err);
    return [];
  }
}

export function saveFolderRecord(
  folderPath: string,
  folderName: string,
  fileCount: number
): SavedFolder[] {
  try {
    const currentList = getSavedFolders();
    const normalizedPath = folderPath.trim();
    const existingIndex = currentList.findIndex(
      (f) => f.path.toLowerCase() === normalizedPath.toLowerCase()
    );

    let updated: SavedFolder[];
    if (existingIndex >= 0) {
      const existing = currentList[existingIndex];
      const updatedItem: SavedFolder = {
        ...existing,
        name: folderName || existing.name,
        lastAccessed: Date.now(),
        fileCount: fileCount > 0 ? fileCount : existing.fileCount,
      };
      // Move to top of recent list
      const rest = currentList.filter((_, idx) => idx !== existingIndex);
      updated = [updatedItem, ...rest];
    } else {
      const newItem: SavedFolder = {
        id: createFolderId(),
        name: folderName || 'Logs',
        path: normalizedPath,
        lastAccessed: Date.now(),
        fileCount,
        isFavorite: false,
      };
      updated = [newItem, ...currentList];
    }

    // Keep at most 25 recent items (favorites are always preserved)
    if (updated.length > 25) {
      const favorites = updated.filter((f) => f.isFavorite);
      const nonFavorites = updated.filter((f) => !f.isFavorite).slice(0, 20);
      updated = [...favorites, ...nonFavorites.filter((nf) => !favorites.some((fav) => fav.id === nf.id))];
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Erro ao salvar pasta no localStorage:', err);
    return getSavedFolders();
  }
}

export function toggleFavoriteFolder(folderId: string): SavedFolder[] {
  try {
    const list = getSavedFolders();
    const updated = list.map((item) =>
      item.id === folderId ? { ...item, isFavorite: !item.isFavorite } : item
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Erro ao alternar favorito:', err);
    return getSavedFolders();
  }
}

export function removeSavedFolder(folderId: string): SavedFolder[] {
  try {
    const list = getSavedFolders();
    const updated = list.filter((item) => item.id !== folderId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Erro ao remover pasta salva:', err);
    return getSavedFolders();
  }
}

export function addManualSavedFolder(folderPath: string): SavedFolder[] {
  const clean = trimTrailingSeparators(folderPath.trim());
  if (!clean) return getSavedFolders();

  const parts = clean.split(/[\\/]/);
  const derivedName = parts.at(-1) || clean;

  return saveFolderRecord(clean, derivedName, 0);
}
