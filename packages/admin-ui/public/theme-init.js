/* global window, document */
// Runs before the first paint (loaded synchronously from index.html, so the
// page stays CSP-clean): applies the saved theme so a dark-mode user never
// sees a white flash. "system" sets nothing; the stylesheet follows the OS.
try {
  var mode = window.localStorage.getItem('davnode.theme');
  if (mode === 'light' || mode === 'dark') {
    document.documentElement.setAttribute('data-theme', mode);
  }
} catch {
  /* storage blocked: fall back to the system theme */
}
