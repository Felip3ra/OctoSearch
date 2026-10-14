import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  Pencil,
  Play,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { FilterOperator, LogLevel, SavedFilter, SearchFilter } from '../types';
import { findSavedFilter, listFilterGroups, upsertSavedFilter } from '../services/filterStorage';
import { getIncludeBlocks } from '../services/logSearch';

interface SavedFiltersModalProps {
  isOpen: boolean;
  savedFilters: SavedFilter[];
  currentFilters: SearchFilter[];
  currentOperator: FilterOperator;
  currentLevel: LogLevel;
  onChange: (savedFilters: SavedFilter[]) => void;
  onApply: (savedFilter: SavedFilter) => void;
  onClose: () => void;
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  ALL: 'Todos',
  ERR: 'ERR',
  WRN: 'WRN',
  INF: 'INF',
  DBG: 'DBG',
  OTHER: 'Outros',
};

const NO_GROUP_LABEL = 'Sem grupo';

const inputClass =
  'mt-1 w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500';

const groupKey = (group: string) => group.trim().toLocaleLowerCase('pt-BR');

/** Compact read-only rendering of a filter set: "(+a e +b) ou +c · e não −d · Nível ERR". */
export function FilterSummary({
  filters,
  operator,
  level,
}: Readonly<{ filters: SearchFilter[]; operator: FilterOperator; level: LogLevel }>) {
  const blocks = getIncludeBlocks(filters, operator);
  const excludes = filters.filter((filter) => filter.mode === 'exclude');
  const connectorClass = 'font-semibold uppercase text-slate-400';
  const term = (filter: SearchFilter) => (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 font-mono text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
      +{filter.text}
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 text-[10px]">
      {blocks.map((block, blockIndex) => {
        const grouped = blocks.length > 1 && block.length > 1;
        return (
          <React.Fragment key={block[0].id}>
            {blockIndex > 0 && <span className={connectorClass}>ou</span>}
            {grouped && <span className="text-slate-400">(</span>}
            {block.map((filter, termIndex) => (
              <React.Fragment key={filter.id}>
                {termIndex > 0 && <span className={`${connectorClass} text-violet-500 dark:text-violet-400`}>e</span>}
                {term(filter)}
              </React.Fragment>
            ))}
            {grouped && <span className="text-slate-400">)</span>}
          </React.Fragment>
        );
      })}
      {excludes.map((filter, index) => (
        <React.Fragment key={filter.id}>
          <span className="font-semibold uppercase text-slate-400">
            {index === 0 ? (blocks.length > 0 ? 'e não' : 'sem') : 'nem'}
          </span>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-1.5 font-mono text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300">
            −{filter.text}
          </span>
        </React.Fragment>
      ))}
      {level !== 'ALL' && (
        <span className="rounded-full border border-sky-200 bg-sky-50 px-1.5 font-medium text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300">
          Nível {LEVEL_LABELS[level]}
        </span>
      )}
      {filters.length === 0 && level === 'ALL' && <span className="italic text-slate-400">sem condições</span>}
    </div>
  );
}

export function SavedFiltersModal({
  isOpen,
  savedFilters,
  currentFilters,
  currentOperator,
  currentLevel,
  onChange,
  onApply,
  onClose,
}: Readonly<SavedFiltersModalProps>) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [query, setQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const hasCurrentFilters = currentFilters.length > 0 || currentLevel !== 'ALL';

  useEffect(() => {
    if (!isOpen) return;
    setEditingId(null);
    setRenamingGroup(null);
    if (hasCurrentFilters) setTimeout(() => nameInputRef.current?.focus(), 0);
  }, [isOpen, hasCurrentFilters]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    globalThis.addEventListener('keydown', handleKey);
    return () => globalThis.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const groups = useMemo(() => listFilterGroups(savedFilters), [savedFilters]);

  const sections = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    const matches = savedFilters.filter((item) => {
      if (!normalizedQuery) return true;
      return [item.name, item.group, ...item.filters.map((filter) => filter.text)]
        .join('\n')
        .toLocaleLowerCase('pt-BR')
        .includes(normalizedQuery);
    });
    const byGroup = new Map<string, { label: string; items: SavedFilter[] }>();
    for (const item of matches) {
      const key = groupKey(item.group);
      const section = byGroup.get(key) || { label: item.group.trim(), items: [] };
      section.items.push(item);
      byGroup.set(key, section);
    }
    return [...byGroup.entries()]
      .map(([key, section]) => ({
        key,
        label: section.label,
        items: section.items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      }))
      .sort((a, b) => {
        if (!a.key) return 1;
        if (!b.key) return -1;
        return a.label.localeCompare(b.label, 'pt-BR');
      });
  }, [savedFilters, query]);

  if (!isOpen) return null;

  const willOverwrite = name.trim() !== '' && Boolean(findSavedFilter(savedFilters, name, group));

  const handleSave = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !hasCurrentFilters) return;
    onChange(
      upsertSavedFilter(savedFilters, {
        name,
        group,
        filters: currentFilters,
        includeOperator: currentOperator,
        levelFilter: currentLevel,
      })
    );
    setName('');
  };

  const startEditing = (item: SavedFilter) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditGroup(item.group);
  };

  const commitEditing = () => {
    if (!editingId) return;
    const trimmedName = editName.trim();
    if (!trimmedName) return;
    const clash = findSavedFilter(savedFilters, trimmedName, editGroup);
    if (clash && clash.id !== editingId) {
      globalThis.alert(`Já existe um filtro chamado "${trimmedName}" nesse grupo.`);
      return;
    }
    onChange(
      savedFilters.map((item) =>
        item.id === editingId ? { ...item, name: trimmedName, group: editGroup.trim(), updatedAt: Date.now() } : item
      )
    );
    setEditingId(null);
  };

  const handleDelete = (item: SavedFilter) => {
    if (!globalThis.confirm(`Excluir o filtro salvo "${item.name}"?`)) return;
    onChange(savedFilters.filter((saved) => saved.id !== item.id));
  };

  const commitGroupRename = (oldKey: string) => {
    const nextGroup = groupDraft.trim();
    const moved = savedFilters.filter((item) => groupKey(item.group) === oldKey);
    const clash = moved.find((item) => {
      const other = findSavedFilter(savedFilters, item.name, nextGroup);
      return other && groupKey(other.group) !== oldKey;
    });
    if (clash) {
      globalThis.alert(`O grupo "${nextGroup || NO_GROUP_LABEL}" já tem um filtro chamado "${clash.name}".`);
      return;
    }
    onChange(
      savedFilters.map((item) => (groupKey(item.group) === oldKey ? { ...item, group: nextGroup, updatedAt: Date.now() } : item))
    );
    setRenamingGroup(null);
  };

  const handleDeleteGroup = (key: string, label: string, count: number) => {
    if (!globalThis.confirm(`Excluir o grupo "${label}" e seus ${count} filtro(s) salvo(s)?`)) return;
    onChange(savedFilters.filter((item) => groupKey(item.group) !== key));
  };

  const toggleGroup = (key: string) =>
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4">
      <button type="button" aria-label="Fechar filtros salvos" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative z-10 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[95dvh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
        <div className="px-3 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-2 min-w-0">
            <Bookmark className="w-4 h-4 text-sky-500 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-bold text-sm">Filtros salvos</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Guarde combinações de busca com um nome e organize em grupos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Fechar (Esc)"
            className="p-1.5 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 space-y-2.5">
          <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Filtros atuais</div>
          {hasCurrentFilters ? (
            <FilterSummary filters={currentFilters} operator={currentOperator} level={currentLevel} />
          ) : (
            <p className="text-[11px] text-slate-400">
              Nenhum filtro ativo. Adicione termos na busca (Enter inclui, Shift+Enter exclui) ou escolha um nível para poder salvar.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[160px] text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              <span>Nome</span>
              <input
                ref={nameInputRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!hasCurrentFilters}
                placeholder="Ex.: Erros de pagamento"
                className={`${inputClass} disabled:opacity-50`}
              />
            </label>
            <label className="flex-1 min-w-[140px] text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              <span>Grupo (opcional)</span>
              <input
                value={group}
                onChange={(event) => setGroup(event.target.value)}
                disabled={!hasCurrentFilters}
                list="saved-filter-groups"
                placeholder="Ex.: Produção"
                className={`${inputClass} disabled:opacity-50`}
              />
            </label>
            <button
              type="submit"
              disabled={!hasCurrentFilters || !name.trim()}
              title={willOverwrite ? 'Já existe um filtro com esse nome nesse grupo: ele será substituído' : 'Salvar os filtros atuais'}
              className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {willOverwrite ? 'Substituir' : 'Salvar'}
            </button>
          </div>
          <datalist id="saved-filter-groups">
            {groups.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </form>

        {savedFilters.length > 0 && (
          <div className="px-3 sm:px-4 pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Procurar por nome, grupo ou termo…"
                className="w-full pl-8 pr-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          {savedFilters.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">Nenhum filtro salvo ainda.</div>
          ) : sections.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">Nenhum filtro encontrado para "{query}".</div>
          ) : (
            sections.map((section) => {
              const label = section.label || NO_GROUP_LABEL;
              const isCollapsed = collapsedGroups.has(section.key) && !query.trim();
              return (
                <section key={section.key || '__none__'} className="rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="group/header flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/60 rounded-t-lg">
                    {renamingGroup === section.key ? (
                      <form
                        className="flex flex-1 items-center gap-1.5"
                        onSubmit={(event) => {
                          event.preventDefault();
                          commitGroupRename(section.key);
                        }}
                      >
                        <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <input
                          autoFocus
                          value={groupDraft}
                          onChange={(event) => setGroupDraft(event.target.value)}
                          placeholder={NO_GROUP_LABEL}
                          className="flex-1 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                        <button type="submit" title="Salvar nome do grupo" className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" title="Cancelar" onClick={() => setRenamingGroup(null)} className="p-1 rounded text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleGroup(section.key)}
                          className="flex flex-1 min-w-0 items-center gap-1.5 text-left text-xs font-semibold cursor-pointer"
                        >
                          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                          <Folder className={`w-3.5 h-3.5 shrink-0 ${section.key ? 'text-amber-500' : 'text-slate-400'}`} />
                          <span className={`truncate ${section.key ? '' : 'italic text-slate-500 dark:text-slate-400'}`}>{label}</span>
                          <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            {section.items.length}
                          </span>
                        </button>
                        {section.key && (
                          <div className="flex items-center gap-0.5 opacity-60 group-hover/header:opacity-100">
                            <button
                              type="button"
                              title="Renomear grupo"
                              onClick={() => {
                                setRenamingGroup(section.key);
                                setGroupDraft(section.label);
                              }}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              title="Excluir grupo e seus filtros"
                              onClick={() => handleDeleteGroup(section.key, label, section.items.length)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {!isCollapsed && (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {section.items.map((item) => (
                        <li key={item.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2 px-2.5 py-2">
                          {editingId === item.id ? (
                            <form
                              className="flex flex-1 flex-wrap items-end gap-2"
                              onSubmit={(event) => {
                                event.preventDefault();
                                commitEditing();
                              }}
                            >
                              <label className="flex-1 min-w-[140px] text-[10px] font-semibold text-slate-500">
                                <span>Nome</span>
                                <input autoFocus value={editName} onChange={(event) => setEditName(event.target.value)} className={inputClass} />
                              </label>
                              <label className="flex-1 min-w-[120px] text-[10px] font-semibold text-slate-500">
                                <span>Grupo</span>
                                <input
                                  value={editGroup}
                                  onChange={(event) => setEditGroup(event.target.value)}
                                  list="saved-filter-groups"
                                  placeholder={NO_GROUP_LABEL}
                                  className={inputClass}
                                />
                              </label>
                              <button type="submit" disabled={!editName.trim()} title="Salvar alterações" className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-40 cursor-pointer">
                                <Check className="w-4 h-4" />
                              </button>
                              <button type="button" title="Cancelar" onClick={() => setEditingId(null)} className="p-1.5 rounded text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer">
                                <X className="w-4 h-4" />
                              </button>
                            </form>
                          ) : (
                            <>
                              <div className="flex-1 min-w-[160px] space-y-1">
                                <div className="text-xs font-semibold break-all">{item.name}</div>
                                <FilterSummary filters={item.filters} operator={item.includeOperator} level={item.levelFilter} />
                              </div>
                              <div className="flex items-center gap-1 ml-auto">
                                <button
                                  type="button"
                                  onClick={() => onApply(item)}
                                  title="Aplicar na aba atual (substitui os filtros atuais)"
                                  className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                  <Play className="w-3 h-3" />
                                  Aplicar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startEditing(item)}
                                  title="Renomear ou mover para outro grupo"
                                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(item)}
                                  title="Excluir filtro salvo"
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
