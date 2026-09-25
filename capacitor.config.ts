import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'it.volantinipro.driver',
  appName: 'VolantiniPro Driver',
  webDir: 'dist',
  android: {
    useLegacyBridge: true,
  },
};

export default config;
