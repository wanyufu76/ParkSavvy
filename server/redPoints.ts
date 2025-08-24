import { Express, Request, Response } from "express";
import fs from "fs/promises";
import path from "path";

function norm(s: any) {
  return (s ?? "").toString().trim().toUpperCase();
}

// 從 "ib_H01" 或 "IB_H01" 萃取 route="IB", group="H"
function splitInferredArea(v: any): { route_key: string; group_key: string } {
  const s = (v ?? "").toString().trim();
  const m = s.match(/^([A-Za-z]+)_([A-Za-z]+)[0-9]+$/); // ib_H01 / IB_H01
  if (!m) return { route_key: "", group_key: "" };
  return { route_key: norm(m[1]), group_key: norm(m[2]) };
}

// 從 "H01"/"C02" 這類取字母
function letterFromRectName(v: any): string {
  const s = (v ?? "").toString().trim();
  const m = s.match(/^[A-Za-z]+/);
  return m ? norm(m[0]) : "";
}

export function registerRedPointsRoutes(app: Express) {
  app.get("/api/red-points", async (req: Request, res: Response) => {
    try {
      // 可選過濾：?route=IB&group=H 或 ?location=IB_H01
      const routeQ = norm(req.query.route as string | undefined);
      const groupQ = norm(req.query.group as string | undefined);
      const locationQ = req.query.location as string | undefined; // 保留舊參數

      // 1) 找出所有 map_output_*.json（仍在 cwd）
      const files = (await fs.readdir(process.cwd())).filter(
        (f) => f.startsWith("map_output_") && f.endsWith(".json")
      );

      const merged: any[] = [];

      for (const f of files) {
        try {
          const content = await fs.readFile(path.join(process.cwd(), f), "utf-8");
          const arr = JSON.parse(content) as any[];

          for (const pt of arr) {
            // 推導 inferred_area（若沒有就用既有欄位組裝）
            const inferred_area =
              pt.inferred_area ??
              pt.location ?? // 你先前把這裡塞成 IB_H01，我們沿用
              "";

            // 盡可能補上 route_key / group_key
            let route_key = norm(pt.route_key ?? pt.route ?? "");
            let group_key = norm(pt.group_key ?? pt.spot_group ?? pt.group ?? "");

            if (!route_key || !group_key) {
              const fromIA = splitInferredArea(inferred_area);
              if (!route_key) route_key = fromIA.route_key;
              if (!group_key) group_key = fromIA.group_key;
            }

            // 再試一次：從 rect_name/subspot/grid_name 取字母
            if (!group_key) {
              group_key = letterFromRectName(
                pt.rect_name ?? pt.subspot ?? pt.grid_name ?? ""
              );
            }

            // ── 套用過濾條件 ──────────────────────────────
            if (locationQ && inferred_area !== locationQ) continue;
            if (routeQ && route_key !== routeQ) continue;
            if (groupQ && group_key !== groupQ) continue;

            // 正常化輸出（保留原欄位 + 新欄位）
            merged.push({
              motor_index: pt.motor_index,
              plate_text: pt.plate_text ?? "",
              pixel_x: pt.pixel_x ?? null,
              pixel_y: pt.pixel_y ?? null,
              lat: Number(pt.lat),
              lng: Number(pt.lng),
              image_filename: pt.image_filename ?? "",
              // 舊欄位（相容前端）
              location: inferred_area, // 建議放 IB_H01
              // 新欄位（給前端精準過濾）
              inferred_area,
              route_key,
              group_key,
            });
          }
        } catch (err) {
          console.warn(`❌ 讀檔失敗 ${f}`, err);
        }
      }

      res.json(merged);
    } catch (err) {
      console.error("❌ 載入紅點資料失敗", err);
      res.status(500).json({ error: "讀取紅點資料失敗" });
    }
  });
}