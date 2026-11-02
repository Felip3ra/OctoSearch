import { FileText, Layers } from 'lucide-react';
import { LogFileItem } from '../types';

interface ViewerHeaderProps {
  selectedFiles: LogFileItem[];
  colorById: Map<string, string>;
  labels: Map<string, string>;
  shownCount: number;
  totalCount: number;
}

/** Title of the list (file name, or how many files are merged) and "shown of total" records. */
export function ViewerHeader({ selectedFiles, colorById, labels, shownCount, totalCount }: Readonly<ViewerHeaderProps>) {
  const isMergedView = selectedFiles.length > 1;
  let title = 'Nenhum arquivo selecionado';
  if (isMergedView) title = `${selectedFiles.length} arquivos consolidados`;
  else if (selectedFiles[0]) title = selectedFiles[0].name;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex min-w-0 items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
        {isMergedView ? <Layers className="h-3.5 w-3.5 shrink-0 text-sky-500" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
        <span className="truncate" title={selectedFiles.map((file) => file.path).join('\n')}>{title}</span>
        {isMergedView && (
          <div className="hidden min-w-0 items-center gap-1 sm:flex">
            {selectedFiles.slice(0, 6).map((file) => (
              <span key={file.id} className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorById.get(file.id) }} title={labels.get(file.id)} />
            ))}
            {selectedFiles.length > 6 && <span className="text-[10px] text-slate-400">+{selectedFiles.length - 6}</span>}
          </div>
        )}
      </div>
      <div className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
        <strong className="font-semibold text-slate-700 dark:text-slate-200">{shownCount.toLocaleString('pt-BR')}</strong>
        {' '}de {totalCount.toLocaleString('pt-BR')} registros
      </div>
    </div>
  );
}
