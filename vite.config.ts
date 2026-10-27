import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'

const watchExclude = [
  'node_modules/**',
  'dist/**',
  'dist-electron/**',
  'release/**',
  '.git/**',
]

export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'test' ? [] : [electron({
      main: { entry: 'electron/main.ts', vite: { build: { watch: command === 'serve' ? { exclude: watchExclude } : null } } },
      preload: { input: 'electron/preload.ts', vite: { build: { watch: command === 'serve' ? { exclude: watchExclude } : null } } },
      renderer: {},
    })]),
  ],
  server: {
    watch: { ignored: watchExclude.map((p) => `**/${p}`) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
}))
