import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Highlighter, Plus, Trash2, X } from 'lucide-react';
import { HighlightRule } from '../types';
import { DEFAULT_HIGHLIGHT_COLOR, normalizeHighlightColor } from '../utils/highlightColor';

interface HighlightRulesModalProps {
  isOpen: boolean;
  rules: HighlightRule[];
  onChange: (rules: HighlightRule[]) => void;
  onClose: () => void;
}

function createRuleId(): string {
  return globalThis.crypto?.randomUUID?.() || `highlight-${Date.now()}`;
}

export function HighlightRulesModal({
  isOpen,
  rules,
  onChange,
  onClose,
}: Readonly<HighlightRulesModalProps>) {
  const [text, setText] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_HIGHLIGHT_COLOR);
  const [caseSensitive, setCaseSensitive] = useState(false);

  if (!isOpen) return null;

  const handleAdd = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedText = text.trim();
    if (!normalizedText) return;

    onChange([
      ...rules,
      {
        id: createRuleId(),
        text: normalizedText,
        color,
        caseSensitive,
        enabled: true,
      },
    ]);
    setText('');
  };

  const updateRule = (ruleId: string, updates: Partial<HighlightRule>) => {
    onChange(rules.map((rule) => (rule.id === ruleId ? { ...rule, ...updates } : rule)));
  };

  const moveRule = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= rules.length) return;
    const reordered = [...rules];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    onChange(reordered);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4"
    >
      <button
        type="button"
        aria-label="Fechar marcadores de linha"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        className="relative z-10 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[95dvh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100"
      >
        <div className="px-3 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-2 min-w-0">
            <Highlighter className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-bold text-sm">Marcadores de linha</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                A primeira regra correspondente define a cor da linha.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Fechar"
            className="p-1.5 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleAdd}
          className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-end gap-2 bg-white dark:bg-slate-900"
        >
          <label className="flex-1 min-w-[180px] text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            <span>Texto contido na linha</span>
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Ex.: timeout, exception, pedido processado"
              className="mt-1 w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
              autoFocus
            />
          </label>

          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            <span>Cor RGB</span>
            <span className="mt-1 flex h-[30px] items-center gap-2 rounded border border-slate-300 bg-white px-1.5 dark:border-slate-600 dark:bg-slate-800">
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value.toUpperCase())}
                className="h-5 w-7 cursor-pointer border-0 bg-transparent p-0"
                title="Escolher cor RGB"
                aria-label="Escolher cor RGB da nova regra"
              />
              <span className="font-mono text-[10px] font-normal uppercase">{color}</span>
            </span>
          </label>

          <label className="flex items-center gap-1.5 py-1.5 text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(event) => setCaseSensitive(event.target.checked)}
            />
            <span>Diferenciar maiúsculas</span>
          </label>

          <button
            type="submit"
            disabled={!text.trim()}
            className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar
          </button>
        </form>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
          {rules.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              Nenhuma regra configurada.
            </div>
          ) : (
            rules.map((rule, index) => {
              const ruleColor = normalizeHighlightColor(rule.color) || DEFAULT_HIGHLIGHT_COLOR;
              return (
                <div
                  key={rule.id}
                  className={`flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 rounded-lg border ${
                    rule.enabled
                      ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70'
                      : 'border-slate-200/60 dark:border-slate-800 opacity-55'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                    title={rule.enabled ? 'Desativar regra' : 'Ativar regra'}
                    className={`w-5 h-5 rounded flex items-center justify-center border cursor-pointer ${
                      rule.enabled
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-slate-400 text-transparent'
                    }`}
                  >
                    <Check className="w-3 h-3" />
                  </button>

                  <input
                    type="color"
                    value={ruleColor}
                    onChange={(event) =>
                      updateRule(rule.id, { color: event.target.value.toUpperCase() })
                    }
                    className="h-8 w-8 shrink-0 cursor-pointer rounded border border-slate-300 bg-transparent p-0.5 dark:border-slate-600"
                    title="Alterar cor RGB da regra"
                    aria-label={`Alterar cor da regra ${rule.text}`}
                  />

                  <div className="flex-1 min-w-[140px]">
                    <div className="font-mono text-xs break-all">{rule.text}</div>
                    <div className="text-[10px] text-slate-400">
                      {ruleColor} · {rule.caseSensitive ? 'maiúsculas exatas' : 'ignora maiúsculas'}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      type="button"
                      onClick={() => moveRule(index, -1)}
                      disabled={index === 0}
                      title="Aumentar prioridade"
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-25 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRule(index, 1)}
                      disabled={index === rules.length - 1}
                      title="Diminuir prioridade"
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-25 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange(rules.filter((item) => item.id !== rule.id))}
                      title="Excluir regra"
                      className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
