import { Capacitor } from '@capacitor/core';
import { navigateTo, pathForDeepLink } from './lib/appNavigation';
import { listenForNotificationActions } from './lib/notifications/native';

// Start-up work that depends on where ZarooriBox runs: the phone app (Capacitor) or
// a browser, where it can be installed to the home screen as a web app.

export async function initPlatform() {
  if (Capacitor.isNativePlatform()) {
    document.documentElement.classList.add('native-app');
    const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
      import('@capacitor/app'),
      import('@capacitor/status-bar'),
      import('@capacitor/splash-screen'),
    ]);
    StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    // Android hardware back: go back inside the app, leave it from the top level.
    App.addListener('backButton', ({ canGoBack }) => {
      const top = ['/', '/app', '/login'].includes(location.pathname);
      if (canGoBack && !top) history.back();
      else App.minimizeApp().catch(() => App.exitApp());
    });
    // Home-screen shortcuts ("Add by voice") and Share to ZarooriBox arrive as app.zaroori:// links.
    const open = (url?: string | null) => {
      const path = url ? pathForDeepLink(url) : null;
      if (path) navigateTo(path);
    };
    App.addListener('appUrlOpen', ({ url }) => open(url));
    App.getLaunchUrl()
      .then((r) => open(r?.url))
      .catch(() => {});
    void listenForNotificationActions();
    setTimeout(() => SplashScreen.hide().catch(() => {}), 150);
    return;
  }
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}
