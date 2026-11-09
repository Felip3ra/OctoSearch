import { useEffect, useRef, useState } from 'react';
import { Check, MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface MoreMenuItem {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** On/off options show a check mark. */
  checked?: boolean;
  /** Small counter (saved filters, active highlight rules). */
  badge?: number;
  shortcut?: string;
  disabled?: boolean;
}

interface MoreMenuProps {
  items: MoreMenuItem[];
  buttonClassName: string;
}

/** "⋯" button with the less used toolbar actions, so the toolbar fits narrower windows. */
export function MoreMenu({ items, buttonClassName }: Readonly<MoreMenuProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
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
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Mais opções: filtros salvos, marcadores, quebra de linha, densidade, painel de detalhes"
        aria-label="Mais opções"
        className={`${buttonClassName} px-2`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen && (
        <div
          role="menu"
          style={{ top: position.top, right: position.right }}
          className="fixed z-40 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {items.map(({ label, icon: Icon, onSelect, checked, badge, shortcut, disabled }) => (
            <button
              key={label}
              type="button"
              role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={checked}
              disabled={disabled}
              onClick={() => {
                setIsOpen(false);
                onSelect();
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="flex-1">{label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">{badge}</span>
              )}
              {shortcut && <kbd className="font-mono text-[10px] text-slate-400">{shortcut}</kbd>}
              {checked !== undefined && <Check className={`h-3.5 w-3.5 text-sky-600 dark:text-sky-400 ${checked ? '' : 'invisible'}`} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
