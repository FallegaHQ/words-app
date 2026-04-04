import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    forwardConsole: {
      unhandledErrors: true, // Forwards uncaught exceptions & promise rejections
      logLevels: ['error', 'warn'], // Choose which console levels to forward
    },
  },
})
