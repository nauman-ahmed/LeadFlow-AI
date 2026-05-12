import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Dev server uses index.html (a tiny test harness page).
  // `vite build` produces a single IIFE bundle suitable for <script src> embedding.
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.tsx'),
      name: 'LeadFlow',
      fileName: () => 'leadflow-widget.js',
      formats: ['iife']
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        extend: true
      }
    },
    cssCodeSplit: false,
    sourcemap: command === 'build' ? 'hidden' : true,
    minify: command === 'build'
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(command === 'build' ? 'production' : 'development')
  },
  server: {
    port: 5173,
    open: false
  }
}));
