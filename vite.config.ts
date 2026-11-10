import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

const APP_VERSION = '1.8.0';

function mypcVersionPlugin(): Plugin {
  return {
    name: 'mypc-version-query',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/(src="\.\/assets\/[^"?]+)"/g, `$1?v=${APP_VERSION}"`)
        .replace(/(href="\.\/assets\/[^"?]+)"/g, `$1?v=${APP_VERSION}"`);
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    build: {
      outDir: 'docs',
      emptyOutDir: true,
      target: 'chrome108',
      rollupOptions: {
        output: {
          entryFileNames: 'assets/app.js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
    plugins: [react(), tailwindcss(), mypcVersionPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
