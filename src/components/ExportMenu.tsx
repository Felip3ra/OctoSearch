import React, { useEffect, useRef, useState } from 'react';
import { Check, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { ExportFormat } from '../services/logExport';

interface ExportMenuProps {
  disabled?: boolean;
  count: number;
  buttonClassName: string;
  neutralClassName: string;
  onExport: (format: ExportFormat) => Promise<boolean>;
}

const OPTIONS: { format: ExportFormat; label: string; description: string; icon: typeof FileText }[] = [
  { format: 'log', label: 'Texto (.log)', description: 'Os registros como aparecem no arquivo', icon: FileText },
  { format: 'csv', label: 'Planilha (.csv)', description: 'Colunas de data, nível e mensagem para o Excel', icon: FileSpreadsheet },
];

export function ExportMenu({ disabled, count, buttonClassName, neutralClassName, onExport }: Readonly<ExportMenuProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const handleSelect = async (format: ExportFormat) => {
    setIsOpen(false);
    try {
      if (await onExport(format)) {
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }
    } catch (error) {
      console.error('Erro ao exportar registros:', error);
      alert(`Não foi possível exportar: ${(error as Error)?.message || error}`);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        ref={buttonRef}
        onClick={() => {
          // Fixed positioning: the toolbar scrolls horizontally and would clip an absolute menu.
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) setPosition({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
          setIsOpen((current) => !current);
        }}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Exportar os registros visíveis (com os filtros aplicados) para um arquivo"
        className={`${buttonClassName} ${neutralClassName}`}
      >
        {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Download className="h-3.5 w-3.5" />}
        <span className="hidden lg:inline">{done ? 'Exportado!' : 'Exportar'}</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          style={{ top: position.top, right: position.right }}
          className="fixed z-40 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="px-3 py-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            {count.toLocaleString('pt-BR')} registro(s) visíveis
          </p>
          {OPTIONS.map(({ format, label, description, icon: Icon }) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              onClick={() => void handleSelect(format)}
              className="flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span>
                <span className="block font-medium text-slate-800 dark:text-slate-100">{label}</span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">{description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
