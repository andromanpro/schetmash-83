import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig(({ mode }) => ({
  server: mode === 'test' ? { hmr: false, watch: null } : undefined,
  base: './',
  resolve: {
    alias: [
      { find: /^three$/, replacement: resolve(import.meta.dirname, 'node_modules/three/src/Three.js') },
    ],
  },
  define: {
    __BUILD_INFO__: JSON.stringify(`v${version} · ${new Date().toLocaleDateString('ru-RU')}`),
  },
  build: {
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            { name: 'three-core', test: /node_modules[\\/]three[\\/]src[\\/]/, priority: 30 },
            { name: 'three-addons', test: /node_modules[\\/]three[\\/]examples[\\/]jsm[\\/]/, priority: 20 },
          ],
        },
      },
    },
  },
}));
