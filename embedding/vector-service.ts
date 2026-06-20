// vector-service.ts —— 核心向量服务（TypeScript，最终打包为 CommonJS）
// 在普通 node 环境与 SEA（单可执行）环境中均可运行。

import path = require('node:path');
import Module = require('node:module');

type SeaApi = {
  isSea?: () => boolean;
};

type TransformerEnv = {
  cacheDir: string;
  remoteHost?: string;
};

type TensorLike = {
  data: Iterable<number> | ArrayLike<number>;
};

type FeatureExtractor = (text: string, options: { pooling: 'mean'; normalize: boolean }) => Promise<TensorLike>;

type Transformers = {
  env: TransformerEnv;
  pipeline: (
    task: 'feature-extraction',
    model: string,
    options: { quantized: boolean },
  ) => Promise<FeatureExtractor>;
};

// ---------- 1) SEA 环境检测 ----------
let sea: SeaApi | null = null;
try { sea = require('node:sea') as SeaApi; } catch (_) { sea = null; }
export const isSea = !!(sea && typeof sea.isSea === 'function' && sea.isSea());

// SEA 中 __dirname 指向 blob 内部（只读），改用可执行文件所在目录做运行时根目录。
// 普通环境就是 embedding/ 本身。
export const APP_ROOT = isSea ? path.dirname(process.execPath) : __dirname;

// ---------- 2) SEA 下「能读磁盘」的 require ----------
//
// 关键限制：Node 25 SEA 的 main 脚本里，require() 被 SEA 内部的 embedderRequire
// 接管，只认 node: 内置模块；require 第三方包会抛 ERR_UNKNOWN_BUILTIN_MODULE。
// （注意：patch Module._load 无效，因为 embedderRequire 走 node:internal/main，
//  绕过了 Module._load。）
//
// 解法放在打包阶段：build:bundle 用 esbuild banner 把 sea-banner.js 的内容注入
// 到 bundle IIFE 之前。banner 里在 bundle 顶层作用域重新声明 require，对第三方
// 裸包名走 createRequire(磁盘)，对 node: 内置模块透传。
const realRequire = Module.createRequire(path.join(APP_ROOT, 'package.json'));
(globalThis as typeof globalThis & { __seaRequire?: NodeRequire }).__seaRequire = realRequire;

// ---------- 3) 模型加载 ----------
let pipe: FeatureExtractor | null = null;
const MODEL_ID = process.env.EMBED_MODEL || 'Xenova/all-MiniLM-L6-v2';

async function getPipeline(): Promise<FeatureExtractor> {
  if (pipe) return pipe;

  // transformers.js v3 同时提供 CJS 与 ESM 入口。
  // esbuild 已将其 inline 进 bundle；SEA 下 external 原生包由 sea-banner.js 的 require shim 加载。
  const { pipeline, env } = require('@huggingface/transformers') as Transformers;
  env.cacheDir = path.join(APP_ROOT, '.models');

  // 国内网络兜底：HF_ENDPOINT=https://hf-mirror.com。
  // 设为 "0" / "false" 可关闭，强制用官方源。
  const endpoint = process.env.HF_ENDPOINT;
  if (endpoint && !['0', 'false', ''].includes(endpoint.toLowerCase())) {
    env.remoteHost = endpoint.replace(/\/$/, '');
  }

  pipe = await pipeline('feature-extraction', MODEL_ID, { quantized: true });
  return pipe;
}

/**
 * 把一段文本转换成向量（L2 归一化后的浮点数组）。
 */
export async function getEmbedding(text: string): Promise<number[]> {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('text must be a non-empty string');
  }
  const extractor = await getPipeline();
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data as ArrayLike<number>);
}
