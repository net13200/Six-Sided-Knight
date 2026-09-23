/**
 * Installable app support: registers the service worker (production builds
 * only) and tells it which files this build uses, so the game works offline
 * once installed and old builds' files are pruned.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // A new version took over (it was downloaded in the background): offer a reload.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showUpdateToast();
  });
  // An installed app can stay open for days: when it comes back to the
  // foreground, check whether the site now serves a newer build.
  let lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 10 * 60_000) return;
    lastCheck = Date.now();
    void checkForNewBuild();
  });
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

/** The main script of a build, e.g. "assets/index-AbC123.js". */
export function buildScript(html: string): string | null {
  return /assets\/index-[\w-]+\.js/.exec(html)?.[0] ?? null;
}

async function checkForNewBuild(): Promise<void> {
  try {
    const res = await fetch('./', { cache: 'no-store' });
    if (!res.ok) return;
    const latest = buildScript(await res.text());
    const current = buildScript(document.documentElement.outerHTML);
    if (latest && current && latest !== current) showUpdateToast();
  } catch {
    // offline: nothing to do
  }
}

/** A small, dismissable bar: the new version is ready, tap to use it. */
function showUpdateToast(): void {
  if (document.getElementById('update-toast')) return;
  const bar = document.createElement('div');
  bar.id = 'update-toast';
  bar.setAttribute('role', 'status');
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'New version ready · Reload';
  reload.dataset.testid = 'update-reload';
  reload.addEventListener('click', () => location.reload());
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Later');
  close.addEventListener('click', () => bar.remove());
  bar.append(reload, close);
  document.body.append(bar);
}
