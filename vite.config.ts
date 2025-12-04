import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔧 插件：補正 wasm / onnx / jsep.mjs 的 Content-Type
function serveBinaryMime(): Plugin {
  return {
    name: "serve-binary-mime",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.endsWith(".wasm")) {
          res.setHeader("Content-Type", "application/wasm");
        } else if (req.url?.endsWith(".onnx")) {
          res.setHeader("Content-Type", "application/octet-stream");
        } else if (req.url?.includes("ort-wasm-simd-threaded.jsep") && req.url.endsWith(".mjs")) {
          res.setHeader("Content-Type", "text/javascript");
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.endsWith(".wasm")) {
          res.setHeader("Content-Type", "application/wasm");
        } else if (req.url?.endsWith(".onnx")) {
          res.setHeader("Content-Type", "application/octet-stream");
        } else if (req.url?.includes("ort-wasm-simd-threaded.jsep") && req.url.endsWith(".mjs")) {
          res.setHeader("Content-Type", "text/javascript");
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serveBinaryMime()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
      "@lib": path.resolve(__dirname, "lib")
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    allowedHosts: [".trycloudflare.com", "localhost", "127.0.0.1"],
    host: true,
    port: 5173,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
