import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: true,
    proxy: { '/api': { target: 'http://localhost:8081', changeOrigin: true } },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    // Tes memakai path relatif; abaikan alamat backend dari .env agar hasil tes konsisten.
    env: { VITE_API_BASE_URL: '', VITE_DELCOM_BASEURL: '' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/setupTests.js', 'src/testUtils.jsx', 'src/**/*.test.{js,jsx}'],
      reporter: ['text', 'json', 'html'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
})
