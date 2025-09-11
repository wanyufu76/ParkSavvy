// server/autoRunner.ts
import chokidar from "chokidar";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import type { Server as IOServer } from "socket.io";

const UPLOADS_DIR = path.resolve("uploads");
const AUTO_PY = path.resolve("mark/auto_process.py");

// === 這裡決定 sidecar .area.json 放哪裡 ===
// 你的 Python 目前若是寫在 uploads/：保持預設即可
// 若改成寫在 downloads/，把預設改成 path.resolve("downloads") 或用環境變數覆蓋
const SIDECAR_DIR = process.env.SIDECAR_DIR
  ? path.resolve(process.env.SIDECAR_DIR)
  : UPLOADS_DIR;

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 180_000; // 最多等 3 分鐘
const STARTUP_LOOKBACK_MS = 10 * 60 * 1000; // 啟動回補 10 分鐘
const GLOB_EXT = /\.(jpe?g|png)$/i;

// ① 放寬：路名可多字母（ib/tr/gges/hilife...）
const AREA_RE = /^[a-z]+_[A-Z]\d{2}$/i;

// ② 修：檔名候選的正則與 normalize 不要用 slice
function parseUserAreaFromFilename(basename: string): string | null {
  const m = basename.match(/([a-z]+_[A-Z]\d{2})[_-]/i);
  if (!m) return null;
  const [loc, code] = m[1].split("_");
  return `${loc.toLowerCase()}_${code.toUpperCase()}`;
}

// ③ 修：sidecar 的資料夾改看 SIDECAR_DIR
async function pollInferredArea(basename: string): Promise<string | null> {
  const started = Date.now();
  const sidecar = path.join(SIDECAR_DIR, `${basename}.area.json`);

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    try {
      const raw = await fs.readFile(sidecar, "utf-8");
      const j = JSON.parse(raw);
      const area = String(j?.inferred_area || "").trim();
      if (area && AREA_RE.test(area)) {
        const [p, c] = area.split("_");
        const norm = `${p.toLowerCase()}_${String(c).toUpperCase()}`;
        console.log(`[autoRunner] 偵測到 sidecar：${sidecar} → inferred_area=${norm}`);
        return norm;
      } else {
        console.log(`[autoRunner] sidecar 出現但不合法：${raw}`);
      }
    } catch {
      // 檔案還沒出現，繼續等
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

type Job = {
  fullpath: string;
  basename: string;
  userAreaCandidate: string | null;
  createdAt: number;
  timeout?: NodeJS.Timeout;
};
const pending = new Map<string, Job>();
let running = false;

async function runPipeline(io: IOServer, job: Job, finalArea: string) {
  try {
    console.log(`[autoRunner] 開始處理 ${job.basename}，使用區域=${finalArea}`);

    const pyArgs = ["-X", "utf8", AUTO_PY, job.fullpath];
    const p = spawn("python", pyArgs, {
      stdio: "inherit",
      env: { ...process.env, PYTHONUTF8: "1" },
    });

    await new Promise<void>((resolve) => {
      p.on("exit", async (code) => {
        if (code === 0) {
          console.log(`[autoRunner] ✅ 完成：${job.basename}`);
          io.emit("redPoints:updated");

          // ✅ 清理 sidecar（清理同一個 SIDECAR_DIR 裡的）
          const sidecar = path.join(SIDECAR_DIR, `${job.basename}.area.json`);
          try {
            await fs.unlink(sidecar);
            console.log(`[autoRunner] 🧹 已刪除 sidecar: ${sidecar}`);
          } catch {
            console.log(`[autoRunner] sidecar ${sidecar} 不存在或刪除失敗（忽略）`);
          }
        } else {
          console.error(`[autoRunner] ❌ 失敗：${job.basename}（exit ${code}）`);
        }
        resolve();
      });
    });
  } finally {
    const j = pending.get(job.basename);
    if (j?.timeout) clearTimeout(j.timeout);
    pending.delete(job.basename);
    running = false;
  }
}

async function maybeStart(io: IOServer, basename: string) {
  if (running) return;
  const job = pending.get(basename);
  if (!job) return;

  let area = await pollInferredArea(basename);

  // 是否保留「檔名候選 fallback」？要更嚴格可以整段移除
  if (!area && job.userAreaCandidate && AREA_RE.test(job.userAreaCandidate)) {
    area = job.userAreaCandidate;
    console.log(`[autoRunner] ${basename} 等不到 sidecar，先用檔名候選：${area}`);
  }

  if (!area) return;

  running = true;
  await runPipeline(io, job, area);
}

export function initAutoRunner(io: IOServer) {
  console.log(`🗂️ UPLOADS_DIR = ${UPLOADS_DIR}`);
  console.log(`📄 SIDECAR_DIR = ${SIDECAR_DIR}`);

  // 啟動回補
  (async () => {
    try {
      const entries = await fs.readdir(UPLOADS_DIR);
      const now = Date.now();
      for (const name of entries) {
        if (!GLOB_EXT.test(name)) continue;
        const fullpath = path.join(UPLOADS_DIR, name);
        const st = await fs.stat(fullpath);
        if (now - st.mtimeMs <= STARTUP_LOOKBACK_MS && !pending.has(name)) {
          console.log(`[startup] 回補佇列 ${name}`);
          const job: Job = {
            fullpath,
            basename: name,
            userAreaCandidate: parseUserAreaFromFilename(name),
            createdAt: Date.now(),
          };
          job.timeout = setTimeout(() => {
            if (pending.has(name)) {
              console.warn(`[autoRunner] 等候逾時：${name}（sidecar 未出現），跳過`);
              pending.delete(name);
            }
          }, POLL_TIMEOUT_MS + 10_000);
          pending.set(name, job);
          await maybeStart(io, name);
        }
      }
    } catch (e) {
      console.warn("[startup] 回補掃描失敗：", e);
    }
  })();

  // 監看新檔案（仍然看 uploads，因為新圖放這）
  const watcher = chokidar.watch(UPLOADS_DIR, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });
  watcher
    .on("ready", () => console.log("👀 chokidar ready"))
    .on("error", (err) => console.error("💥 chokidar error:", err))
    .on("add", async (fullpath) => {
      if (!GLOB_EXT.test(fullpath)) return;
      const basename = path.basename(fullpath);
      console.log(`[chokidar] add → 佇列 ${basename}`);

      const job: Job = {
        fullpath,
        basename,
        userAreaCandidate: parseUserAreaFromFilename(basename),
        createdAt: Date.now(),
      };

      job.timeout = setTimeout(() => {
        if (pending.has(basename)) {
          console.warn(`[autoRunner] 等候逾時：${basename}（sidecar 未出現），跳過`);
          pending.delete(basename);
        }
      }, POLL_TIMEOUT_MS + 10_000);

      pending.set(basename, job);
      await maybeStart(io, basename);
    });

  console.log("👂 autoRunner: 使用 sidecar .area.json 等推論就緒，並監看 uploads/ 新檔");
}