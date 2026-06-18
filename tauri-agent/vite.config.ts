import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],

  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // 重依赖单独懒加载分包（与核心 UI 运行时无循环引用）。
          if (id.includes('mermaid') || id.includes('cytoscape')) return 'mermaid';
          if (id.includes('/shiki/') || id.includes('monaco-editor')) return 'highlighter';
          // 核心 UI 运行时：react / react-dom / antd / antd-style / @lobehub/ui / motion 彼此
          // 紧密依赖，必须同处一个 chunk。若拆成多个 chunk 会形成循环 chunk 依赖（antd ↔
          // react-vendor ↔ lobe-ui ↔ motion），生产构建里按加载顺序初始化时会出现某个 chunk
          // 的导出仍为 undefined，导致启动即崩、白屏/永久卡在加载页。
          if (
            id.includes('/react/') ||
            id.includes('react-dom') ||
            id.includes('/scheduler/') ||
            id.includes('/antd/') ||
            id.includes('antd-style') ||
            id.includes('@lobehub/') ||
            id.includes('/motion/') ||
            id.includes('/framer-motion/')
          ) {
            return 'vendor';
          }
        },
      },
    },
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}));
