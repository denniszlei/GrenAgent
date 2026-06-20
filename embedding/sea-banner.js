// sea-banner.js —— 注入到 esbuild bundle 最顶部（IIFE 之前）。
//
// 背景：Node 25 SEA 的 main 脚本里，require() 被 SEA 内部的 embedderRequire
// 接管，只认 node: 内置模块，require 第三方包会抛 ERR_UNKNOWN_BUILTIN_MODULE。
// esbuild 把 onnxruntime-node 标为 external 后，bundle 内部会生成裸
// require("onnxruntime-node") —— 这个 require 在 SEA 里就是 embedderRequire，必挂。
//
// 解法：在 bundle 顶层（IIFE 之前）用 var 重新声明 require，对裸包名走真实磁盘
// 的 createRequire，对 node: 内置模块透传给 SEA 原生 require。
//
// 注意：这必须用 esbuild --banner 注入到 bundle 文本最前面，不能放在 app.js 里
// （app.js 在 IIFE 内部，重新声明的 require 进不了 IIFE 内部模块的作用域链）。
if (typeof require !== 'undefined' && typeof __seaOriginalRequire === 'undefined') {
  // 仅在 SEA 环境启用。普通 node 下保持原生 require 不变。
  var __seaIsSea = false;
  try {
    var __seaMod = require('node:sea');
    __seaIsSea = __seaMod && typeof __seaMod.isSea === 'function' && __seaMod.isSea();
  } catch (e) {}
  if (__seaIsSea) {
    var __seaOriginalRequire = require;
    var __seaPath = require('node:path');
    var __seaAppRoot = __seaPath.dirname(process.execPath);
    var __seaModule = require('node:module');
    var __seaRealRequire = __seaModule.createRequire(__seaPath.join(__seaAppRoot, 'package.json'));
    // 重写 require：内置模块透传，第三方裸包走磁盘。
    require = function __seaRequireShim(request) {
      if (typeof request === 'string' && (
        request.startsWith('node:') ||
        request.startsWith('./') ||
        request.startsWith('../') ||
        __seaPath.isAbsolute(request)
      )) {
        return __seaOriginalRequire(request);
      }
      return __seaRealRequire(request);
    };
  }
}
