// 代码图谱引擎注册表。纯元数据 + 纯函数，无 I/O，便于测试与互换。
import type { McpServerConfig } from "../mcp/config.js";

export interface CodeIntelEngine {
  /** 注入用的规范 MCP server 名（也是让位判定的同名键）。 */
  serverName: string;
  /** 该引擎暴露的工具前缀，用于「签名识别」用户自配同类引擎。 */
  toolPrefix: string;
  /** 由捆绑目录与平台构建 stdio McpServerConfig。 */
  buildConfig: (pkgDir: string, platform: string) => McpServerConfig;
}

// CodeGraph 是「目录型 bundle」（bundled Node + lib/dist + bin launcher），不是单文件二进制。
// build-codegraph.mjs 把整目录放在 PI_PACKAGE_DIR/codegraph/。注入据此构造启动命令：
//   unix : <dir>/bin/codegraph serve --mcp --path <ws>
//   win32: <dir>/node.exe --liftoff-only <dir>/lib/dist/bin/codegraph.js serve --mcp --path <ws>
// Windows 不能直接 spawn 包内 .cmd（CVE-2024-27980 加固），故经 node.exe + 入口 js；
// --liftoff-only 同时规避 tree-sitter WASM 在 Node>=22 的 V8 turboshaft Zone OOM。
function codegraphBundleDir(pkgDir: string): string {
  return `${pkgDir.replace(/[\\/]+$/, "")}/codegraph`;
}

const ENGINES: Record<string, CodeIntelEngine> = {
  codegraph: {
    serverName: "codegraph",
    toolPrefix: "codegraph_",
    buildConfig: (pkgDir, platform) => {
      const dir = codegraphBundleDir(pkgDir);
      // --path ${workspaceFolder} 与本机 user MCP 配置一致；expandServerVars 展开为 agent cwd。
      const serveArgs = ["serve", "--mcp", "--path", "${workspaceFolder}"];
      if (platform === "win32") {
        return {
          name: "codegraph",
          transport: "stdio",
          command: `${dir}/node.exe`,
          // 入口用相对路径（解析自 cwd=dir）。若用绝对含空格路径（如
          // "D:/OneDrive/Project Files/..."），codegraph 在 MCP 的 piped/无 TTY 下用
          // child_process 拉起索引 worker 时会在空格处截断入口，报
          // "Cannot find module '.../Project'" / lstat 盘符。cwd=dir + 相对入口规避。
          args: ["--liftoff-only", "lib/dist/bin/codegraph.js", ...serveArgs],
          cwd: dir,
          env: {},
        };
      }
      return {
        name: "codegraph",
        transport: "stdio",
        command: `${dir}/bin/codegraph`,
        args: serveArgs,
        cwd: dir,
        env: {},
      };
    },
  },
};

export function getEngine(name: string): CodeIntelEngine | undefined {
  return ENGINES[name];
}

export function listEngineNames(): string[] {
  return Object.keys(ENGINES);
}

/** 用户自配的某 server 暴露的工具是否命中某引擎签名（即便其 server 名不同）。 */
export function matchesEngineSignature(engineName: string, toolNames: string[]): boolean {
  const eng = ENGINES[engineName];
  if (!eng || !eng.toolPrefix) return false;
  return toolNames.some((t) => t.startsWith(eng.toolPrefix));
}
