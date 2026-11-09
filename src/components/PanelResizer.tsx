import React, { useRef } from 'react';

interface PanelResizerProps {
  width: number;
  min: number;
  max: number;
  initial: number;
  onChange: (width: number) => void;
  label: string;
}

/**
 * Vertical bar between two panels: drag to resize the panel on its left, double click to restore the
 * initial width, or use the arrow keys when focused. Hidden on narrow (stacked) layouts.
 */
export function PanelResizer({ width, min, max, initial, onChange, label }: Readonly<PanelResizerProps>) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const clamp = (value: number) => Math.round(Math.min(max, Math.max(min, value)));

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      title={`${label}: arraste para ajustar, duplo clique para voltar ao tamanho padrão`}
      onPointerDown={(event: React.PointerEvent<HTMLDivElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startX: event.clientX, startWidth: width };
      }}
      onPointerMove={(event) => {
        if (drag.current) onChange(clamp(drag.current.startWidth + event.clientX - drag.current.startX));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onDoubleClick={() => onChange(initial)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') onChange(clamp(width - 16));
        if (event.key === 'ArrowRight') onChange(clamp(width + 16));
      }}
      className="group relative z-10 -mx-1 hidden w-2 shrink-0 cursor-col-resize touch-none focus:outline-none md:block"
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-sky-400 group-focus-visible:bg-sky-500 group-active:bg-sky-500" />
    </div>
  );
}
