import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
    sourcemap: true,
  },
  plugins: [preact()],
  publicDir: 'public', // Ensure public assets are copied to dist
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  root: '.',
  server: {
    open: true,
    port: 3000,
  },
})
