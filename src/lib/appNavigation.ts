// Lets code outside React (notification taps, deep links, the service worker)
// move the app to a screen. Requests made before the app has mounted are queued.

type Navigate = (path: string) => void;

let navigator: Navigate | null = null;
let queued: string | null = null;

export function navigateTo(path: string) {
  if (navigator) navigator(path);
  else queued = path;
}

/** Called by the app shell once the router is ready. Returns an unregister function. */
export function registerNavigator(fn: Navigate) {
  navigator = fn;
  if (queued) {
    const p = queued;
    queued = null;
    fn(p);
  }
  return () => {
    if (navigator === fn) navigator = null;
  };
}

/** Maps a deep link (app.zaroori://add?voice=1, app.zaroori://share?text=…) to an app path. */
export function pathForDeepLink(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'app.zaroori:') return null;
  // "app.zaroori://add?voice=1": the host is the screen.
  const screen = u.host || u.pathname.replace(/^\/+/, '');
  if (screen === 'add') return `/app?${u.searchParams.get('voice') === '1' ? 'voice=1' : 'add=1'}`;
  if (screen === 'scan') return '/app/add?scan=1';
  if (screen === 'home') return '/app';
  if (screen === 'shopping') return '/app/shopping';
  if (screen === 'share') return `/app/share?${u.searchParams.toString()}`;
  if (screen === 'act') return `/app/act?${u.searchParams.toString()}`;
  // Back from Google's consent page: Settings finishes connecting Google Drive.
  if (screen === 'drive-callback') return `/app/settings?drive=1&${u.searchParams.toString()}`;
  return null;
}
