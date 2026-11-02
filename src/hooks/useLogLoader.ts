import { useCallback, useEffect, useRef, useState } from 'react';
import { FileReadResult, LogEntry, LogFileItem } from '../types';
import { appendInWorker, disposeWorkerSessions, parseInWorker } from '../services/parserClient';
import { isGzipFileName, LogEncoding } from '../services/logDecoding';
import { IncrementalMerger } from '../services/logMerge';
import { buildSourceLabels, isNativeFile } from '../utils/logFile';
import { describeReadError } from '../utils/folderAccess';

/** Larger files are opened by their end (the most recent records) to keep memory under control. */
export const MAX_INITIAL_READ_BYTES = 200 * 1024 * 1024;
/** Safety net for the live view: fs.watch events can be late on Windows and missing on network shares. */
const WATCHED_POLL_MS = 3000;
const UNWATCHED_POLL_MS = 1500;

interface ParsedFile {
  entries: LogEntry[];
  totalLines: number;
  formatRecognized: boolean;
  /** Byte offset already read (the next live read continues from here); -1 after a failed read. */
  size: number;
  mtime: number;
  canAppend: boolean;
  truncated: boolean;
  encoding?: LogEncoding;
}

const FAILED_FILE: ParsedFile = {
  entries: [],
  totalLines: 0,
  formatRecognized: true,
  size: -1,
  mtime: -1,
  canAppend: false,
  truncated: false,
};

async function readLogBytes(file: LogFileItem): Promise<FileReadResult> {
  if (window.electronAPI?.readFile && isNativeFile(file)) return window.electronAPI.readFile(file.path);
  if (file.file) {
    const start = !isGzipFileName(file.name) && file.size > MAX_INITIAL_READ_BYTES ? file.size - MAX_INITIAL_READ_BYTES : 0;
    const bytes = new Uint8Array(await file.file.slice(start).arrayBuffer());
    return { bytes, start, size: start + bytes.length, mtimeMs: file.lastModified };
  }
  if (file.content !== undefined) {
    const bytes = new TextEncoder().encode(file.content);
    return { bytes, start: 0, size: bytes.length, mtimeMs: file.lastModified };
  }
  throw new Error(`Conteúdo do arquivo "${file.name}" não disponível.`);
}

async function parseWholeFile(
  file: LogFileItem,
  onProgress?: (progress: number) => void,
  onPartial?: (partial: ParsedFile) => void
): Promise<ParsedFile> {
  const read = await readLogBytes(file);
  const truncated = read.start > 0;
  const result = await parseInWorker(
    file.id,
    read.bytes,
    { gzip: isGzipFileName(file.name), truncated, referenceTime: read.mtimeMs || file.lastModified },
    onProgress,
    onPartial && ((entries) => onPartial({ ...FAILED_FILE, entries, totalLines: 0, truncated }))
  );
  return {
    entries: result.entries,
    totalLines: result.totalLines,
    formatRecognized: result.formatRecognized,
    size: read.size,
    mtime: read.mtimeMs,
    canAppend: result.canAppend && isNativeFile(file),
    truncated: read.start > 0,
    encoding: result.encoding,
  };
}

/** Reads only what was appended to the file; null when it has to be parsed again in full. */
async function appendToFile(file: LogFileItem, current: ParsedFile): Promise<ParsedFile | null> {
  const readFileFrom = window.electronAPI?.readFileFrom;
  if (!readFileFrom || !current.canAppend) return null;
  const read = await readFileFrom(file.path, current.size);
  if (!read) return null;
  const delta = await appendInWorker(file.id, read.bytes);
  if (!delta) return null;
  // One copy of the kept records (spreading both parts would copy millions of them twice).
  const entries = current.entries.slice(0, delta.fromIndex);
  for (const entry of delta.entries) entries.push(entry);
  return {
    ...current,
    entries,
    totalLines: delta.totalLines,
    size: read.size,
    mtime: read.mtimeMs,
  };
}

function isUncPath(filePath: string): boolean {
  return /^(\\\\|\/\/)/.test(filePath);
}

/**
 * Reads, parses (in a Web Worker) and merges the selected files, and keeps them up to date while
 * the live view is on: changed files are continued from where the previous read stopped.
 */
export function useLogLoader(selectedFiles: LogFileItem[], isLiveTailing: boolean) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [totalLines, setTotalLines] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unrecognizedFiles, setUnrecognizedFiles] = useState<string[]>([]);
  const [truncatedFiles, setTruncatedFiles] = useState<string[]>([]);
  const [lastLiveUpdate, setLastLiveUpdate] = useState<Date | null>(null);
  const parsedFilesRef = useRef(new Map<string, ParsedFile>());
  const loadRequestRef = useRef(0);
  const mergerRef = useRef(new IncrementalMerger());

  /** Rebuilds the visible timeline from the per-file parse cache. */
  const applyParsedFiles = useCallback((files: LogFileItem[], parsed: Map<string, ParsedFile>) => {
    const labels = buildSourceLabels(files);
    const sources = files.flatMap((file) => {
      const result = parsed.get(file.id);
      return result ? [{ label: labels.get(file.id) || file.name, entries: result.entries }] : [];
    });
    setEntries(mergerRef.current.merge(sources));
    setTotalLines(files.reduce((total, file) => total + (parsed.get(file.id)?.totalLines || 0), 0));
    setUnrecognizedFiles(files.filter((file) => parsed.get(file.id)?.formatRecognized === false).map((file) => file.name));
    setTruncatedFiles(files.filter((file) => parsed.get(file.id)?.truncated).map((file) => file.name));
  }, []);

  /** Parses the selection; files already parsed are reused unless `force` (the reload button). */
  const loadSelection = useCallback(
    async (files: LogFileItem[], force = false) => {
      const requestId = ++loadRequestRef.current;
      const isCurrent = () => requestId === loadRequestRef.current;
      setIsLoading(true);
      setLoadingProgress(0);
      setErrorMessage(null);

      const previous = parsedFilesRef.current;
      const parsed = new Map<string, ParsedFile>();
      const failures: string[] = [];
      try {
        for (let index = 0; index < files.length; index++) {
          const file = files[index];
          const progressBase = (index / files.length) * 100;
          const progressSpan = 100 / files.length;
          const cached = previous.get(file.id);
          if (!force && cached && cached.size >= 0) {
            parsed.set(file.id, cached);
            continue;
          }
          try {
            const result = await parseWholeFile(
              file,
              (progress) => {
                if (isCurrent()) setLoadingProgress(Math.round(progressBase + (progress * progressSpan) / 100));
              },
              // Large files show the records parsed so far while the rest is still being read.
              (partial) => {
                if (!isCurrent()) return;
                const shown = new Map(parsed);
                shown.set(file.id, partial);
                applyParsedFiles(files.filter((item) => shown.has(item.id)), shown);
              }
            );
            if (!isCurrent()) return;
            parsed.set(file.id, result);
          } catch (err: unknown) {
            if (!isCurrent()) return;
            console.error(err);
            failures.push(`${file.name}: ${describeReadError(err)}`);
            // Unknown stats make live polling retry this file instead of blocking the whole selection.
            parsed.set(file.id, FAILED_FILE);
          }
          setLoadingProgress(Math.round(progressBase + progressSpan));
        }

        disposeWorkerSessions([...previous.keys()].filter((id) => !parsed.has(id)));
        parsedFilesRef.current = parsed;
        applyParsedFiles(files, parsed);
        if (failures.length > 0) {
          setErrorMessage(
            failures.length === files.length && files.length === 1
              ? failures[0]
              : `Não foi possível ler ${failures.length} de ${files.length} arquivo(s): ${failures.join(' | ')}`
          );
        }
      } finally {
        if (isCurrent()) setIsLoading(false);
      }
    },
    [applyParsedFiles]
  );

  // Load whenever the selection changes
  useEffect(() => {
    if (selectedFiles.length === 0) {
      loadRequestRef.current++;
      disposeWorkerSessions([...parsedFilesRef.current.keys()]);
      parsedFilesRef.current = new Map();
      // Drop the merged copies too, or a closed selection would stay in memory.
      mergerRef.current = new IncrementalMerger();
      setEntries([]);
      setTotalLines(0);
      setErrorMessage(null);
      setUnrecognizedFiles([]);
      setTruncatedFiles([]);
      setIsLoading(false);
      return;
    }
    void loadSelection(selectedFiles);
  }, [selectedFiles, loadSelection]);

  // Live view (Electron): file-system events trigger an immediate check, polling covers missed events.
  useEffect(() => {
    const api = window.electronAPI;
    const checkFileStats = api?.checkFileStats;
    const watchedFiles = selectedFiles.filter(isNativeFile);
    if (!isLiveTailing || !checkFileStats || watchedFiles.length === 0) {
      void api?.watchFiles?.([]);
      return;
    }

    let disposed = false;
    let isChecking = false;
    let pendingPaths: Set<string> | 'all' | null = null;

    const checkFiles = async (paths: Set<string> | 'all') => {
      if (isChecking) {
        pendingPaths = paths === 'all' || pendingPaths === 'all' ? 'all' : new Set([...(pendingPaths ?? []), ...paths]);
        return;
      }
      const parsed = parsedFilesRef.current;
      if (!selectedFiles.every((file) => parsed.has(file.id))) return;
      isChecking = true;
      try {
        let changed = false;
        for (const file of watchedFiles) {
          if (paths !== 'all' && !paths.has(file.path)) continue;
          const current = parsed.get(file.id);
          const stats = await checkFileStats(file.path);
          if (disposed || parsed !== parsedFilesRef.current) return;
          if (!current || !stats) continue;
          if (stats.size === current.size && (stats.mtimeMs === current.mtime || current.canAppend)) continue;

          const next =
            (stats.size > current.size ? await appendToFile(file, current) : null) ?? (await parseWholeFile(file));
          if (disposed || parsed !== parsedFilesRef.current) return;
          parsed.set(file.id, next);
          changed = true;
        }
        if (changed) {
          applyParsedFiles(selectedFiles, parsed);
          setLastLiveUpdate(new Date());
        }
      } catch (err) {
        console.error('Erro ao verificar atualização dos arquivos em tempo real:', err);
      } finally {
        isChecking = false;
        if (!disposed && pendingPaths) {
          const next = pendingPaths;
          pendingPaths = null;
          void checkFiles(next);
        }
      }
    };

    let intervalId: ReturnType<typeof setInterval> | undefined;
    const startPolling = (watched: string[]) => {
      if (disposed) return;
      const watchedSet = new Set(watched);
      const allWatched = watchedFiles.every((file) => watchedSet.has(file.path) && !isUncPath(file.path));
      intervalId = setInterval(() => void checkFiles('all'), allWatched ? WATCHED_POLL_MS : UNWATCHED_POLL_MS);
    };

    const unsubscribe = api?.onFileChanged?.((filePath) => void checkFiles(new Set([filePath])));
    if (api?.watchFiles) {
      api.watchFiles(watchedFiles.map((file) => file.path)).then(startPolling, () => startPolling([]));
    } else {
      startPolling([]);
    }

    return () => {
      disposed = true;
      unsubscribe?.();
      if (intervalId) clearInterval(intervalId);
    };
  }, [isLiveTailing, selectedFiles, applyParsedFiles]);

  const reload = useCallback(() => {
    if (selectedFiles.length > 0) void loadSelection(selectedFiles, true);
  }, [selectedFiles, loadSelection]);

  return {
    entries,
    totalLines,
    isLoading,
    setIsLoading,
    loadingProgress,
    setLoadingProgress,
    errorMessage,
    setErrorMessage,
    unrecognizedFiles,
    dismissUnrecognized: () => setUnrecognizedFiles([]),
    truncatedFiles,
    dismissTruncated: () => setTruncatedFiles([]),
    lastLiveUpdate,
    reload,
  };
}
