import os
import re
import sys
import json
import shutil
import subprocess
from datetime import datetime
import time
import numpy as np
from supabase import create_client
# from infer_location import infer_location_clip
from pathlib import Path
from infer_location import infer_area_by_kp
from infer_location import _write_inferred_area_sidecar as _write_sidecar_atomic
import math


SUPABASE_URL = "https://polqjhuklxclnvgpjckf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvbHFqaHVrbHhjbG52Z3BqY2tmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjI4MTA5NywiZXhwIjoyMDY3ODU3MDk3fQ.tA_l_KmEsm3YlnPfohlwaYiOG3fnTrbZRlJGUCpkWnk"
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

BASE_CONFIG_DIR = "base_config"
BASE_IMAGES_ROOT = Path(r"E:\ParkSavvy") 
DOWNLOAD_DIR = "downloads"
os.makedirs(BASE_CONFIG_DIR, exist_ok=True)
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# —— 新增：正規化工具（允許多字母路名，如 gges/hilife）
AREA_RE = re.compile(r"^[a-z]+_[A-Z]\d{2}$")

def normalize_final_area(location: str, area: str | None) -> str | None:
    """把 (location, area) 組成 ib_G01 / gges_A02；不合法就回 None。"""
    if not location or not area:
        return None
    if isinstance(area, tuple):
        return None
    s = f"{str(location).strip().lower()}_{str(area).strip().upper()}"
    return s if AREA_RE.match(s) else None

# ----------------- 幾何函式 -----------------
def reorder_box_points(points):
    """把 4 點排序成順時針"""
    pts = np.array(points, dtype=float)
    center = np.mean(pts, axis=0)
    angles = np.arctan2(pts[:,1]-center[1], pts[:,0]-center[0])
    pts = pts[np.argsort(angles)]
    return pts

def align_points_to_centerline(points, box_points, padding_ratio=0.1, smooth_factor=0.3):
    """
    紅點沿著停車位中心線排列，帶原始距離權重的平滑分布
    """
    box_points = reorder_box_points(box_points)

    # 計算邊長
    edges = [(box_points[i], box_points[(i+1)%4]) for i in range(4)]
    lengths = [np.linalg.norm(e[1]-e[0]) for e in edges]

    # 找最短邊（停車位頭尾）
    short_idx = int(np.argmin(lengths))
    short_edge = edges[short_idx]
    opp_edge   = edges[(short_idx+2)%4]

    # 中心線
    center_start = (short_edge[0]+short_edge[1])/2
    center_end   = (opp_edge[0]+opp_edge[1])/2
    dir_vec = center_end - center_start
    dir_len = np.linalg.norm(dir_vec)
    dir_vec /= dir_len

    # 1️⃣ 原始投影距離
    proj = [np.dot(pt-center_start, dir_vec) for pt in points]
    sorted_idx = np.argsort(proj)
    proj = np.array(proj)[sorted_idx]

    # 2️⃣ 原始距離正規化
    min_proj, max_proj = proj.min(), proj.max()
    proj_range = max_proj - min_proj if max_proj>min_proj else 1.0
    norm_proj = (proj - min_proj) / proj_range

    # 3️⃣ 線性等距 + 原始距離混合
    n = len(points)
    linear = np.linspace(0, 1, n)
    mixed = (1-smooth_factor)*linear + smooth_factor*norm_proj

    # 4️⃣ 加 padding
    start_pos = dir_len * padding_ratio
    end_pos   = dir_len * (1 - padding_ratio)
    usable_len = end_pos - start_pos
    aligned_proj = start_pos + mixed * usable_len

    # 5️⃣ 還原空間座標
    aligned_points = [center_start + dir_vec*p for p in aligned_proj]
    return np.array(aligned_points)

def pixel_to_latlng(x, y, cfg):
    """底圖像素轉經緯度"""
    if cfg["img_width"] == 0 or cfg["img_height"] == 0:
        return None, None
    lng = cfg["lng_min"] + (x / cfg["img_width"]) * (cfg["lng_max"] - cfg["lng_min"])
    lat = cfg["lat_max"] - (y / cfg["img_height"]) * (cfg["lat_max"] - cfg["lat_min"])
    return lat, lng

# ----------------- DB 操作 -----------------

def get_unprocessed_images_raw(limit=100):
    r = (
        supabase.table("image_uploads")
        .select("id, filename, created_at, inferred_area, processed, location")
        .eq("processed", False)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    rows = r.data or []
    # 只留圖片檔
    return [
        row for row in rows
        if isinstance(row.get("filename"), str)
        and row["filename"].lower().endswith((".jpg", ".jpeg", ".png"))
    ]

def download_image(filename):
    source_path = os.path.join(r"E:\ParkSavvy\uploads", filename)
    save_path = os.path.join(DOWNLOAD_DIR, filename)
    if not os.path.exists(source_path):
        print(f" 找不到圖片：{source_path}")
        return None
    shutil.copyfile(source_path, save_path)
    print(f" 已複製圖片：{filename}")
    return save_path

def mark_as_processed(image_id):
    supabase.table("image_uploads").update({"processed": True}).eq("id", image_id).execute()

def upload_motor_records(result_path, area_key, filename):
    """清空該【區鍵(=inferred_area)】的 motor_records，插入最新偵測結果"""
    with open(result_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 先清掉同區鍵的舊資料
    supabase.table("motor_records").delete().eq("location", area_key).execute()
    print(f"🧹 已清除 {area_key} 先前紀錄")

    records = []
    for item in data:
        md = item.get("match_distance")
        if not isinstance(md, (int, float)) or not math.isfinite(md):
            md = None

        records.append({
            "image_filename": filename,
            "motor_index": item["motor_index"],
            "location": area_key,                 # ★ 用 inferred_area（如 ib_H01 / tr_A02）
            "real_x": item["real_x"],
            "real_y": item["real_y"],
            "plate_text": item["plate_text"],
            "match_distance": md,
            "created_at": datetime.now().isoformat(),
        })

    if records:
        supabase.table("motor_records").insert(records).execute()
        print(f"已上傳 {len(records)} 筆配對資料")
    else:
        print(" 沒有配對資料可上傳")

def upsert_current_count(route_key: str, area_id: str, count: int, src_id: str | None = None):
    """把最新數量寫進 current_status（複合主鍵 route_key+area_id）"""
    payload = {
        "route_key": (route_key or "").lower(),  # "ib" / "tr"
        "area_id": area_id,                      # "A01" / "B02"（不要有前綴）
        "scooter_count": int(count),
        "ts": datetime.now().isoformat(),
        "src_id": src_id or "",
    }
    # on_conflict 記得是複合鍵
    supabase.table("current_status").upsert(
        payload,
        on_conflict="route_key,area_id"
    ).execute()


def extract_group_from_rect_name(name: str) -> str:
    """
    從子格名抓英文字母開頭，例如 'C01' -> 'C'、'H' -> 'H'
    """
    if not name:
        return ""
    m = re.match(r"^[A-Za-z]+", name.strip())
    return m.group(0).upper() if m else ""

def extract_group_from_location(loc: str) -> str:
    if not loc:
        return ""
    s = loc.strip()
    # 先抓「開頭的英文字母」（C01 → C、H02 → H）
    m = re.match(r"[A-Za-z]+", s)
    if m:
        return m.group(0).upper()
    # 抓結尾的英文字母（…停車格D → D）
    m = re.search(r"([A-Za-z]+)$", s)
    return m.group(1).upper() if m else ""

def split_inferred_area(s: str):
    """
    'ib_A01' -> ('IB', 'A01', 'A')
    'tr_C02' -> ('TR', 'C02', 'C')
    其餘格式回 ('', '', '')
    """
    if not s:
        return "", "", ""
    s = s.strip().upper()
    m = re.match(r"^([A-Z]+)_([A-Z]+[0-9]+)$", s)
    if not m:
        return "", "", ""
    route_key = m.group(1)          # IB / TR
    area_id   = m.group(2)          # A01 / C02
    group_key = re.match(r"^[A-Z]+", area_id).group(0)  # A / C
    return route_key, area_id, group_key

# ----------------- JSON 產出 -----------------
def generate_json_for_location(inferred_area: str):
    """產生前端可用 JSON，紅點沿中心線整齊化，含經緯度"""
    # 1) 解析 inferred_area -> route_key / area_id / group_key
    route_key, area_id, default_group = split_inferred_area(inferred_area)

    # 2) 最新圖片（用 inferred_area 查）
    uploads = (
        supabase.table("image_uploads")
        .select("filename", "created_at")
        .eq("inferred_area", inferred_area)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not uploads.data:
        print(f" {inferred_area} 沒有任何圖片上傳紀錄")
        return
    latest_filename = uploads.data[0]["filename"]

    # 3) 讀同一張圖的 motor_records
    records = (
        supabase.table("motor_records")
        .select("*")
        .eq("image_filename", latest_filename)
        .execute()
        .data
    )
    if not records:
        print(f"⚠️ {inferred_area} 沒有 motor_records")
        return

    # 4) 讀取底圖設定：route_key + area_id（大小寫不敏感，含 fallback）
    rk = (route_key or "").strip().lower()   # DB 可能存 ib/tr（小寫）
    aid = (area_id or "").strip().upper()    # area 一律用大寫比對

    # 4-1：優先雙鍵（route_key 不分大小寫）
    res = (
        supabase.table("base_configs")
        .select("*")
        .ilike("route_key", rk if rk else "%")
        .eq("area_id", aid)
        .limit(1)
        .execute()
    )
    box_data = res.data

    # 4-2：fallback：只用 area_id（相容沒填 route_key 的舊資料）
    if not box_data:
        res = (
            supabase.table("base_configs")
            .select("*")
            .eq("area_id", aid)
            .limit(1)
            .execute()
        )
        box_data = res.data

    # 4-3：fallback：有人把 area_id 存成 'ib_H01' 這種 → 模糊比對
    if not box_data:
        res = (
            supabase.table("base_configs")
            .select("*")
            .ilike("area_id", f"%{aid}")
            .limit(1)
            .execute()
        )
        box_data = res.data

    if not box_data:
        print(f"⚠️ 找不到底圖：route_key='{rk}', area_id='{aid}'")
        try:
            cand_area = supabase.table("base_configs").select("route_key,area_id")\
                .ilike("area_id", f"%{aid}%").execute().data
            cand_route = supabase.table("base_configs").select("route_key,area_id")\
                .ilike("route_key", rk).execute().data if rk else []
            print("  • 可能的 area 候選：", cand_area)
            print("  • 可能的 route 候選：", cand_route)
        except Exception:
            pass
        return

    cfg = box_data[0]
    # --- 讀 coords：可能是 jsonb(list) 或字串 ---
    coords_raw = cfg.get("coords")

    if isinstance(coords_raw, str):
        try:
            coords = json.loads(coords_raw)
        except Exception as e:
            print(f"⚠️ coords 不是合法 JSON 字串：{e} → 跳過")
            return
    elif isinstance(coords_raw, (list, tuple)):
        coords = coords_raw
    else:
        print(f"⚠️ coords 型別不支援：{type(coords_raw)} → 跳過")
        return

    # 基本驗證
    if not isinstance(coords, list) or len(coords) < 4:
        print(f"⚠️ coords 數量不足（期望至少 4 個點），實際={len(coords) if isinstance(coords, list) else 'N/A'} → 跳過")
        return

    # 將藍框轉為像素座標
    try:
        box_points = np.array([
            [
                (c["lng"] - cfg["lng_min"]) / (cfg["lng_max"] - cfg["lng_min"]) * cfg["img_width"],
                (cfg["lat_max"] - c["lat"]) / (cfg["lat_max"] - cfg["lat_min"]) * cfg["img_height"],
            ]
            for c in coords
        ], dtype=float)
    except KeyError as e:
        print(f"⚠️ coords 缺欄位：{e}（預期有 lat/lng）→ 跳過")
        return
    box_points = reorder_box_points(box_points)

    # 5) 組 markers（只加入可算出 lat/lng 的點，確保 points 與 markers 對齊）
    points, markers = [], []
    for item in records:
        x_px = item.get("real_x"); y_px = item.get("real_y")
        if x_px is None or y_px is None:
            continue
        if not isinstance(x_px, (int, float)) or not isinstance(y_px, (int, float)):
            continue

        lat, lng = pixel_to_latlng(x_px, y_px, cfg)
        if lat is None or lng is None:
            continue

        rect_name = item.get("rect_name") or item.get("subspot") or item.get("grid_name") or ""
        group_key = extract_group_from_rect_name(rect_name) or default_group  # 取不到就用預設(A/C...)

        points.append([x_px, y_px])
        markers.append({
            "motor_index": item["motor_index"],
            "plate_text": item["plate_text"],
            "pixel_x": int(x_px),
            "pixel_y": int(y_px),
            "lat": lat,
            "lng": lng,
            "location": inferred_area,            # 例如 'IB_A01' 或 'ib_A01'
            "image_filename": item["image_filename"],
            "group_key": group_key,               # A/B/C...
            "spot_group": group_key,              # 同義備援
            "route_key": route_key,               # IB / TR（原樣回傳，給前端參考）
        })

    # 6) 對齊到中心線（zip 避免越界）
    if points:
        aligned_pts = align_points_to_centerline(np.array(points, dtype=float), box_points)
        for m, (x, y) in zip(markers, aligned_pts):
            x = float(x); y = float(y)
            lat, lng = pixel_to_latlng(x, y, cfg)
            m["pixel_x"] = int(x); m["pixel_y"] = int(y)
            if lat is not None and lng is not None:
                m["lat"] = lat; m["lng"] = lng

    # 7) 狀態表：用 route_key + area_id 當主鍵
    latest_count = len(markers)
    if route_key and area_id:
        upsert_current_count(route_key, area_id, latest_count, src_id=latest_filename)
        print(f"🟢 current_status 更新：({route_key}, {area_id}) = {latest_count}")
    else:
        print(f"⚠️ 未更新：inferred_area='{inferred_area}' 無法解析到 route_key/area_id")
        
    # 8) 輸出 JSON（檔名也用 route+area）
    out_dir = Path("map_outputs")
    out_dir.mkdir(exist_ok=True)  # 沒有資料夾就自動建立
    out_path = out_dir / f"map_output_{route_key}_{area_id}.json"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(markers, f, ensure_ascii=False, indent=2)

    print(f" {route_key}_{area_id}: 已輸出 {out_path} (含經緯度，沿中心線整齊化)")

def resolve_base_config_dir(inferred_area_value: str) -> str:
    """
    inferred_area_value 例: 'ib_H01' / 'tr_A02'
    優先找 base_config_<ROUTE>_<AREA>；找不到就退回 base_config_<AREA>
    """
    parts = (inferred_area_value or "").split("_", 1)
    if len(parts) != 2:
        # 不合法就直接用原字串（避免崩）
        return f"base_config_{inferred_area_value}"
    route_key, area_id = parts[0].upper(), parts[1].upper()
    p1 = f"base_config_{route_key}_{area_id}"
    p2 = f"base_config_{area_id}"
    return p1 if os.path.isdir(p1) else p2

def fallback_area_by_plates(plates: list[str]) -> str | None:
    """
    根據 motor_records 中的 plate_text 出現紀錄，投票推論最常出現的區域
    """
    if not plates:
        return None

    area_votes = {}
    for plate in plates:
        res = supabase.table("motor_records")\
            .select("location")\
            .eq("plate_text", plate)\
            .execute()
        rows = res.data or []

        for row in rows:
            loc = row.get("location")
            if not loc:
                continue
            area_votes[loc] = area_votes.get(loc, 0) + 1

    if not area_votes:
        return None

    # 回傳票數最多的區域
    inferred_area = max(area_votes, key=area_votes.get)
    print(f"🔁 備案推論：根據車牌 → 最可能區域為 {inferred_area}")
    return inferred_area

if __name__ == "__main__":
    images = get_unprocessed_images_raw()
    if not images:
        print(" 沒有新的圖片要處理")
    else:
        # ========= 第 1 階段：為所有未處理影像推論 inferred_area =========
        prepared = []  # 暫存：每張圖的基本資訊 + 推論結果
        for img in images:
            filename = img["filename"]
            image_id = img["id"]
            location = (img.get("location") or "").strip()  # 路段：ib / tr / gges / hilife...

            # 下載影像（若已存在會覆蓋/複寫，OK）
            downloaded_path = download_image(filename)
            if downloaded_path is None:
                mark_as_processed(image_id)
                continue

            # === 新版：直接讀 autoRunner 已經寫好的 sidecar ===
            sidecar_path = os.path.join(r"E:\ParkSavvy\uploads", filename + ".area.json")
            inferred_area_value = None
            if os.path.exists(sidecar_path):
                with open(sidecar_path, "r", encoding="utf-8") as f:
                    j = json.load(f)
                    inferred_area_value = j.get("inferred_area")

            print(f"\n處理圖片: {filename} @ {location}")
            print(f"📍 使用 sidecar 的 inferred_area = {inferred_area_value}")

            # ❹ 更新 DB 並印出回應（方便除錯）
            resp = (
                supabase.table("image_uploads")
                .update({"inferred_area": inferred_area_value})
                .eq("id", image_id)
                .execute()
            )
            print("[DB] update inferred_area →", inferred_area_value, "| data:", resp.data)

            # ❺ 沒找到合法區域 → 標 processed 跳過（避免 based_mark 爆）
            if not inferred_area_value:
                print("❌ 無法推論合法區域（None 或格式不符）→ 嘗試使用車牌備案判定")

                # 嘗試讀取 result.json
                result_json_path = os.path.join(r"E:\ParkSavvy\uploads", filename + "_result.json")
                plate_texts = []
                if os.path.exists(result_json_path):
                    try:
                        with open(result_json_path, "r", encoding="utf-8") as f:
                            result_data = json.load(f)
                            plate_texts = [
                                m["plate_text"] for m in result_data
                                if isinstance(m.get("plate_text"), str) and m["plate_text"].strip()
                            ]
                    except Exception as e:
                        print(f"⚠️ 無法讀取 result.json: {e}")

                # 嘗試 fallback
                inferred_area_value = fallback_area_by_plates(plate_texts)
                if inferred_area_value:
                    print(f"✅ 使用車牌推論區域成功 → {inferred_area_value}")
                    resp = (
                        supabase.table("image_uploads")
                        .update({"inferred_area": inferred_area_value})
                        .eq("id", image_id)
                        .execute()
                    )
                    print("[DB] update inferred_area →", inferred_area_value, "| data:", resp.data)
                else:
                    print("❌ 使用車牌也無法推論區域 → 標記 processed 跳過此圖")
                    mark_as_processed(image_id)
                    continue

            prepared.append({
                "id": image_id,
                "filename": filename,
                "created_at": img.get("created_at", ""),
                "inferred_area": inferred_area_value,   # 例如 ib_H01 / gges_G01
            })

        if not prepared:
            print(" 沒有完成區域判定的圖片可處理")
            print("\n✅ 所有地區處理完成！")
            sys.exit(0)

        # ========= 第 2 階段：依 inferred_area 只挑最新一張做後續處理 =========
        latest_by_area = {}
        for row in prepared:
            area = (row.get("inferred_area") or "").strip()
            if not area:
                continue
            ts = row.get("created_at", "")
            if area not in latest_by_area or ts > latest_by_area[area].get("created_at", ""):
                latest_by_area[area] = row

        targets = list(latest_by_area.values())
        for tgt in targets:
            image_id = tgt["id"]
            filename = tgt["filename"]
            inferred_area_value = tgt["inferred_area"]  # ← 區鍵：ib_H01 / tr_A02
            print(f"\n▶︎ 開始處理（每區最新）: {filename} @ {inferred_area_value}")

            # 檔案一定在 downloads/（上面第一階段已下載過），這邊再拿一次路徑比較直覺
            downloaded_path = os.path.join(DOWNLOAD_DIR, filename)

            # --- OCR ---
            ocr_json_path = os.path.abspath(os.path.join(DOWNLOAD_DIR, f"{filename}_ocr.json"))
            subprocess.run([
                "conda", "run", "-n", "ocr_env", "python", r"E:\ParkSavvy\mark\ocr.py",
                downloaded_path, ocr_json_path
            ], check=False)

            # --- YOLO + Homography ---
            base_config_dir = resolve_base_config_dir(inferred_area_value)

            # 跑之前刪舊 result，避免誤用
            result_json_path = downloaded_path + "_result.json"
            try:
                if os.path.exists(result_json_path):
                    os.remove(result_json_path)
            except Exception:
                pass

            subprocess.run([
                "conda", "run", "-n", "yolo_paddle", "python", r"E:\ParkSavvy\mark\based_mark.py",
                downloaded_path, base_config_dir, ocr_json_path
            ], check=False)

            # --- 上傳 motor_records（location= inferred_area） ---
            if os.path.exists(result_json_path):
                upload_motor_records(result_json_path, inferred_area_value, filename)
            else:
                print("❌ based_mark 執行失敗，未產生 result.json，跳過此圖")
                mark_as_processed(image_id)
                continue

            # --- 產地圖 JSON（用 inferred_area） ---
            generate_json_for_location(inferred_area_value)

            # --- 標記 processed ---
            mark_as_processed(image_id)
            # 同一區的其他舊圖也一併標 processed（避免重複處理）
            supabase.table("image_uploads")\
                .update({"processed": True})\
                .eq("inferred_area", inferred_area_value)\
                .neq("id", image_id)\
                .execute()

    print("\n✅ 所有地區處理完成！")

