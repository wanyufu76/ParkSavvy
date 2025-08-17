/*******************************************************************
 * 1. import 區
 *******************************************************************/
import express, { Request, Response, NextFunction } from "express";
import http from "http";
import path from "path";
import { Server as IOServer } from "socket.io";
import { registerRoutes } from "./routes.js";
import { initAutoRunner } from "./autoRunner.js";
import { setupVite, serveStatic, log } from "./vite.js";
import "dotenv/config";
import cors from "cors";

/*******************************************************************
 * 2. 建立 app → httpServer → socket.io
 *******************************************************************/
const app = express();
const httpServer = http.createServer(app);
const io = new IOServer(httpServer, {
  cors: { origin: "*" },
});

/* autoRunner 只需呼叫一次 */
initAutoRunner(io);

/*******************************************************************
 * 3. 中介層 & 靜態檔
 *******************************************************************/
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/uploads", express.static(path.join(path.resolve(), "uploads")));
app.use("/processed_images", express.static(path.join(path.resolve(), "processed_images")));
app.use("/base_images", express.static(path.join(path.resolve(), "base_images")));
app.use(express.static("dist"));

/*******************************************************************
 * 4. 其餘 API 路由 (含紅點路由)
 *******************************************************************/
(async () => {
  await registerRoutes(app);

  /********************* 5. Error middleware **********************/
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ message: err.message || "Internal Server Error" });
    console.error(err);
  });

  /********************* 6. Dev / Prod - Vite ********************/
  if (app.get("env") === "development") {
    await setupVite(app, httpServer); // dev 熱更新
  } else {
    serveStatic(app); // prod 靜態目錄
  }

  /********************* 7. 啟動 HTTP + WS 伺服器 *****************/
  const PORT = process.env.PORT || 5000;
  httpServer.listen(
  {
    port: PORT,
    host: "0.0.0.0",
  },
  () => {
    console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
  }
);

})();
