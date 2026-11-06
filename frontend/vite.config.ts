import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    },
    fs: {
      // 允許存取 public 目錄外的檔案
      strict: false
    }
  },
  // Worker 使用 ES module 格式（Demucs Worker 與 ffmpeg.wasm 內部 Worker 皆需要）
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    // ffmpeg.wasm 0.12 以 new URL('./worker.js', import.meta.url) 建立 Worker，不可預先打包
    exclude: ['onnxruntime-web', '@ffmpeg/ffmpeg', '@ffmpeg/util']
  }
})
