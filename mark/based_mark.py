import cv2, json, os, sys, numpy as np
import base64, re
from scipy.optimize import linear_sum_assignment
import io
from ultralytics import YOLO
from supabase import create_client

# Supabase 連線
SUPABASE_URL = "https://polqjhuklxclnvgpjckf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvbHFqaHVrbHhjbG52Z3BqY2tmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjI4MTA5NywiZXhwIjoyMDY3ODU3MDk3fQ.tA_l_KmEsm3YlnPfohlwaYiOG3fnTrbZRlJGUCpkWnk"
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

USE_RANGE_MINUS1_TO_1 = True

def decode_npy_b64(b64_str):
    """將 base64 還原為 numpy array"""
    raw = base64.b64decode(b64_str)
    return np.load(io.BytesIO(raw))

def get_base_config(area_id: str, route_key: str | None):
    """
    從 base_configs 撈對應的 Homography 與底圖資訊
    - 優先用 (route_key, area_id)；route_key 為空則只用 area_id（向下相容）
    """
    q = supabase.table("base_configs").select("*").eq("area_id", area_id)
    if route_key:
        q = q.eq("route_key", route_key)
    res = q.limit(1).execute()
    if not res.data:
        raise ValueError(f"找不到 base_config：area_id={area_id}, route_key={route_key or '(none)'}")

    cfg = res.data[0]

    # decode H_base
    H_base = np.load(io.BytesIO(base64.b64decode(cfg["h_base_b64"]))).astype(float)
    if H_base[2, 2] == 0:
        raise ValueError("H[2,2] = 0，Homography 無效")
    H_base /= H_base[2, 2]

    # 取底圖大小
    W = cfg.get("img_width")
    H_img = cfg.get("img_height")
    if not W or not H_img:
        base_img_b64 = cfg.get("base_image_b64")
        if base_img_b64:
            img_arr = np.frombuffer(base64.b64decode(base_img_b64), dtype=np.uint8)
            img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
            H_img, W = img.shape[:2]
        else:
            raise ValueError(f"{area_id} 沒有 img_width/img_height，且無法讀底圖")
    return H_base, W, H_img

def parse_base_cfg_dir(base_cfg_dir: str):
    """
    從資料夾名稱解析 route 與 area：
      base_config_IB_A01 -> ('IB', 'A01')
      base_config_TR_C02 -> ('TR', 'C02')
      base_config_A01    -> (None, 'A01')  # 舊版仍可用
    """
    name = os.path.basename(base_cfg_dir)
    m = re.match(r"^base_config_(?:([A-Za-z]+)_)?([A-Za-z]+\d+)$", name)
    if not m:
        # 保底：沿用舊邏輯把 prefix 去掉
        area_only = name.replace("base_config_", "")
        return None, area_only
    route = m.group(1).upper() if m.group(1) else None
    area  = m.group(2).upper()
    return route, area

def run_detection_and_draw(img_path: str, base_cfg_dir: str, ocr_json_path: str):
    # 解析 base_cfg_dir => route_key / area_id
    route_key, area_id = parse_base_cfg_dir(base_cfg_dir)

    # 1. 從 DB 取 H 與底圖大小（雙鍵 or 單鍵）
    H, W, H_img = get_base_config(area_id, route_key)

    # 2. YOLO 偵測
    img = cv2.imread(img_path)
    model_motor = YOLO("yolov8m.pt")
    model_plate = YOLO(r"C:\Users\CGM\Desktop\best_weight\plate.pt")
    mot, plate = model_motor(img, verbose=False)[0], model_plate(img, verbose=False)[0]

    m_boxes = [b.tolist() for b,c in zip(mot.boxes.xyxy.cpu(), mot.boxes.cls.cpu()) if int(c)==3]
    p_boxes = plate.boxes.xyxy.cpu().tolist()
    if not m_boxes or not p_boxes:
        print("⚠️ 影像中無機車或車牌，跳過")
        return

    mid = lambda b: ((b[0]+b[2])/2, (b[1]+b[3])/2)
    m_cent, p_cent = [mid(b) for b in m_boxes], [mid(b) for b in p_boxes]

    # 3. 匈牙利配對
    D = np.linalg.norm(np.expand_dims(m_cent,1)-np.expand_dims(p_cent,0), axis=-1)
    rows, cols = linear_sum_assignment(D)
    matches = [(i,j) for i,j in zip(rows, cols) if D[i,j] < 1000]
    if not matches:
        print("⚠️ 無配對成功機車")
        return

    # 4. 投影 + 像素換算
    def norm_to_px(xn: float, yn: float):
        x = (xn + 1) / 2 * W
        y = (1 - yn) / 2 * H_img
        return float(x), float(y)

    px_pos = []
    for i,_ in matches:
        cx, cy = m_cent[i]
        xn, yn = cv2.perspectiveTransform(np.array([[[cx, cy]]], dtype=np.float32), H)[0, 0]
        x_px, y_px = norm_to_px(xn, yn)
        px_pos.append((x_px, y_px))

    # 5. 讀 OCR
    ocr_data = json.load(open(ocr_json_path, encoding="utf-8"))

    # 6. 組 result list（避免 Infinity）
    results = []
    for idx, (x_px, y_px) in enumerate(px_pos):
        mot_idx, plate_idx = matches[idx]
        cx, cy = m_cent[mot_idx]
        px, py = p_cent[plate_idx]

        best_txt, best_d = "未知", None
        for e in ocr_data:
            ex, ey = e["center"]
            d = np.hypot(ex - px, ey - py)
            if e.get("conf", 0) > 0.7:
                if best_d is None or d < best_d:
                    best_d = d
                    best_txt = e.get("text", best_txt)

        # motor_uid
        motor_uid = f"{best_txt}#{int(cx)}#{int(cy)}"

        results.append(dict(
            motor_index=idx,
            real_x=x_px,
            real_y=y_px,
            plate_text=best_txt,
            match_distance=best_d,   # None 或數值
            location=area_id,        # 舊欄位：純區代號（例如 A01）
            route_key=route_key,     # 新增：IB / TR（可能為 None）
            motor_uid=motor_uid,
        ))

    # 7. 輸出 JSON（禁止 NaN/Inf）
    out_path = img_path + "_result.json"
    json.dump(results, open(out_path, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2, allow_nan=False)
    print(f"✅ 產生 {out_path}  ({len(results)} 筆)")

# ------------ CLI ------------
if __name__ == "__main__":
    # 仍然只收 3 個參數（跟你原本一樣）
    if len(sys.argv) != 3 and len(sys.argv) != 4:
        print("用法: python based_mark.py <image> <base_config_dir> <ocr_json>")
        sys.exit(1)
    run_detection_and_draw(*sys.argv[1:])