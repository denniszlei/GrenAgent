// build.mjs —— 用 esbuild JS API 打包 TypeScript，并从文件读取 banner。
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const banner = readFileSync(new URL('./sea-banner.js', import.meta.url), 'utf8');

await build({
  entryPoints: ['app.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node25',
  outfile: 'dist/app.bundle.js',
  external: ['onnxruntime-node', 'onnxruntime-common', 'sharp'],
  banner: { js: banner },
  logLevel: 'info',
});
