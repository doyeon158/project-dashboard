import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// 로컬 실행용 설정. 빌드 결과(dist)는 server.mjs 가 서빙한다.
const DATA_SERVER_PORT = process.env.DATA_PORT || '5187'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5188,
    // 개발 서버(npm run dev)에서도 저장이 되도록 API는 로컬 데이터 서버로 넘긴다
    proxy: {
      '/api': { target: `http://127.0.0.1:${DATA_SERVER_PORT}`, changeOrigin: true },
    },
  },
})
