import { useCallback, useState } from 'react';
import { SavedFolder } from '../types';
import {
  addManualSavedFolder,
  getSavedFolders,
  removeSavedFolder,
  saveFolderRecord,
  toggleFavoriteFolder,
} from '../services/folderStorage';
import { samePath } from '../utils/folderTabs';

/** History of opened folders and favorites (the storage functions persist and return the new list). */
export function useSavedFolders() {
  const [savedFolders, setSavedFolders] = useState<SavedFolder[]>(() => getSavedFolders());

  const recordFolder = useCallback((path: string, name: string, fileCount: number) => {
    setSavedFolders(saveFolderRecord(path, name, fileCount));
  }, []);

  const toggleFavorite = useCallback((folderId: string) => setSavedFolders(toggleFavoriteFolder(folderId)), []);

  /** Star/unstar a folder by path, saving it to the history first when it is not there yet. */
  const toggleFavoriteByPath = useCallback(
    (path: string, name: string, fileCount: number) => {
      const saved = savedFolders.find((folder) => samePath(folder.path, path));
      if (saved) {
        setSavedFolders(toggleFavoriteFolder(saved.id));
        return;
      }
      const updated = saveFolderRecord(path, name, fileCount);
      const created = updated.find((folder) => samePath(folder.path, path));
      setSavedFolders(created ? toggleFavoriteFolder(created.id) : updated);
    },
    [savedFolders]
  );

  const removeFolder = useCallback((folderId: string) => setSavedFolders(removeSavedFolder(folderId)), []);
  const addManualFolder = useCallback((path: string) => setSavedFolders(addManualSavedFolder(path)), []);

  return { savedFolders, recordFolder, toggleFavorite, toggleFavoriteByPath, removeFolder, addManualFolder };
}
