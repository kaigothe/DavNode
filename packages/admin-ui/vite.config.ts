import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The Express server serves the build under /admin-ui (M14); the dev server
// forwards API calls to a locally running server so the app can be developed
// against real data on the same origin.
const API_TARGET = process.env.DAVNODE_DEV_API ?? 'http://127.0.0.1:8080';

export default defineConfig({
  base: '/admin-ui/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/admin': API_TARGET },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // React rarely changes; keeping it apart keeps it cached across releases.
        manualChunks(id) {
          if (
            /node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)
          ) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
});
