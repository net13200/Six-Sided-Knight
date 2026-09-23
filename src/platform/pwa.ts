/**
 * Installable app support: registers the service worker (production builds
 * only) and tells it which files this build uses, so the game works offline
 * once installed and old builds' files are pruned.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then(async (reg) => {
        await navigator.serviceWorker.ready;
        const urls = [
          location.href.split('#')[0]!.split('?')[0]!,
          ...performance
            .getEntriesByType('resource')
            .map((e) => e.name)
            .filter((u) => u.startsWith(location.origin) && /\/assets\//.test(u)),
        ];
        (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: 'files', urls });
      })
      .catch(() => undefined); // offline support is a bonus, never an error
  });
}
