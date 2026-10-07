import type { CapacitorConfig } from '@capacitor/cli';

// Phone app (Android + iOS) wrapping the same React build in dist/.
// After `npm run build`, run `npx cap sync` to copy it into android/ and ios/.
const config: CapacitorConfig = {
  appId: 'app.zaroori',
  appName: 'Zaroori',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 1500, launchAutoHide: false, backgroundColor: '#F7F5F2', showSpinner: false },
    LocalNotifications: { smallIcon: 'ic_stat_zaroori', iconColor: '#17745D' },
  },
};

export default config;
