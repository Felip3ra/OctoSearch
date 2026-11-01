// Applies the saved theme before the first paint (kept in a file so the CSP can forbid inline scripts).
try {
  const savedTheme = localStorage.getItem('log-viewer-theme');
  const useDarkTheme = savedTheme
    ? savedTheme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', useDarkTheme);
  document.documentElement.style.colorScheme = useDarkTheme ? 'dark' : 'light';
} catch (_) {
  // The application still works if browser storage is unavailable.
}
