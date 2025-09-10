# mark/infer_location.py
import os
from pathlib import Path
from typing import Optional, Tuple, List
import cv2
import numpy as np
import re, json, os


# ----------------------------- 限制執行緒，避免吃滿 CPU -----------------------------
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
try:
    cv2.setNumThreads(1)
except Exception:
    pass
try:
    cv2.ocl.setUseOpenCL(False)
except Exception:
    pass

_AREA_RE = re.compile(r"^[a-z]{2}_[A-Z]\d{2}$")

def _normalize_area_str(location: str, area) -> str | None:
    """
    把 (location, area) 正規化成 ib_G01。
    area 若是 None / tuple / 空字串，直接回 None。
    """
    if not location or area is None:
        return None
    if isinstance(area, tuple):  # 避免把 (area, good) 傻傻丟進來
        return None
    s = f"{str(location).strip().lower()}_{str(area).strip().upper()}"
    return s if _AREA_RE.match(s) else None

def _write_inferred_area_sidecar(query_path: str, final_area: str | None, **extra):
    """
    只要 final_area 合法才寫 sidecar：<原圖>.area.json
    原子寫入避免半套 JSON 被讀到。
    """
    if not final_area:
        return
    sidecar = query_path + ".area.json"
    tmp = sidecar + ".tmp"
    payload = {"inferred_area": final_area}
    if extra: payload.update(extra)
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, sidecar)
    print(f"[inference] ✅ sidecar 寫入 {sidecar} → {final_area}")

# ----------------------------- 參數（對齊你最新設定） -----------------------------
MAX_WIDTH  = int(os.environ.get("SIFT_MAX_WIDTH",  "1400"))   # 讀圖後最長邊縮到 1400
NFEATURES  = int(os.environ.get("SIFT_NFEATURES",  "2500"))   # SIFT 特徵點數
RATIO      = float(os.environ.get("SIFT_RATIO",     "0.80"))  # Lowe ratio
MAX_DES    = int(os.environ.get("SIFT_MAX_DES",    "4000"))   # 每張最多描述子
GOOD_FALLBACK_THR = int(os.environ.get("SIFT_GOOD_THR", "10"))  # ≤ 10 時跨路名全域搜尋
# 最小 good matches 門檻；可用環境變數 KP_GOOD_MIN 覆蓋
KP_GOOD_MIN = int(os.environ.get("KP_GOOD_MIN", "10"))


_SIFT = cv2.SIFT_create(nfeatures=NFEATURES)
_BF   = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)

# ----------------------------- 影像 + SIFT -----------------------------
def _read_gray_resized(p: str, max_w: int = MAX_WIDTH) -> np.ndarray:
    img = cv2.imread(p, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise RuntimeError(f"無法讀圖: {p}")
    h, w = img.shape[:2]
    if max(h, w) > max_w:
        scale = max_w / float(max(h, w))
        img = cv2.resize(img, (max(int(w * scale), 1), max(int(h * scale), 1)), interpolation=cv2.INTER_AREA)
    return img

def _compute_sift(img: np.ndarray):
    kp, des = _SIFT.detectAndCompute(img, None)
    if des is not None and len(des) > MAX_DES:
        des = des[:MAX_DES]
    return kp, des

def _cache_path_for(img_path: str) -> str:
    return img_path + ".sift.npz"

def _load_or_compute_sift(img_path: str):
    """
    快取檔: {image}.sift.npz
      - kp: Nx3 (x, y, size) 目前未使用，但保留
      - des: SIFT 描述子 (float32)
    """
    cpath = _cache_path_for(img_path)
    try:
        if os.path.exists(cpath) and os.path.getmtime(cpath) >= os.path.getmtime(img_path):
            data = np.load(cpath, allow_pickle=True)
            des = data["des"]
            return None, des
    except Exception:
        pass
    img = _read_gray_resized(img_path)
    kp, des = _compute_sift(img)
    try:
        if des is not None:
            # 只存描述子即可
            np.savez_compressed(cpath, des=des)
    except Exception:
        pass
    return kp, des

# ----------------------------- good matches（雙向 MNN + ratio） -----------------------------
def _good_count_mnn(descA: np.ndarray, descB: np.ndarray) -> int:
    if descA is None or descB is None:
        return 0
    # BF + L2，雙向 KNN，比對 2 個並做 ratio
    bf = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)

    knnAB = bf.knnMatch(descA, descB, k=2)
    knnBA = bf.knnMatch(descB, descA, k=2)

    def ratio_keep(knn):
        keep = {}
        for pair in knn:
            if len(pair) < 2:
                continue
            m, n = pair
            if m.distance < RATIO * n.distance:
                keep[m.queryIdx] = m.trainIdx
        return keep

    ab = ratio_keep(knnAB)
    ba = ratio_keep(knnBA)

    # 互為最近鄰（Mutual Nearest Neighbor）
    cnt = 0
    for qa, tb in ab.items():
        if ba.get(tb, -1) == qa:
            cnt += 1
    return int(cnt)

# ----------------------------- 候選列舉/檔名解析 -----------------------------
def _collect_candidates(base_dir: Path) -> List[str]:
    # 只收：*_output.jpg/jpeg/png、base_*.jpg/jpeg/png
    pats = ["*_output.jpg", "*_output.jpeg", "*_output.png",
            "base_*.jpg", "base_*.jpeg", "base_*.png"]
    cands: List[str] = []
    for pat in pats:
        cands.extend(str(p) for p in sorted(base_dir.glob(pat)))
    return sorted(set(cands))

def _area_from_filename(p: str) -> str:
    stem = Path(p).stem  # "A01_output" 或 "base_A01"
    if stem.endswith("_output"):
        return stem[:-7]
    if stem.startswith("base_"):
        return stem[5:]
    return stem

def _list_location_dirs(base_root: Path) -> List[Path]:
    # 僅列出 *_base_images 目錄，避免掃到其他資料夾
    return [d for d in base_root.iterdir() if d.is_dir() and d.name.endswith("_base_images")]

# ----------------------------- 單資料夾最佳（以 good 為準） -----------------------------
def _best_area_in_folder_by_good(q_des: np.ndarray, base_dir: Path) -> Tuple[Optional[str], int]:
    cands = _collect_candidates(base_dir)
    best_good, best_area = -1, None
    for p in cands:
        try:
            _, b_des = _load_or_compute_sift(p)
            g = _good_count_mnn(q_des, b_des)
            area = _area_from_filename(p)
            # print(f"[infer] {base_dir.name}/{area} good={g}")
            if g > best_good:
                best_good, best_area = g, area
        except Exception:
            continue
    return best_area, int(best_good)

# ----------------------------- 跨路名全域最佳（以 good 為準） -----------------------------
def _infer_best_across_locations_by_good(q_des: np.ndarray, base_root: Path) -> Tuple[Optional[str], Optional[str], int]:
    best_loc, best_area, best_good = None, None, -1
    for d in _list_location_dirs(base_root):
        loc = d.name.replace("_base_images", "")
        area, g = _best_area_in_folder_by_good(q_des, d)
        if area is not None and g > best_good:
            best_loc, best_area, best_good = loc, area, g
    return best_loc, best_area, int(best_good)


# ----------------------------- Back-compat for auto_process.py -----------------------------
def infer_area_by_kp(query_path: str, base_root: str, location: str):
    """
    只在 {base_root}/{location}_base_images 內搜尋最佳區碼，回傳 (area, good)。
    額外：若能正規化出最終區域（如 ib_G01），同步寫 sidecar：<原圖>.area.json
    """
    base_root_p = Path(base_root)
    this_dir = base_root_p / f"{location}_base_images"
    if not this_dir.exists():
        return None, -1  # 目錄不存在 → 沒得比

    # 共用一次 query 特徵
    q_img = _read_gray_resized(query_path)
    _, q_des = _compute_sift(q_img)

    # 以 good matches 數為準擇優（回傳 'G01' 這種純區碼）
    area, good = _best_area_in_folder_by_good(q_des, this_dir)

    # === 正規化 + 寫 sidecar（只有合法 ib_G01/hilife_A02 之類才會寫） ===
    final_area = _normalize_area_str(location, area)
    if final_area:
        _write_inferred_area_sidecar(
            query_path, final_area, method="kp", good=int(good), location=location
        )

    return area, int(good)  # 相容舊介面：回 (area, good)


# mark/infer_location.py 內，整段覆蓋這個函式
def infer_location_clip(query_path: str,
                        base_root: Optional[str] = None,
                        location: Optional[str] = None,
                        **kwargs) -> Optional[str]:
    """
    本路名 vs 全域 兩邊都算，最後決策：
      - 本路名太弱（<= GOOD_THR）→ 用全域
      - 否則若全域明顯勝出（比例或差值達門檻且換路名）→ 用全域
      - 否則用本路名
    回傳：<路名>_<區碼>（如 'tr_B02' / 'gges_G01'）
    """
    if not (base_root and location):
        print("[infer] 請以 infer_location_clip(query, base_root, location) 呼叫")
        return None

    base_root_p = Path(base_root)

    # 共用一次 query 特徵
    q_img = _read_gray_resized(query_path)
    _, q_des = _compute_sift(q_img)

    # (A) 本路名最佳
    local_area, local_good = (None, -1)
    this_dir = base_root_p / f"{location}_base_images"
    if this_dir.exists():
        local_area, local_good = _best_area_in_folder_by_good(q_des, this_dir)

    # (B) 全域最佳（找出哪個路名 + 區碼最強）
    g_loc, g_area, g_good = _infer_best_across_locations_by_good(q_des, base_root_p)

    # 決策參數（可用環境變數覆蓋）
    GOOD_THR = int(os.environ.get("KP_GOOD_MIN", "10"))     # 本路名低於此值就直接用全域
    WIN_RATIO = float(os.environ.get("KP_WIN_RATIO", "1.8"))# 全域至少是本路名 1.8 倍
    WIN_MARGIN = int(os.environ.get("KP_WIN_MARGIN", "15")) # 或全域比本路名多 ≥15 個 good

    print(f"[infer] local={location}_{local_area} good={local_good} | "
          f"global={g_loc}_{g_area} good={g_good}")

    # 1) 沒全域可用 → 只能用本路名（或 None）
    if g_loc is None or g_area is None:
        final_area = _normalize_area_str(location, local_area)
        if final_area:
            _write_inferred_area_sidecar(query_path, final_area,
                                         method="clip_sift",
                                         local_good=int(local_good), global_good=int(g_good))
        return final_area

    # 2) 本路名不存在或太弱 → 直接採全域
    if local_area is None or local_good <= GOOD_THR:
        final_area = _normalize_area_str(g_loc, g_area)
        if final_area:
            _write_inferred_area_sidecar(query_path, final_area,
                                         method="clip_sift",
                                         local_good=int(local_good), global_good=int(g_good))
        return final_area

    # 3) 本路名有一定強度，但全域「明顯更強」且換了路名 → 採全域
    if (g_loc != location) and (g_good >= max(local_good * WIN_RATIO, local_good + WIN_MARGIN)):
        final_area = _normalize_area_str(g_loc, g_area)
        if final_area:
            _write_inferred_area_sidecar(query_path, final_area,
                                         method="clip_sift",
                                         local_good=int(local_good), global_good=int(g_good))
        return final_area

    # 4) 其餘情況 → 保留本路名結果
    final_area = _normalize_area_str(location, local_area)
    if final_area:
        _write_inferred_area_sidecar(query_path, final_area,
                                     method="clip_sift",
                                     local_good=int(local_good), global_good=int(g_good))
    return final_area


# ----------------------------- CLI 測試 -----------------------------
if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 4:
        q = sys.argv[1]; root = sys.argv[2]; loc = sys.argv[3]
        print("RESULT:", infer_location_clip(q, root, loc) or "")
    else:
        print("用法: python infer_location.py <query_path> <base_root> <location>")
