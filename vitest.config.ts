/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
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
      include: ['src/modbus.ts'],
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        branches: 85,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
})
