import React, { useState } from 'react';
import { LogFileItem } from '../types';
import { isSupportedLogFileName } from '../utils/logFile';

/**
 * Drag and drop of log files (or a folder) onto the window. Dropped files are read by the browser,
 * so they get a fictitious folder path and open in a tab of their own.
 */
export function useFileDrop(onOpen: (folderPath: string, files: LogFileItem[], folderName: string) => void, onRejected: (message: string) => void) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDraggingOver(true);
  };

  const onDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    if (event.currentTarget === event.target) setIsDraggingOver(false);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDraggingOver(false);
    const dropped = Array.from(event.dataTransfer.files || []);
    if (dropped.length === 0) return;
    const valid = dropped.filter((file) => isSupportedLogFileName(file.name));
    if (valid.length === 0) {
      onRejected('Por favor, solte arquivos .log, .txt, logs rotacionados como .log.1 ou compactados como .log.gz.');
      return;
    }

    const relativeParts = valid[0].webkitRelativePath?.split('/') || [];
    const folderName = relativeParts.length > 1 ? relativeParts[0] : 'Importados';
    const folderPath = `C:\\Logs\\${folderName}`;
    const stamp = Date.now();
    const items: LogFileItem[] = valid.map((file, index) => {
      const relativePath = file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('\\') || file.name : file.name;
      return {
        id: `dropped-${stamp}-${index}`,
        name: file.name,
        relativePath,
        path: `${folderPath}\\${relativePath}`,
        size: file.size,
        lastModified: file.lastModified,
        file,
      };
    });
    onOpen(folderPath, items, folderName);
  };

  return { isDraggingOver, dropHandlers: { onDragOver, onDragLeave, onDrop } };
}
