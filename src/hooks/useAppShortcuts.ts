import { useEffect } from 'react';

interface AppShortcuts {
  onToggleWordWrap: () => void;
  onOpenSettings: () => void;
  /** Esc: closes the settings, or clears the text typed in the search box. */
  onEscape: () => void;
}

/** Window-wide shortcuts: Ctrl+F (search), Ctrl+Shift+W (word wrap), Ctrl+, (settings) and Esc. */
export function useAppShortcuts({ onToggleWordWrap, onOpenSettings, onEscape }: AppShortcuts) {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const control = event.ctrlKey || event.metaKey;
      if (control && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        document.getElementById('search-log-input')?.focus();
      } else if (control && event.shiftKey && event.key.toLowerCase() === 'w') {
        event.preventDefault();
        onToggleWordWrap();
      } else if (control && event.key === ',') {
        event.preventDefault();
        onOpenSettings();
      } else if (event.key === 'Escape') {
        onEscape();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [onToggleWordWrap, onOpenSettings, onEscape]);
}
