import os
import base64
from typing import Optional, Any, Dict
from supabase import create_client

# ===== Supabase 連線 =====
SUPABASE_URL = "https://polqjhuklxclnvgpjckf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvbHFqaHVrbHhjbG52Z3BqY2tmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjI4MTA5NywiZXhwIjoyMDY3ODU3MDk3fQ.tA_l_KmEsm3YlnPfohlwaYiOG3fnTrbZRlJGUCpkWnk"
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ===== 你原本的函式 =====
def npy_to_base64(path):
    """把 .npy 檔轉成 base64 字串"""
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def img_to_base64(path):
    """把影像檔轉成 base64 字串"""
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

# # ===== 新增的工具 =====
# def _norm_coords(coords: Any):
#     """轉成 [{lat:.., lng:..}] 格式"""
#     normed = []
#     for pt in coords:
#         if isinstance(pt, dict):
#             normed.append({"lat": float(pt["lat"]), "lng": float(pt["lng"])})
#         elif isinstance(pt, (list, tuple)) and len(pt) == 2:
#             lat, lng = float(pt[0]), float(pt[1])
#             normed.append({"lat": lat, "lng": lng})
#     return normed

# def _calc_bounds(normed):
#     """計算範圍 (lat_min, lat_max, lng_min, lng_max)"""
#     lats = [p["lat"] for p in normed]
#     lngs = [p["lng"] for p in normed]
#     return min(lats), max(lats), min(lngs), max(lngs)

# ===== 升級版 upload_config =====
def upload_config(area_id: str, route_key: Optional[str] = None, coords: Optional[Any] = None):
    base_image_path = "base_config/base_image.jpg"
    h_base_path = "base_config/H_base.npy"
    src_pts_path = "base_config/src_pts.npy"

    data: Dict[str, Any] = {
        "area_id": area_id,
    }

    if route_key:
        data["route_key"] = route_key

    # 保留原本功能：上傳三個 base64 檔案
    if os.path.exists(base_image_path):
        data["base_image_b64"] = img_to_base64(base_image_path)
    if os.path.exists(h_base_path):
        data["h_base_b64"] = npy_to_base64(h_base_path)
    if os.path.exists(src_pts_path):
        data["src_pts_b64"] = npy_to_base64(src_pts_path)

    # # 新增功能：支援 coords & bbox
    # if coords is not None:
    #     normed = _norm_coords(coords)
    #     lat_min, lat_max, lng_min, lng_max = _calc_bounds(normed)
    #     data.update({
    #         "coords": normed,
    #         "lat_min": lat_min,
    #         "lat_max": lat_max,
    #         "lng_min": lng_min,
    #         "lng_max": lng_max,
    #     })

    # 上傳到 Supabase
    existing = (
        supabase.table("base_configs")
        .select("id")
        .eq("area_id", area_id)
        .eq("route_key", route_key if route_key else "")
        .execute()
        .data
    )

    if existing:
        supabase.table("base_configs")\
            .update(data)\
            .eq("area_id", area_id)\
            .eq("route_key", route_key if route_key else "")\
            .execute()
        print(f"✅ 更新成功：{area_id}, route_key={route_key}")
    else:
        supabase.table("base_configs").insert(data).execute()
        print(f"✅ 新增成功：{area_id}, route_key={route_key}")