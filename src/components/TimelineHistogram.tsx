import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Histogram, HistogramBucket } from '../services/logHistogram';
import { formatRangeTime } from './TimeRangeFilter';

interface TimelineHistogramProps {
  histogram: Histogram;
  timeFrom?: number;
  timeTo?: number;
  /** Chosen range (both ends inclusive), or undefined values to clear it. */
  onRangeChange: (from: number | undefined, to: number | undefined) => void;
}

const BAR_WIDTH = 10;
const HEIGHT = 44;

function describeStep(step: number): string {
  if (step < 60_000) return `${step / 1000} s`;
  if (step < 3_600_000) return `${step / 60_000} min`;
  if (step < 86_400_000) return `${step / 3_600_000} h`;
  return `${step / 86_400_000} d`;
}

function bucketSummary(bucket: HistogramBucket): string {
  const total = bucket.errors + bucket.warnings + bucket.others;
  const parts = [`${total.toLocaleString('pt-BR')} registro(s)`];
  if (bucket.errors > 0) parts.push(`${bucket.errors.toLocaleString('pt-BR')} ERR`);
  if (bucket.warnings > 0) parts.push(`${bucket.warnings.toLocaleString('pt-BR')} WRN`);
  return `${formatRangeTime(bucket.start)} – ${formatRangeTime(bucket.end - 1)} · ${parts.join(' · ')}`;
}

/**
 * Records per time slice, stacked by level (errors on top). Click a bar or drag over several to show
 * only that period; the period filter of the toolbar is the same one.
 */
export function TimelineHistogram({ histogram, timeFrom, timeTo, onRangeChange }: Readonly<TimelineHistogramProps>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const { buckets } = histogram;
  if (buckets.length === 0) return null;

  const width = buckets.length * BAR_WIDTH;
  const max = Math.max(1, ...buckets.map((bucket) => bucket.errors + bucket.warnings + bucket.others));
  const indexAt = (clientX: number) => {
    const bounds = svgRef.current!.getBoundingClientRect();
    const ratio = Math.min(0.9999, Math.max(0, (clientX - bounds.left) / bounds.width));
    return Math.floor(ratio * buckets.length);
  };

  const selectRange = (first: number, last: number) => {
    const [from, to] = first <= last ? [first, last] : [last, first];
    onRangeChange(buckets[from].start, buckets[to].end - 1);
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const index = indexAt(event.clientX);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ from: index, to: index });
  };
  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const index = indexAt(event.clientX);
    setHovered(index);
    if (drag) setDrag({ ...drag, to: index });
  };
  const handlePointerUp = () => {
    if (drag) selectRange(drag.from, drag.to);
    setDrag(null);
  };

  // Highlighted part: the dragged range while dragging, otherwise the active period filter.
  let selection: [number, number] | null = null;
  if (drag) selection = [Math.min(drag.from, drag.to), Math.max(drag.from, drag.to)];
  else if (timeFrom !== undefined || timeTo !== undefined) {
    const from = timeFrom ?? -Infinity;
    const to = timeTo ?? Infinity;
    const first = buckets.findIndex((bucket) => bucket.end > from);
    let last = buckets.length - 1;
    while (last >= 0 && buckets[last].start > to) last--;
    if (first !== -1 && last >= first) selection = [first, last];
  }

  const info = hovered !== null && buckets[hovered] ? bucketSummary(buckets[hovered]) : `Cada barra: ${describeStep(histogram.step)} · clique ou arraste para filtrar o período`;

  return (
    <div className="border-b border-slate-200 px-3 pb-1.5 pt-1 dark:border-slate-800" aria-label="Linha do tempo dos registros">
      <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
        <span className="truncate tabular-nums">{info}</span>
        {selection && !drag && (
          <button
            type="button"
            onClick={() => onRangeChange(undefined, undefined)}
            className="flex shrink-0 items-center gap-1 rounded px-1 text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40"
          >
            <X className="h-3 w-3" /> Limpar período
          </button>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="block h-11 w-full cursor-crosshair touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setHovered(null)}
        role="img"
      >
        {selection && (
          <rect
            x={selection[0] * BAR_WIDTH}
            y={0}
            width={(selection[1] - selection[0] + 1) * BAR_WIDTH}
            height={HEIGHT}
            className="fill-sky-400/20 dark:fill-sky-500/20"
          />
        )}
        {buckets.map((bucket, index) => {
          const x = index * BAR_WIDTH + 1;
          const scale = (count: number) => (count / max) * (HEIGHT - 2);
          const others = scale(bucket.others);
          const warnings = scale(bucket.warnings);
          const errors = scale(bucket.errors);
          const dimmed = selection !== null && (index < selection[0] || index > selection[1]);
          return (
            <g key={bucket.start} opacity={dimmed ? 0.35 : hovered === index ? 0.8 : 1}>
              <rect x={x} y={HEIGHT - others} width={BAR_WIDTH - 2} height={others} className="fill-slate-400 dark:fill-slate-500" />
              <rect x={x} y={HEIGHT - others - warnings} width={BAR_WIDTH - 2} height={warnings} className="fill-amber-400" />
              {/* Errors get at least a sliver, so a single error among thousands still shows. */}
              <rect
                x={x}
                y={HEIGHT - others - warnings - Math.max(bucket.errors > 0 ? 2 : 0, errors)}
                width={BAR_WIDTH - 2}
                height={Math.max(bucket.errors > 0 ? 2 : 0, errors)}
                className="fill-rose-500"
              />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
        <span>{formatRangeTime(buckets[0].start)}</span>
        <span>{formatRangeTime(buckets[buckets.length - 1].end - 1)}</span>
      </div>
    </div>
  );
}
