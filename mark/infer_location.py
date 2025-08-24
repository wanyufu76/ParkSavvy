# # infer_location.py
# import clip
# import torch
# from PIL import Image
# import os
# from torchvision.transforms import Compose, Resize, CenterCrop, ToTensor, Normalize

# clip_model, clip_preprocess = clip.load("ViT-B/32", device="cuda" if torch.cuda.is_available() else "cpu")
# clip_device = "cuda" if torch.cuda.is_available() else "cpu"

# def get_clip_feature(img_path):
#     image = clip_preprocess(Image.open(img_path)).unsqueeze(0).to(clip_device)
#     with torch.no_grad():   
#         feature = clip_model.encode_image(image)
#     return feature / feature.norm(dim=-1, keepdim=True)

# def infer_location_clip(query_path, processed_images_dir="processed_images"):
#     query_feature = get_clip_feature(query_path)
#     max_sim = -1
#     best_location = None

#     for fname in os.listdir(processed_images_dir):
#         if not fname.endswith("_output.jpg"):
#             continue
#         location = fname.replace("_output.jpg", "")  # 例如 A01_output.jpg → A01
#         base_img_path = os.path.join(processed_images_dir, fname)
#         try:
#             base_feature = get_clip_feature(base_img_path)
#             sim = (query_feature @ base_feature.T).item()
#             print(f"📊 CLIP 相似度 {location}: {sim:.4f}")
#             if sim > max_sim:
#                 max_sim = sim
#                 best_location = location
#         except Exception as e:
#             print(f"⚠️ 無法處理 {fname}：{e}")
#             continue

#     return best_location





import os
from pathlib import Path
from typing import Optional, Tuple, List
import cv2
import numpy as np

# -----------------------------
# 限制執行緒，避免吃滿 CPU
# -----------------------------
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
try:
    cv2.setNumThreads(1)          # 明確只用 1 執行緒
except Exception:
    pass
try:
    cv2.ocl.setUseOpenCL(False)   # 關掉 OpenCL
except Exception:
    pass

# -----------------------------
# 參數（依你的 similarity_sift.py）
# -----------------------------
MAX_WIDTH  = int(os.environ.get("SIFT_MAX_WIDTH",  "1400"))   # 讀圖後若寬度超過就縮到 1400
NFEATURES  = int(os.environ.get("SIFT_NFEATURES",  "2000"))   # SIFT 特徵數（可依原檔調整）
RATIO      = float(os.environ.get("SIFT_RATIO",     "0.75"))  # Lowe ratio
MAX_DES    = int(os.environ.get("SIFT_MAX_DES",    "4000"))   # 每張最多使用多少描述子（加速）

_SIFT = cv2.SIFT_create(nfeatures=NFEATURES)
_BF   = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)


# -----------------------------
# 影像 IO + SIFT
# -----------------------------
def _read_gray_resized(p: str, max_w: int = MAX_WIDTH) -> np.ndarray:
    img = cv2.imread(p, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise RuntimeError(f"無法讀圖: {p}")
    h, w = img.shape[:2]
    if w > max_w:
        scale = max_w / float(w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def _compute_sift(img: np.ndarray):
    kp, des = _SIFT.detectAndCompute(img, None)
    if des is not None and len(des) > MAX_DES:
        des = des[:MAX_DES]  # 截斷加速，不影響邏輯
    return kp, des


def _cache_path_for(img_path: str) -> str:
    return img_path + ".sift.npz"


def _load_or_compute_sift(img_path: str):
    """
    快取：{image}.sift.npz
      - kp: Nx3 (x, y, size)
      - des: SIFT 描述子 (float32)
    """
    cpath = _cache_path_for(img_path)
    try:
        if os.path.exists(cpath) and os.path.getmtime(cpath) >= os.path.getmtime(img_path):
            data = np.load(cpath, allow_pickle=True)
            kparr = data["kp"]
            kp = [cv2.KeyPoint(x=float(x), y=float(y), _size=float(s)) for (x, y, s) in kparr]
            des = data["des"]
            return kp, des
    except Exception:
        pass

    img = _read_gray_resized(img_path)
    kp, des = _compute_sift(img)

    try:
        if des is not None:
            kparr = np.array([[k.pt[0], k.pt[1], k.size] for k in kp], dtype=np.float32)
            np.savez_compressed(cpath, kp=kparr, des=des)
    except Exception:
        pass

    return kp, des


def _score_pair(query_des, base_des) -> float:
    """以 Lowe ratio 取 good matches 數量當分數（與 similarity_sift.py 等價）"""
    if query_des is None or base_des is None:
        return 0.0
    matches = _BF.knnMatch(query_des, base_des, k=2)
    good = [m for m, n in matches if n is not None and m.distance < RATIO * n.distance]
    return float(len(good))


# -----------------------------
# 候選收集 & 檔名解析
# -----------------------------
def _collect_candidates(base_dir: Path) -> List[str]:
    # 只收常見影像：*_output.jpg/jpeg/png 與 base_*.jpg/jpeg/png
    pats = ["*_output.jpg", "*_output.jpeg", "*_output.png",
            "base_*.jpg", "base_*.jpeg", "base_*.png"]
    cands: List[str] = []
    for pat in pats:
        cands.extend(str(p) for p in sorted(base_dir.glob(pat)))
    # 去重
    return sorted(set(cands))


def _area_from_filename(p: str) -> str:
    stem = Path(p).stem  # "A01_output" 或 "base_A01"
    if stem.endswith("_output"):
        return stem[:-7]  # 去掉 "_output"
    if stem.startswith("base_"):
        return stem[5:]   # 去掉 "base_"
    return stem


# -----------------------------
# 主推論
# -----------------------------
def infer_area_by_kp(query_path: str, base_root: str, location: str) -> Optional[str]:
    """
    在 {base_root}/{location}_base_images 底下找最相似的區位（用 SIFT+ratio test）
    回傳：'A01' / 'B01' / None
    """
    base_dir = Path(base_root) / f"{location}_base_images"
    print(f"[infer] base_dir = {base_dir}")

    if not base_dir.exists():
        print(f"[infer] 找不到目錄：{base_dir}")
        return None

    candidates = _collect_candidates(base_dir)
    print(f"[infer] candidates = {len(candidates)}")

    if not candidates:
        print(f"[infer] {base_dir} 無候選底圖 (*_output.*, base_*.*)")
        return None

    # 查詢圖特徵
    q_img = _read_gray_resized(query_path)
    _, q_des = _compute_sift(q_img)

    best_score, best_area = -1.0, None
    for p in candidates:
        try:
            _, b_des = _load_or_compute_sift(p)
            sc = _score_pair(q_des, b_des)
            area = _area_from_filename(p)
            print(f"[infer] {area} score={sc}")
            if sc > best_score:
                best_score, best_area = sc, area
        except Exception as e:
            print(f"[infer] 比對失敗 {p}: {e}")

    print(f"[infer] best = {best_area} (score={best_score})")
    return best_area


# -----------------------------
# 舊名相容（保留函式名，實作用 SIFT）
# -----------------------------
def infer_location_clip(query_path: str,
                        base_root: Optional[str] = None,
                        location: Optional[str] = None,
                        **kwargs) -> Optional[str]:
    """
    建議呼叫法（新介面）：
        infer_location_clip(query, base_root, location)

    若只傳 processed_images_dir（舊介面），為避免掃過多檔案，這裡直接回 None。
    """
    if base_root and location:
        return infer_area_by_kp(query_path, base_root, location)

    # 舊介面不再支援，避免誤掃整個資料夾造成高負載
    print("[infer] 請以 infer_location_clip(query, base_root, location) 呼叫")
    return None


# 命令列測試（可選）
if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 4:
        q = sys.argv[1]
        root = sys.argv[2]
        loc = sys.argv[3]
        print("RESULT:", infer_location_clip(q, root, loc) or "")
    else:
        print("用法: python infer_location.py <query_path> <base_root> <location>")
