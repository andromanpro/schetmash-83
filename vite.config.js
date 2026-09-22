import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  resolve: {
    alias: [
      { find: /^three$/, replacement: resolve(import.meta.dirname, 'node_modules/three/src/Three.js') },
    ],
  },
  define: {
    __BUILD_INFO__: JSON.stringify(`prototype 0.4 · ${new Date().toLocaleDateString('ru-RU')}`),
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
});
