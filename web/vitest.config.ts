import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    env: loadEnv(mode, __dirname, ''),
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
  },
}))
