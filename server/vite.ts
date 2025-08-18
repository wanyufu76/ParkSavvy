// server/vite.ts
import express, { type Express } from "express";
import fs from "fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer as createViteServer, createLogger, type UserConfig } from "vite";
import type { Server } from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const viteLogger = createLogger();

function projectRoot() {
  // dist/server/vite.js -> 專案根在上一層
  // server/vite.ts     -> 專案根在上一層
  return path.resolve(__dirname, "..");
}

async function loadViteConfig(): Promise<UserConfig> {
  const root = projectRoot();
  const devConfigPath = path.resolve(root, "vite.config.ts");
  const prodConfigPath = path.resolve(root, "dist", "vite.config.js");

  // dev 有 .ts；prod 編譯後才有 .js
  const prefer = process.env.NODE_ENV === "production" ? prodConfigPath : devConfigPath;
  const alt    = process.env.NODE_ENV === "production" ? devConfigPath : prodConfigPath;

  try {
    const mod = await import(pathToFileURL(prefer).href);
    return (mod as any).default ?? mod;
  } catch {
    const mod = await import(pathToFileURL(alt).href);
    return (mod as any).default ?? mod;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const viteConfig = await loadViteConfig();

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false, // 我們已經手動載入 config 物件
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: {
      ...(viteConfig.server ?? {}),
      middlewareMode: true,
      hmr: { server },
    },
    appType: "custom",
  });

  app.use(vite.middlewares);
  console.log("🛠️ Vite dev middleware 已就緒（同埠服務前端 + HMR）");

  // 前端路由交給 Vite（含 HMR 注入）
  app.use("*", async (req, res, next) => {
    try {
      const url = req.originalUrl;
      const clientIndex = path.resolve(projectRoot(), "client", "index.html");
      let template = await fs.promises.readFile(clientIndex, "utf-8");

      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // 👉 你的 Vite build outDir 指向「專案根/dist」
  const distPath = path.resolve(projectRoot(), "dist");

  if (!fs.existsSync(distPath)) {
    throw new Error(`Could not find the build directory: ${distPath}
請先執行：npm run build（會做 Vite build）`);
  }

  app.use(express.static(distPath));

  // SPA fallback（避免前端路由 F5 變 404）
  app.use("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}