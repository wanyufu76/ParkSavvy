import os
import re
import json
import shutil
import subprocess
from datetime import datetime
import time
import numpy as np
from supabase import create_client
from infer_location import infer_location_clip


SUPABASE_URL = "https://polqjhuklxclnvgpjckf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvbHFqaHVrbHhjbG52Z3BqY2tmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjI4MTA5NywiZXhwIjoyMDY3ODU3MDk3fQ.tA_l_KmEsm3YlnPfohlwaYiOG3fnTrbZRlJGUCpkWnk"
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

BASE_CONFIG_DIR = "base_config"
DOWNLOAD_DIR = "downloads"
os.makedirs(BASE_CONFIG_DIR, exist_ok=True)
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

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
        .select("id, filename, created_at, inferred_area, processed")
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

def upload_motor_records(result_path, location, filename):
    """清空該區 motor_records，插入最新偵測結果"""
    with open(result_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    supabase.table("motor_records").delete().eq("location", location).execute()
    print(f"🧹 已清除 {location} 先前紀錄")

    records = []
    for item in data:
        records.append({
            "image_filename": filename,
            "motor_index": item["motor_index"],
            "location": location,
            "real_x": item["real_x"],  # 底圖像素
            "real_y": item["real_y"],
            "plate_text": item["plate_text"],
            "match_distance": item["match_distance"],
            "created_at": datetime.now().isoformat()
        })

    if records:
        supabase.table("motor_records").insert(records).execute()
        print(f"已上傳 {len(records)} 筆配對資料")
    else:
        print(" 沒有配對資料可上傳")

def upsert_current_count(area_id: str, count: int, src_id: str | None = None):
    payload = {
        "area_id": area_id,                # ← 改這裡
        "scooter_count": int(count),
        "ts": datetime.now().isoformat(),
        "src_id": src_id or "",
    }
    supabase.table("current_status").upsert(
        payload,
        on_conflict="area_id"              # ← 這裡也改
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

# ----------------- JSON 產出 -----------------
def generate_json_for_location(location):
    """產生前端可用 JSON，紅點沿中心線整齊化，含經緯度"""
    # 最新圖片
    uploads = (
        supabase.table("image_uploads")
        .select("filename", "created_at")
        .eq("inferred_area", location)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not uploads.data:
        print(f" {location} 沒有任何圖片上傳紀錄")
        return

    latest_filename = uploads.data[0]["filename"]

    # motor_records
    records = (
        supabase.table("motor_records")
        .select("*")
        .eq("image_filename", latest_filename)
        .execute()
        .data
    )
    if not records:
        print(f"⚠️ {location} 沒有 motor_records")
        return

    # 讀取底圖設定
    box_data = (
        supabase.table("base_configs")
        .select("*")
        .eq("area_id", location)
        .limit(1)
        .execute()
        .data
    )
    if not box_data:
        print(f"⚠️ 找不到 {location} 的底圖資訊")
        return

    cfg = box_data[0]
    coords = json.loads(cfg["coords"])
    # 將藍框轉為像素座標
    box_points = np.array([
        [ (c["lng"]-cfg["lng_min"])/(cfg["lng_max"]-cfg["lng_min"])*cfg["img_width"],
          (cfg["lat_max"]-c["lat"])/(cfg["lat_max"]-cfg["lat_min"])*cfg["img_height"] ]
        for c in coords
    ], dtype=float)
    box_points = reorder_box_points(box_points)

    default_group = extract_group_from_location(location)

    # ✅ 過濾並整理紅點（保證 points 與 markers 一一對應）
    points = []
    markers = []
    for item in records:
        x_px = item.get("real_x")
        y_px = item.get("real_y")
        if x_px is None or y_px is None:
            continue
        if not isinstance(x_px, (int, float)) or not isinstance(y_px, (int, float)):
            continue

        lat, lng = pixel_to_latlng(x_px, y_px, cfg)
        if lat is None or lng is None:
            continue  # 這筆不進 markers → 也不要進 points

        rect_name = item.get("rect_name") or item.get("subspot") or item.get("grid_name") or ""
        group_key = extract_group_from_rect_name(rect_name) or default_group  # ← ★ 關鍵

        # 只有確定會建 marker 時才把點同步加入 points，確保長度一致
        points.append([x_px, y_px])

        markers.append({
            "motor_index": item["motor_index"],
            "plate_text": item["plate_text"],
            "pixel_x": int(x_px),
            "pixel_y": int(y_px),
            "lat": lat,
            "lng": lng,
            "location": location,
            "image_filename": item["image_filename"],
            # ⭐ 分區名字（給前端用名字過濾）
            "group_key": group_key,
            # （可選）同義欄位，避免前端欄位名不一致
            "spot_group": group_key,
        })

    # ✅ 紅點沿中心線整齊化（用 zip 對齊，永遠不越界）
    if points:
        aligned_pts = align_points_to_centerline(np.array(points, dtype=float), box_points)

        # 以 zip 對齊，避免 IndexError
        for m, (x, y) in zip(markers, aligned_pts):
            x = float(x); y = float(y)
            lat, lng = pixel_to_latlng(x, y, cfg)
            m["pixel_x"] = int(x)
            m["pixel_y"] = int(y)
            if lat is not None and lng is not None:
                m["lat"] = lat
                m["lng"] = lng

    latest_count = len(markers)
    upsert_current_count(location, latest_count, src_id=latest_filename)

    # 輸出 JSON
    out = f"map_output_{location}.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(markers, f, ensure_ascii=False, indent=2)
    print(f" {location}: 已輸出 {out} (含經緯度，沿中心線整齊化)")

# ----------------- 主流程 -----------------
if __name__ == "__main__":
    rows = get_unprocessed_images_raw()
    if not rows:
        print(" 沒有新的圖片要處理")
    else:
        # 先把沒推論區域的補上
        for row in rows:
            if not row.get("inferred_area"):
                image_id = row["id"]
                filename = row["filename"]
                local_path = download_image(filename)
                if local_path is None:
                    mark_as_processed(image_id)
                    continue
                try:
                    area = infer_location_clip(local_path)  # 這裡就會「真的」跑到
                    print(f"圖片區域(新推論): {area}")
                    supabase.table("image_uploads").update(
                        {"inferred_area": area}
                    ).eq("id", image_id).execute()
                    row["inferred_area"] = area
                except Exception as e:
                    print(f"區域推論失敗：{e}")
                    mark_as_processed(image_id)
                    continue

        # 依區域挑「最新一張」來做 YOLO + 上傳
        latest_by_area = {}
        for row in rows:
            area = row.get("inferred_area")
            if not area:
                continue
            ts = row.get("created_at", "")
            if area not in latest_by_area or ts > latest_by_area[area].get("created_at", ""):
                latest_by_area[area] = row

        targets = list(latest_by_area.values())
        if not targets:
            print(" 沒有完成區域判定的圖片可處理")
        else:
            for img in targets:
                image_id = img["id"]
                filename = img["filename"]
                location = img["inferred_area"]

                print(f"\n處理圖片: {filename} @ {location}")

                downloaded_path = download_image(filename)
                if downloaded_path is None:
                    mark_as_processed(image_id)
                    continue

                # OCR
                ocr_json_path = os.path.abspath(os.path.join(DOWNLOAD_DIR, f"{filename}_ocr.json"))
                subprocess.run([
                    "conda","run","-n","ocr_env","python", r"E:\ParkSavvy\mark\ocr.py",
                    downloaded_path, ocr_json_path
                ], check=False)

                # YOLO + Homography
                base_config_dir = f"base_config_{location}"
                subprocess.run([
                    "conda","run","-n","yolo_paddle","python", r"E:\ParkSavvy\mark\based_mark.py",
                    downloaded_path, base_config_dir, ocr_json_path
                ], check=False)

                # 上傳 motor_records
                result_json_path = downloaded_path + "_result.json"
                if os.path.exists(result_json_path):
                    upload_motor_records(result_json_path, location, filename)

                # 這張標為 processed，且把同區舊圖也標 processed
                mark_as_processed(image_id)
                supabase.table("image_uploads").update(
                    {"processed": True}
                ).eq("inferred_area", location).neq("id", image_id).execute()

                # 產 map_output_*.json
                generate_json_for_location(location)

        print("\n✅ 所有地區處理完成！")