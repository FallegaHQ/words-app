import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.softwyx.words',
  appName: 'Words',
  webDir: 'dist',
  server: {
    androidScheme: 'http'
  }
};

export default config;