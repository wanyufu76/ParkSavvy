# # mark/infer_location.py
# import os
# from pathlib import Path
# from typing import Optional, Tuple, List
# import cv2
# import numpy as np
# import re, json, os


# # ----------------------------- 限制執行緒，避免吃滿 CPU -----------------------------
# os.environ.setdefault("OMP_NUM_THREADS", "1")
# os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
# os.environ.setdefault("MKL_NUM_THREADS", "1")
# os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
# try:
#     cv2.setNumThreads(1)
# except Exception:
#     pass
# try:
#     cv2.ocl.setUseOpenCL(False)
# except Exception:
#     pass

# _AREA_RE = re.compile(r"^[a-z]{2}_[A-Z]\d{2}$")


# def _normalize_area_str(location: str, area) -> str | None:
#     """
#     把 (location, area) 正規化成 ib_G01。
#     area 若是 None / tuple / 空字串，直接回 None。
#     """
#     if not location or area is None:
#         return None
#     if isinstance(area, tuple):  # 避免把 (area, good) 傻傻丟進來
#         return None
#     s = f"{str(location).strip().lower()}_{str(area).strip().upper()}"
#     return s if _AREA_RE.match(s) else None


# def _write_inferred_area_sidecar(query_path: str, final_area: str | None, **extra):
#     """
#     只要 final_area 合法才寫 sidecar：<原圖>.area.json
#     原子寫入避免半套 JSON 被讀到。
#     """
#     if not final_area:
#         return
#     sidecar = query_path + ".area.json"
#     tmp = sidecar + ".tmp"
#     payload = {"inferred_area": final_area}
#     if extra:
#         payload.update(extra)
#     with open(tmp, "w", encoding="utf-8", newline="\n") as f:
#         json.dump(payload, f, ensure_ascii=False, indent=2)
#     os.replace(tmp, sidecar)
#     print(f"[inference] ✅ sidecar 寫入 {sidecar} → {final_area}")


# # ----------------------------- 參數（對齊你最新設定） -----------------------------
# MAX_WIDTH = int(os.environ.get("SIFT_MAX_WIDTH", "1400"))  # 讀圖後最長邊縮到 1400
# NFEATURES = int(os.environ.get("SIFT_NFEATURES", "2500"))  # SIFT 特徵點數
# RATIO = float(os.environ.get("SIFT_RATIO", "0.80"))  # Lowe ratio
# MAX_DES = int(os.environ.get("SIFT_MAX_DES", "4000"))  # 每張最多描述子
# GOOD_FALLBACK_THR = int(os.environ.get("SIFT_GOOD_THR", "10"))  # ≤ 10 時跨路名全域搜尋
# # 最小 good matches 門檻；可用環境變數 KP_GOOD_MIN 覆蓋
# KP_GOOD_MIN = int(os.environ.get("KP_GOOD_MIN", "10"))

# _SIFT = cv2.SIFT_create(nfeatures=NFEATURES)
# _BF = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)


# # ----------------------------- 影像 + SIFT -----------------------------
# def _read_gray_resized(p: str, max_w: int = MAX_WIDTH) -> np.ndarray:
#     img = cv2.imread(p, cv2.IMREAD_GRAYSCALE)
#     if img is None:
#         raise RuntimeError(f"無法讀圖: {p}")
#     h, w = img.shape[:2]
#     if max(h, w) > max_w:
#         scale = max_w / float(max(h, w))
#         img = cv2.resize(
#             img,
#             (max(int(w * scale), 1), max(int(h * scale), 1)),
#             interpolation=cv2.INTER_AREA,
#         )
#     return img


# def _compute_sift(img: np.ndarray):
#     kp, des = _SIFT.detectAndCompute(img, None)
#     if des is not None and len(des) > MAX_DES:
#         des = des[:MAX_DES]
#     return kp, des


# def _cache_path_for(img_path: str) -> str:
#     return img_path + ".sift.npz"


# def _load_or_compute_sift(img_path: str):
#     """
#     快取檔: {image}.sift.npz
#     - kp: Nx3 (x, y, size) 目前未使用，但保留
#     - des: SIFT 描述子 (float32)
#     """
#     cpath = _cache_path_for(img_path)
#     try:
#         if os.path.exists(cpath) and os.path.getmtime(cpath) >= os.path.getmtime(img_path):
#             data = np.load(cpath, allow_pickle=True)
#             des = data["des"]
#             return None, des
#     except Exception:
#         pass
#     img = _read_gray_resized(img_path)
#     kp, des = _compute_sift(img)
#     try:
#         if des is not None:
#             # 只存描述子即可
#             np.savez_compressed(cpath, des=des)
#     except Exception:
#         pass
#     return kp, des


# # ----------------------------- good matches（雙向 MNN + ratio） -----------------------------
# def _good_count_mnn(descA: np.ndarray, descB: np.ndarray) -> int:
#     if descA is None or descB is None:
#         return 0
#     # BF + L2，雙向 KNN，比對 2 個並做 ratio
#     bf = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
#     knnAB = bf.knnMatch(descA, descB, k=2)
#     knnBA = bf.knnMatch(descB, descA, k=2)

#     def ratio_keep(knn):
#         keep = {}
#         for pair in knn:
#             if len(pair) < 2:
#                 continue
#             m, n = pair
#             if m.distance < RATIO * n.distance:
#                 keep[m.queryIdx] = m.trainIdx
#         return keep

#     ab = ratio_keep(knnAB)
#     ba = ratio_keep(knnBA)
#     # 互為最近鄰（Mutual Nearest Neighbor）
#     cnt = 0
#     for qa, tb in ab.items():
#         if ba.get(tb, -1) == qa:
#             cnt += 1
#     return int(cnt)


# # ----------------------------- 候選列舉/檔名解析 -----------------------------
# def _collect_candidates(base_dir: Path) -> List[str]:
#     # 只收：*_output.jpg/jpeg/png、base_*.jpg/jpeg/png
#     pats = ["*_output.jpg", "*_output.jpeg", "*_output.png", "base_*.jpg", "base_*.jpeg", "base_*.png"]
#     cands: List[str] = []
#     for pat in pats:
#         cands.extend(str(p) for p in sorted(base_dir.glob(pat)))
#     return sorted(set(cands))


# def _area_from_filename(p: str) -> str:
#     stem = Path(p).stem  # "A01_output" 或 "base_A01"
#     if stem.endswith("_output"):
#         return stem[:-7]
#     if stem.startswith("base_"):
#         return stem[5:]
#     return stem


# def _list_location_dirs(base_root: Path) -> List[Path]:
#     # 僅列出 *_base_images 目錄，避免掃到其他資料夾
#     return [d for d in base_root.iterdir() if d.is_dir() and d.name.endswith("_base_images")]


# # ----------------------------- 單資料夾最佳（以 good 為準） -----------------------------
# def _best_area_in_folder_by_good(q_des: np.ndarray, base_dir: Path) -> Tuple[Optional[str], int]:
#     cands = _collect_candidates(base_dir)
#     best_good, best_area = -1, None
#     for p in cands:
#         try:
#             _, b_des = _load_or_compute_sift(p)
#             g = _good_count_mnn(q_des, b_des)
#             area = _area_from_filename(p)
#             # print(f"[infer] {base_dir.name}/{area} good={g}")
#             if g > best_good:
#                 best_good, best_area = g, area
#         except Exception:
#             continue
#     return best_area, int(best_good)


# # ----------------------------- 跨路名全域最佳（以 good 為準） -----------------------------
# def _infer_best_across_locations_by_good(q_des: np.ndarray, base_root: Path) -> Tuple[Optional[str], Optional[str], int]:
#     best_loc, best_area, best_good = None, None, -1
#     for d in _list_location_dirs(base_root):
#         loc = d.name.replace("_base_images", "")
#         area, g = _best_area_in_folder_by_good(q_des, d)
#         if area is not None and g > best_good:
#             best_loc, best_area, best_good = loc, area, g
#     return best_loc, best_area, int(best_good)


# # ----------------------------- Back-compat for auto_process.py -----------------------------
# def infer_area_by_kp(query_path: str, base_root: str, location: str):
#     """
#     只在 {base_root}/{location}_base_images 內搜尋最佳區碼，回傳 (area, good)。
#     額外：若能正規化出最終區域（如 ib_G01），同步寫 sidecar：<原圖>.area.json
#     """
#     base_root_p = Path(base_root)
#     this_dir = base_root_p / f"{location}_base_images"
#     if not this_dir.exists():
#         return None, -1  # 目錄不存在 → 沒得比
#     # 共用一次 query 特徵
#     q_img = _read_gray_resized(query_path)
#     _, q_des = _compute_sift(q_img)
#     # 以 good matches 數為準擇優（回傳 'G01' 這種純區碼）
#     area, good = _best_area_in_folder_by_good(q_des, this_dir)
#     # === 正規化 + 寫 sidecar（只有合法 ib_G01/hilife_A02 之類才會寫） ===
#     final_area = _normalize_area_str(location, area)
#     if final_area:
#         _write_inferred_area_sidecar(
#             query_path,
#             final_area,
#             method="kp",
#             good=int(good),
#             location=location
#         )
#     return area, int(good)  # 相容舊介面：回 (area, good)


# # mark/infer_location.py 內，整段覆蓋這個函式
# def infer_location_clip(query_path: str, base_root: Optional[str] = None, location: Optional[str] = None, **kwargs) -> Optional[str]:
#     """
#     本路名 vs 全域 兩邊都算，最後決策：
#     - 本路名太弱（<= GOOD_THR）→ 用全域
#     - 否則若全域明顯勝出（比例或差值達門檻且換路名）→ 用全域
#     - 否則用本路名
#     回傳：<路名>_<區碼>（如 'tr_B02' / 'gges_G01'）
#     """
#     if not (base_root and location):
#         print("[infer] 請以 infer_location_clip(query, base_root, location) 呼叫")
#         return None
#     base_root_p = Path(base_root)
#     # 共用一次 query 特徵
#     q_img = _read_gray_resized(query_path)
#     _, q_des = _compute_sift(q_img)
#     # (A) 本路名最佳
#     local_area, local_good = (None, -1)
#     this_dir = base_root_p / f"{location}_base_images"
#     if this_dir.exists():
#         local_area, local_good = _best_area_in_folder_by_good(q_des, this_dir)
#     # (B) 全域最佳（找出哪個路名 + 區碼最強）
#     g_loc, g_area, g_good = _infer_best_across_locations_by_good(q_des, base_root_p)
#     # 決策參數（可用環境變數覆蓋）
#     GOOD_THR = int(os.environ.get("KP_GOOD_MIN", "10"))  # 本路名低於此值就直接用全域
#     WIN_RATIO = float(os.environ.get("KP_WIN_RATIO", "1.8"))  # 全域至少是本路名 1.8 倍
#     WIN_MARGIN = int(os.environ.get("KP_WIN_MARGIN", "15"))  # 或全域比本路名多 ≥15 個 good
#     print(
#         f"[infer] local={location}_{local_area} good={local_good} | "
#         f"global={g_loc}_{g_area} good={g_good}"
#     )
#     # 1) 沒全域可用 → 只能用本路名（或 None）
#     if g_loc is None or g_area is None:
#         final_area = _normalize_area_str(location, local_area)
#         if final_area:
#             _write_inferred_area_sidecar(
#                 query_path, final_area, method="clip_sift", local_good=int(local_good), global_good=int(g_good)
#             )
#         return final_area
#     # 2) 本路名不存在或太弱 → 直接採全域
#     if local_area is None or local_good <= GOOD_THR:
#         final_area = _normalize_area_str(g_loc, g_area)
#         if final_area:
#             _write_inferred_area_sidecar(
#                 query_path, final_area, method="clip_sift", local_good=int(local_good), global_good=int(g_good)
#             )
#         return final_area
#     # 3) 本路名有一定強度，但全域「明顯更強」且換了路名 → 採全域
#     if (g_loc != location) and (g_good >= max(local_good * WIN_RATIO, local_good + WIN_MARGIN)):
#         final_area = _normalize_area_str(g_loc, g_area)
#         if final_area:
#             _write_inferred_area_sidecar(
#                 query_path, final_area, method="clip_sift", local_good=int(local_good), global_good=int(g_good)
#             )
#         return final_area
#     # 4) 其餘情況 → 保留本路名結果
#     final_area = _normalize_area_str(location, local_area)
#     if final_area:
#         _write_inferred_area_sidecar(
#             query_path, final_area, method="clip_sift", local_good=int(local_good), global_good=int(g_good)
#         )
#     return final_area


# # ----------------------------- CLI 測試 -----------------------------
# if __name__ == "__main__":
#     import sys
#     if len(sys.argv) >= 4:
#         q = sys.argv[1]; root = sys.argv[2]; loc = sys.argv[3]
#         print("RESULT:", infer_location_clip(q, root, loc) or "")
#     else:
#         print("用法: python infer_location.py <query_path> <base_root> <location>")














# mark/infer_location.py
import os
import re
import json
from pathlib import Path
from typing import Optional, Tuple, List
import cv2
import numpy as np
import math

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

# ----------------------------- 命名與 sidecar -----------------------------
_AREA_RE = re.compile(r"^[a-z]{2}_[A-Z]\d{2}$")

def _normalize_area_str(location: str, area) -> Optional[str]:
    """
    把 (location, area) 正規化成 ib_G01。
    area 若是 None / tuple / 空字串，回 None。
    """
    if not location or area is None:
        return None
    if isinstance(area, tuple):  # 避免 (area, good) 被丟進來
        return None
    s = f"{str(location).strip().lower()}_{str(area).strip().upper()}"
    return s if _AREA_RE.match(s) else None

def _write_inferred_area_sidecar(query_path: str, final_area: Optional[str], **extra):
    """
    final_area 合法才寫 sidecar：<原圖>.area.json（原子寫入）
    """
    if not final_area:
        return
    sidecar = query_path + ".area.json"
    tmp = sidecar + ".tmp"
    payload = {"inferred_area": final_area}
    if extra:
        payload.update(extra)
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, sidecar)
    print(f"[inference]  sidecar 寫入 {sidecar} → {final_area}")

# ----------------------------- 參數（整合你的新設定，可用環境變數覆蓋） -----------------------------
# 影像與特徵
MAX_SIDE_DETECT   = int(os.environ.get("KP_MAX_SIDE",     "1600"))
KP_NFEATURES      = int(os.environ.get("KP_NFEATURES",    "6000")) #5000
RATIO_TEST        = float(os.environ.get("KP_RATIO",      "0.60")) #0.65
RANSAC_REPROJ_THRES = float(os.environ.get("KP_RANSAC_REPROJ", "3.0"))

# 強化選項
USE_CLAHE         = bool(int(os.environ.get("KP_USE_CLAHE", "1")))
CLAHE_CLIP        = float(os.environ.get("KP_CLAHE_CLIP",  "3.0")) #2.0
GUIDED_GATING     = bool(int(os.environ.get("KP_GUIDED_GATING", "1")))
ANGLE_THR         = float(os.environ.get("KP_ANGLE_THR",   "60.0")) #30.0
SCALE_THR         = float(os.environ.get("KP_SCALE_THR",   "1.8"))
USE_GEOM_ERROR    = bool(int(os.environ.get("KP_USE_GEOM_ERR", "1")))
GEOM_ERR_SIGMA    = float(os.environ.get("KP_GEOM_SIGMA",  "6.0")) #8.0
USE_SPATIAL_CLUSTERING = bool(int(os.environ.get("KP_USE_CLUSTER", "0"))) #主要原因 #1
MIN_CLUSTER_SIZE  = int(os.environ.get("KP_MIN_CLUSTER", "4")) #8 #6
MAX_CLUSTER_DISTANCE = float(os.environ.get("KP_CLUSTER_DIST", "70")) #50

# 顏色直方圖
USE_COLOR_HIST_VERIFY = bool(int(os.environ.get("KP_USE_HIST", "1")))
COLOR_HIST_WEIGHT = float(os.environ.get("KP_HIST_W", "0.4")) #0.3 #0.35

# good 門檻（本路名過低就觸發全域）
KP_GOOD_MIN       = int(os.environ.get("KP_GOOD_MIN", "10"))

# 分層（掃描路名優先順序），逗號分隔，例如：ib,tr,gges
LOC_PRIORITY_ENV  = os.environ.get("LOC_PRIORITY", "")
LOC_PRIORITY      = [p.strip().lower() for p in LOC_PRIORITY_ENV.split(",") if p.strip()]

# 全域 vs 本地 決策門檻（基於 precision_score）
PREC_WIN_RATIO    = float(os.environ.get("KP_PREC_WIN_RATIO", "1.25"))  # 全域相對優勢比例
PREC_WIN_MARGIN   = float(os.environ.get("KP_PREC_WIN_MARGIN", "0.10"))  # 全域絕對優勢（加分）
SIMILARITY_THRESHOLD = float(os.environ.get("KP_SIM_THR", "0.60"))       # 若某路名下最佳分數 >= 此值，視為足夠好

# 舊版相容（只靠 good）
MAX_DES           = int(os.environ.get("SIFT_MAX_DES", "4000"))

# ----------------------------- 影像 & 工具 -----------------------------
def _read_gray_resized(p: str, max_side: int = MAX_SIDE_DETECT) -> np.ndarray:
    img = cv2.imread(p, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise RuntimeError(f"無法讀圖: {p}")
    h, w = img.shape[:2]
    ms = max(h, w)
    if ms > max_side:
        scale = max_side / float(ms)
        img = cv2.resize(img, (max(int(w * scale), 1), max(int(h * scale), 1)), interpolation=cv2.INTER_AREA)
    return img

def _collect_candidates(base_dir: Path) -> List[str]:
    # 支援 *_output.* 與 base_*.*
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
    # 僅列出 *_base_images 目錄
    dirs = [d for d in base_root.iterdir() if d.is_dir() and d.name.endswith("_base_images")]
    if LOC_PRIORITY:
        def order_key(d: Path):
            loc = d.name.replace("_base_images", "").lower()
            try:
                idx = LOC_PRIORITY.index(loc)
            except ValueError:
                idx = 10**6
            return (idx, loc)
        dirs.sort(key=order_key)
    else:
        dirs.sort()
    return dirs

# ----------------------------- PrecisionMatcher（整合你的新邏輯） -----------------------------
class PrecisionMatcher:
    def __init__(self):
        # SIFT（穩健參數）
        try:
            self.detector = cv2.SIFT_create(
                nfeatures=KP_NFEATURES,
                nOctaveLayers=4,
                contrastThreshold=0.03,
                edgeThreshold=15,
                sigma=1.2
            )
            self.norm_type = cv2.NORM_L2
            self.kp_name = "SIFT"
        except Exception:
            # Fallback: ORB
            self.detector = cv2.ORB_create(
                nfeatures=KP_NFEATURES,
                scaleFactor=1.15,
                nlevels=12,
                edgeThreshold=15,
                firstLevel=0,
                WTA_K=2,
                scoreType=cv2.ORB_HARRIS_SCORE,
                patchSize=31,
                fastThreshold=15
            )
            self.norm_type = cv2.NORM_HAMMING
            self.kp_name = "ORB"

        self.kp_cache = {}
        self.hist_cache = {}

    # --- I/O & 前處理 ---
    def _read_gray(self, path):
        return cv2.imread(path, cv2.IMREAD_GRAYSCALE)

    def _read_color(self, path):
        img = cv2.imread(path, cv2.IMREAD_COLOR)
        return cv2.cvtColor(img, cv2.COLOR_BGR2RGB) if img is not None else None

    def _resize_max_side(self, img, max_side=MAX_SIDE_DETECT):
        h, w = img.shape[:2]
        ms = max(h, w)
        if ms <= max_side:
            return img, 1.0
        scale = max_side / float(ms)
        resized = cv2.resize(img, (max(int(w * scale), 1), max(int(h * scale), 1)))
        return resized, scale

    def _enhance_gray(self, gray):
        if USE_CLAHE:
            clahe = cv2.createCLAHE(clipLimit=CLAHE_CLIP, tileGridSize=(8, 8))
            gray = clahe.apply(gray)
        gray = cv2.GaussianBlur(gray, (3, 3), 0.8)
        return gray

    def get_kp_desc(self, path):
        if path in self.kp_cache:
            return self.kp_cache[path]
        gray = self._read_gray(path)
        if gray is None:
            self.kp_cache[path] = ([], None, 1.0, (0, 0), (0, 0))
            return self.kp_cache[path]
        original_shape = gray.shape
        gray, scale = self._resize_max_side(gray, MAX_SIDE_DETECT)
        gray = self._enhance_gray(gray)
        kps, desc = self.detector.detectAndCompute(gray, None)
        if desc is not None and len(desc) > MAX_DES:
            desc = desc[:MAX_DES]
        h, w = gray.shape[:2]
        self.kp_cache[path] = (kps or [], desc, scale, (h, w), original_shape)
        return self.kp_cache[path]

    # --- 顏色直方圖 ---
    def _compute_color_histogram(self, path):
        if path in self.hist_cache:
            return self.hist_cache[path]
        img = self._read_color(path)
        if img is None:
            self.hist_cache[path] = None
            return None
        img = cv2.resize(img, (256, 256))
        hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
        hist = cv2.calcHist([hsv], [0, 1, 2], None, [50, 60, 60], [0, 180, 0, 256, 0, 256])
        hist = cv2.normalize(hist, hist).flatten()
        self.hist_cache[path] = hist
        return hist

    def _compare_histograms(self, pathA, pathB):
        hA = self._compute_color_histogram(pathA)
        hB = self._compute_color_histogram(pathB)
        if hA is None or hB is None:
            return 0.0
        sim = cv2.compareHist(hA, hB, cv2.HISTCMP_BHATTACHARYYA)
        return max(0.0, 1.0 - float(sim))

    # --- 進階匹配 ---
    def _advanced_ratio_test(self, descA, descB, kpsA, kpsB):
        if self.kp_name == "SIFT":
            if descA is None or descB is None:
                return []
            if descA.dtype != np.float32:
                descA = descA.astype(np.float32)
            if descB.dtype != np.float32:
                descB = descB.astype(np.float32)
            index_params = dict(algorithm=1, trees=12)  # FLANN_INDEX_KDTREE=1
            search_params = dict(checks=100)
            matcher = cv2.FlannBasedMatcher(index_params, search_params)
            knnAB = matcher.knnMatch(descA, descB, k=3)
            knnBA = matcher.knnMatch(descB, descA, k=3)
        else:
            bf = cv2.BFMatcher(self.norm_type, crossCheck=False)
            knnAB = bf.knnMatch(descA, descB, k=3)
            knnBA = bf.knnMatch(descB, descA, k=3)

        def enhanced_ratio_pass(knn):
            keep = {}
            for matches in knn:
                if len(matches) < 2:
                    continue
                m, n = matches[0], matches[1]
                if m.distance < RATIO_TEST * n.distance:
                    if len(matches) >= 3:
                        o = matches[2]
                        if m.distance < 0.8 * o.distance:
                            keep[m.queryIdx] = m.trainIdx
                    else:
                        keep[m.queryIdx] = m.trainIdx
            return keep

        ab = enhanced_ratio_pass(knnAB)
        ba = enhanced_ratio_pass(knnBA)

        mapAB = {}
        for matches in knnAB:
            if len(matches) >= 1:
                m = matches[0]
                mapAB[(m.queryIdx, m.trainIdx)] = m

        good = []
        for qa, tb in ab.items():
            if (tb in ba) and (ba.get(tb) == qa) and ((qa, tb) in mapAB):
                good.append(mapAB[(qa, tb)])
        return good

    def _guided_gating_advanced(self, matches, kpsA, kpsB):
        if not GUIDED_GATING:
            return matches
        kept = []
        for m in matches:
            a = kpsA[m.queryIdx]
            b = kpsB[m.trainIdx]
            ad = abs(a.angle - b.angle)
            ad = 360.0 - ad if ad > 180.0 else ad
            sr = (a.size + 1e-8) / (b.size + 1e-8)
            response_ok = True
            if hasattr(a, 'response') and hasattr(b, 'response'):
                rr = (a.response + 1e-8) / (b.response + 1e-8)
                response_ok = (1.0 / SCALE_THR) <= rr <= SCALE_THR
            if ad <= ANGLE_THR and (1.0 / SCALE_THR) <= sr <= SCALE_THR and response_ok:
                kept.append(m)
        return kept

    def _spatial_clustering_filter(self, matches, kpsA, kpsB):
        if not USE_SPATIAL_CLUSTERING or len(matches) < MIN_CLUSTER_SIZE:
            return matches
        points = []
        for i, m in enumerate(matches):
            ptA = kpsA[m.queryIdx].pt
            ptB = kpsB[m.trainIdx].pt
            center = ((ptA[0] + ptB[0]) / 2, (ptA[1] + ptB[1]) / 2)
            points.append((center, i))
        clusters = []
        used = set()
        for i, (pt, idx) in enumerate(points):
            if idx in used:
                continue
            cluster = [idx]
            used.add(idx)
            for j, (opt, oidx) in enumerate(points):
                if oidx in used:
                    continue
                dist = np.hypot(pt[0] - opt[0], pt[1] - opt[1])
                if dist < MAX_CLUSTER_DISTANCE:
                    cluster.append(oidx)
                    used.add(oidx)
            if len(cluster) >= MIN_CLUSTER_SIZE:
                clusters.append(cluster)
        if not clusters:
            return matches
        largest = max(clusters, key=len)
        return [matches[i] for i in largest]

    def _coverage_advanced(self, pts, shape):
        if pts.shape[0] < 3:
            return 0.0
        h, w = shape
        hull = cv2.convexHull(pts.reshape(-1, 1, 2))
        hull_area = cv2.contourArea(hull)
        center = np.mean(pts, axis=0)
        distances = np.linalg.norm(pts - center, axis=1)
        spread = np.std(distances) / max(w, h)
        area_ratio = hull_area / max(h * w, 1)
        coverage = area_ratio * (1 + spread)
        return float(np.clip(coverage, 0.0, 1.0))

    def _mean_sym_transfer_error_H(self, H, ptsA, ptsB):
        if H is None or ptsA.shape[0] == 0:
            return float('inf')
        A1 = np.hstack([ptsA, np.ones((ptsA.shape[0], 1), dtype=np.float32)])
        B1 = np.hstack([ptsB, np.ones((ptsB.shape[0], 1), dtype=np.float32)])
        HB = (H @ A1.T).T
        HB = HB[:, :2] / np.clip(HB[:, 2:3], 1e-12, None)
        try:
            Hinv = np.linalg.inv(H)
            HA = (Hinv @ B1.T).T
            HA = HA[:, :2] / np.clip(HA[:, 2:3], 1e-12, None)
            err = 0.5 * (np.linalg.norm(HB - ptsB, axis=1) + np.linalg.norm(HA - ptsA, axis=1))
        except np.linalg.LinAlgError:
            err = np.linalg.norm(HB - ptsB, axis=1)
        return float(np.mean(err)) if err.size else float('inf')

    def _mean_epi_error_F(self, F, ptsA, ptsB):
        if F is None or ptsA.shape[0] == 0:
            return float('inf')
        A1 = np.hstack([ptsA, np.ones((ptsA.shape[0], 1), dtype=np.float32)])
        B1 = np.hstack([ptsB, np.ones((ptsB.shape[0], 1), dtype=np.float32)])
        l2 = (F @ A1.T).T
        l1 = (F.T @ B1.T).T
        num2 = np.abs(np.sum(l2 * B1, axis=1))
        den2 = np.sqrt(l2[:, 0]**2 + l2[:, 1]**2) + 1e-12
        d2 = num2 / den2
        num1 = np.abs(np.sum(l1 * A1, axis=1))
        den1 = np.sqrt(l1[:, 0]**2 + l1[:, 1]**2) + 1e-12
        d1 = num1 / den1
        err = 0.5 * (d1 + d2)
        return float(np.mean(err)) if err.size else float('inf')

    def _f_err(self, e, sigma=GEOM_ERR_SIGMA):
        if not USE_GEOM_ERROR:
            return 1.0
        if not np.isfinite(e):
            return 0.0
        return float(math.exp(- (e / max(sigma, 1e-6)) ** 2))

    # --- 主比對（高精度） ---
    def match_two_precision(self, pathA, pathB):
        kpsA, descA, scaleA, shapeA, _ = self.get_kp_desc(pathA)
        kpsB, descB, scaleB, shapeB, _ = self.get_kp_desc(pathB)

        if descA is None or descB is None or len(kpsA) == 0 or len(kpsB) == 0:
            return dict(good_count=0, inlier_count=0, coverage=0.0, model=None,
                        H=None, mean_error=float('inf'), precision_score=0.0,
                        color_similarity=0.0, geometric_consistency=False,
                        kpsA=kpsA or [], kpsB=kpsB or [],
                        scaleA=scaleA, scaleB=scaleB, shapeA=shapeA, shapeB=shapeB)

        good = self._advanced_ratio_test(descA, descB, kpsA, kpsB)
        good = self._guided_gating_advanced(good, kpsA, kpsB)
        good = self._spatial_clustering_filter(good, kpsA, kpsB)

        inlier_count = 0
        coverage = 0.0
        model = None
        H = None
        F = None
        mean_error = float('inf')
        geometric_consistency = False

        if len(good) >= 8:
            ptsA = np.float32([kpsA[m.queryIdx].pt for m in good])
            ptsB = np.float32([kpsB[m.trainIdx].pt for m in good])

            # Homography（優先 MAGSAC）
            try:
                Hh, maskH = cv2.findHomography(
                    ptsA.reshape(-1, 1, 2), ptsB.reshape(-1, 1, 2),
                    cv2.USAC_MAGSAC, RANSAC_REPROJ_THRES, 0.9999, 10000
                )
            except Exception:
                Hh, maskH = cv2.findHomography(
                    ptsA.reshape(-1, 1, 2), ptsB.reshape(-1, 1, 2),
                    cv2.RANSAC, RANSAC_REPROJ_THRES, maxIters=5000, confidence=0.999
                )
            inH = int(np.count_nonzero(maskH)) if maskH is not None else 0

            # Fundamental
            try:
                F, maskF = cv2.findFundamentalMat(
                    ptsA, ptsB, cv2.USAC_MAGSAC, RANSAC_REPROJ_THRES, 0.9999, 10000
                )
            except Exception:
                F, maskF = cv2.findFundamentalMat(
                    ptsA, ptsB, cv2.FM_RANSAC, RANSAC_REPROJ_THRES, 0.9999, 10000
                )
            inF = int(np.count_nonzero(maskF)) if maskF is not None else 0

            # 幾何一致性
            geom_score = 0.0
            try:
                cond = np.linalg.cond(Hh) if Hh is not None else 1e9
                if cond < 1000:
                    geom_score += 0.5
                if F is not None:
                    _, s, _ = np.linalg.svd(F)
                    if len(s) >= 2 and abs(s[-1]) < 0.01 * s[-2]:
                        geom_score += 0.5
            except Exception:
                pass

            errH = float('inf')
            if inH > 0 and Hh is not None:
                keepH = maskH.ravel().astype(bool)
                errH = self._mean_sym_transfer_error_H(Hh, ptsA[keepH], ptsB[keepH])
            errF = float('inf')
            if inF > 0 and F is not None:
                keepF = maskF.ravel().astype(bool)
                errF = self._mean_epi_error_F(F, ptsA[keepF], ptsB[keepF])

            SH = inH * self._f_err(errH) * (1 + geom_score)
            SF = inF * self._f_err(errF) * (1 + geom_score)

            if SF > SH and inF >= int(inH * 0.8):
                inlier_mask = maskF.ravel().astype(bool) if maskF is not None else None
                model = "F"; H = None; mean_error = errF; inlier_count = inF
            else:
                inlier_mask = maskH.ravel().astype(bool) if maskH is not None else None
                model = "H"; H = Hh; mean_error = errH; inlier_count = inH

            if inlier_count > 0:
                inlier_ratio = inlier_count / max(len(good), 1)
                if inlier_ratio < 0.15:
                    inlier_count = 0
                else:
                    coverage = self._coverage_advanced(ptsA[inlier_mask], shapeA)
                    if coverage < 0.05:
                        inlier_count = 0
                    else:
                        geometric_consistency = (geom_score > 0.3)
                        good = [g for g, keep in zip(good, inlier_mask) if keep]

        color_similarity = 0.0
        if USE_COLOR_HIST_VERIFY:
            color_similarity = self._compare_histograms(pathA, pathB)

        # 綜合 score
        if inlier_count > 0:
            base_score = inlier_count * (0.3 + 0.7 * coverage) * self._f_err(mean_error)
            precision_score = base_score * (1 - COLOR_HIST_WEIGHT + COLOR_HIST_WEIGHT * color_similarity) \
                              if USE_COLOR_HIST_VERIFY else base_score
            if geometric_consistency:
                precision_score *= 1.2
        else:
            precision_score = 0.1 * len(good)

        return dict(
            good_count=len(good),
            inlier_count=inlier_count,
            coverage=coverage,
            model=model,
            H=H,
            mean_error=float(mean_error) if np.isfinite(mean_error) else float('inf'),
            precision_score=float(precision_score),
            color_similarity=float(color_similarity),
            geometric_consistency=geometric_consistency,
            kpsA=kpsA, kpsB=kpsB,
            scaleA=scaleA, scaleB=scaleB, shapeA=shapeA, shapeB=shapeB
        )

# ----------------------------- 以 good 為準（舊介面用） -----------------------------
_BF = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
def _compute_sift_good_only(img: np.ndarray):
    sift = cv2.SIFT_create(nfeatures=2000)
    kp, des = sift.detectAndCompute(img, None)
    if des is not None and len(des) > MAX_DES:
        des = des[:MAX_DES]
    return kp, des

def _good_count_mnn(descA: np.ndarray, descB: np.ndarray) -> int:
    if descA is None or descB is None:
        return 0
    bf = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
    knnAB = bf.knnMatch(descA, descB, k=2)
    knnBA = bf.knnMatch(descB, descA, k=2)
    def ratio_keep(knn):
        keep = {}
        for pair in knn:
            if len(pair) < 2:
                continue
            m, n = pair
            if m.distance < RATIO_TEST * n.distance:
                keep[m.queryIdx] = m.trainIdx
        return keep
    ab = ratio_keep(knnAB)
    ba = ratio_keep(knnBA)
    cnt = 0
    for qa, tb in ab.items():
        if ba.get(tb, -1) == qa:
            cnt += 1
    return int(cnt)

def _best_area_in_folder_by_good(q_des: np.ndarray, base_dir: Path) -> Tuple[Optional[str], int]:
    cands = _collect_candidates(base_dir)
    best_good, best_area = -1, None
    for p in cands:
        try:
            img = _read_gray_resized(p)
            _, b_des = _compute_sift_good_only(img)
            g = _good_count_mnn(q_des, b_des)
            area = _area_from_filename(p)
            if g > best_good:
                best_good, best_area = g, area
        except Exception:
            continue
    return best_area, int(best_good)

# ----------------------------- 高精度：在特定資料夾找最佳 -----------------------------
def _best_area_in_folder_by_precision(matcher: PrecisionMatcher, query_path: str, base_dir: Path
                                      ) -> Tuple[Optional[str], float, int]:
    cands = _collect_candidates(base_dir)
    best_score, best_area, best_good = -1.0, None, 0
    for p in cands:
        try:
            m = matcher.match_two_precision(query_path, p)
            score = float(m.get("precision_score", 0.0))
            good  = int(m.get("good_count", 0))
            area = _area_from_filename(p)
            if score > best_score:
                best_score, best_area, best_good = score, area, good
        except Exception:
            continue
    return best_area, float(best_score), int(best_good)

def _infer_best_across_locations_by_precision(matcher: PrecisionMatcher, query_path: str, base_root: Path
                                              ) -> Tuple[Optional[str], Optional[str], float, int]:
    best_loc, best_area, best_score, best_good = None, None, -1.0, 0
    for d in _list_location_dirs(base_root):
        loc = d.name.replace("_base_images", "")
        area, sc, gd = _best_area_in_folder_by_precision(matcher, query_path, d)
        if area is not None and sc > best_score:
            best_loc, best_area, best_score, best_good = loc, area, sc, gd
    return best_loc, best_area, float(best_score), int(best_good)

# ----------------------------- Back-compat：只在本路名內找（回 (area, good)） -----------------------------
def infer_area_by_kp(query_path: str, base_root: str, location: str):
    base_root_p = Path(base_root)
    this_dir = base_root_p / f"{location}_base_images"
    if not this_dir.exists():
        return None, -1
    q_img = _read_gray_resized(query_path)
    _, q_des = _compute_sift_good_only(q_img)
    area, good = _best_area_in_folder_by_good(q_des, this_dir)
    final_area = _normalize_area_str(location, area)
    if final_area:
        _write_inferred_area_sidecar(query_path, final_area, method="kp", good=int(good), location=location)
    return area, int(good)

# ----------------------------- 主入口：給 routes.ts 用（回 "<loc>_<area>"） -----------------------------
def infer_location_clip(query_path: str,
                        base_root: Optional[str] = None,
                        location: Optional[str] = None,
                        **kwargs) -> Optional[str]:
    """
    呼叫方式：infer_location_clip(query_path, base_root, location)
    行為：
      - 同時計算「本路名」與「全域」最佳（高精度 precision_score）
      - 若本路名 good <= KP_GOOD_MIN → 採全域
      - 否則若全域 precision_score 明顯勝出（ratio 或 margin）且換路名 → 採全域
      - 其他 → 採本路名
    回傳：一律 "<實際路名>_<區碼>"（例如 "ib_A01" / "tr_B02"）
    """
    if not (base_root and location):
        print("[infer] 請以 infer_location_clip(query, base_root, location) 呼叫")
        return None

    base_root_p = Path(base_root)
    matcher = PrecisionMatcher()

    # (A) 本路名最佳
    local_area, local_score, local_good = (None, -1.0, -1)
    this_dir = base_root_p / f"{location}_base_images"
    if this_dir.exists():
        local_area, local_score, local_good = _best_area_in_folder_by_precision(matcher, query_path, this_dir)

    # (B) 全域最佳
    g_loc, g_area, g_score, g_good = _infer_best_across_locations_by_precision(matcher, query_path, base_root_p)

    print(f"[infer] local={location}_{local_area} "
          f"score={local_score:.4f} good={local_good} | "
          f"global={g_loc}_{g_area} score={g_score:.4f} good={g_good}")

    # 沒全域 → 回本地（或 None）
    if g_loc is None or g_area is None:
        final_area = _normalize_area_str(location, local_area)
        if final_area:
            _write_inferred_area_sidecar(query_path, final_area,
                                         method="precision", local_score=float(local_score),
                                         local_good=int(local_good), global_score=float(g_score),
                                         global_good=int(g_good))
        return final_area

    # 本地不存在或太弱 → 全域
    if local_area is None or local_good <= KP_GOOD_MIN:
        final_area = _normalize_area_str(g_loc, g_area)
        if final_area:
            _write_inferred_area_sidecar(query_path, final_area,
                                         method="precision", local_score=float(local_score),
                                         local_good=int(local_good), global_score=float(g_score),
                                         global_good=int(g_good))
        return final_area

    # 若全域分數 >= 門檻 且（相對或絕對）明顯勝出，且路名不同 → 全域
    if (g_loc != location) and (
        (g_score >= max(local_score * PREC_WIN_RATIO, local_score + PREC_WIN_MARGIN))
        or (g_score >= SIMILARITY_THRESHOLD and g_score > local_score)
    ):
        final_area = _normalize_area_str(g_loc, g_area)
        if final_area:
            _write_inferred_area_sidecar(query_path, final_area,
                                         method="precision", local_score=float(local_score),
                                         local_good=int(local_good), global_score=float(g_score),
                                         global_good=int(g_good))
        return final_area

    # 其餘 → 本地
    final_area = _normalize_area_str(location, local_area)
    if final_area:
        _write_inferred_area_sidecar(query_path, final_area,
                                     method="precision", local_score=float(local_score),
                                     local_good=int(local_good), global_score=float(g_score),
                                     global_good=int(g_good))
    return final_area

# ----------------------------- CLI 測試 -----------------------------
if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 4:
        q = sys.argv[1]; root = sys.argv[2]; loc = sys.argv[3]
        print("RESULT:", infer_location_clip(q, root, loc) or "")
    else:
        print("用法: python infer_location.py <query_path> <base_root> <location>")
