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
  test: {
    coverage: {
      enabled: true,
      reporter: ['text', 'text-summary', 'html', 'json'],
      reportsDirectory: './coverage',
      include: ['src/modbus.ts'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        '**/*.config.*',
        '**/*.test.*',
        'test/**',
        'src/App.tsx',
        'src/main.tsx',
        'src/types.ts',
        'src/serial.ts',
      ],
      thresholds: {
        statements: 90,
        branches: 85,
        lines: 90,
        functions: 90,
      },
    },
  },
})
