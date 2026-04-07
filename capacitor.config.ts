import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.watchr.app',
  appName: 'Watchr',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    backgroundColor: '#0A0A0A',
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0A7C5C',
      showSpinner: false,
      launchAutoHide: true,
      fadeOutDuration: 300,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A0A0A',
    },
  },
};

export default config;
