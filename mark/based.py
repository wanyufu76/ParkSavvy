import matplotlib.pyplot as plt
import matplotlib.image as mpimg
import numpy as np
import cv2
import os
from upload_base_config import upload_config  # ✅ 仍沿用你的上傳函式

def mark_image(photo_path, route_key=None, output_dir="base_config"):
    """
    標 4 點 → 存 base_image.jpg、H_base.npy、src_pts.npy → 呼叫 upload_config
    route_key:
      - 單張模式：如果沒給，會詢問一次
      - 批次模式：主程式會先問一次，再傳進來（這裡就不再詢問）
    """
    os.makedirs(output_dir, exist_ok=True)
    base_img_path = os.path.join(output_dir, "base_image.jpg")
    H_save_path = os.path.join(output_dir, "H_base.npy")
    src_pts_path = os.path.join(output_dir, "src_pts.npy")

    # ---------- 1) 顯示圖片並讓你點 4 點 ----------
    img = mpimg.imread(photo_path)
    fig, ax = plt.subplots()
    ax.imshow(img)
    ax.set_title("左鍵順時針標 4 點，右鍵刪除最後一點，Enter 完成")
    points = []
    order_text = ["左上", "右上", "右下", "左下"]

    def onclick(event):
        nonlocal points
        if event.xdata is None or event.ydata is None:
            return
        if event.button == 1 and len(points) < 4:
            points.append((event.xdata, event.ydata))
            ax.plot(event.xdata, event.ydata, 'ro')
            ax.text(event.xdata + 10, event.ydata - 10,
                    f"{len(points)}({order_text[len(points)-1]})",
                    color='red', fontsize=10)
            fig.canvas.draw()
        elif event.button == 3 and points:
            points.pop()
            ax.clear()
            ax.imshow(img)
            for idx, (px, py) in enumerate(points):
                ax.plot(px, py, 'ro')
                ax.text(px + 10, py - 10,
                        f"{idx+1}({order_text[idx]})",
                        color='red', fontsize=10)
            fig.canvas.draw()

    fig.canvas.mpl_connect('button_press_event', onclick)
    print(f"📌 標記：{os.path.basename(photo_path)}（左鍵標點 / 右鍵刪除 / Q 完成）")
    plt.show(block=True)

    if len(points) != 4:
        print("⚠️ 沒有標滿 4 點，跳過這張")
        return

    # ---------- 2) 算 Homography ----------
    src_pts = np.array(points, dtype=np.float32)
    dst_pts = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=np.float32)
    H, _ = cv2.findHomography(src_pts, dst_pts)
    H = H / H[2, 2]

    # ---------- 3) 存檔 ----------
    cv2.imwrite(base_img_path, cv2.cvtColor((img * 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
    np.save(H_save_path, H)
    np.save(src_pts_path, src_pts)
    print("✅ 已儲存 base_image.jpg、H_base.npy、src_pts.npy")

    # ---------- 4) 取得 route_key（若未提供）與 area_id ----------
    # 批次模式會把 route_key 傳進來，這裡就不會再問第二次
    if not route_key or not str(route_key).strip():
        route_key = input("請輸入本張圖的 route_key（例如：ib / ob / right ...）：").strip()

    area_id = input("請輸入此底圖的區域名稱（area_id，例如 A01 或 right）：").strip()

    # ---------- 5) 上傳 ----------
    # 盡量同時把 route_key 傳給 upload_config；如果你的 upload_config 只有一個參數，就自動退回只傳 area_id。
    try:
        upload_config(area_id, route_key)  # ✅ 推薦你把 upload_config 改成接受 (area_id, route_key)
    except TypeError:
        print("ℹ️ 偵測到 upload_config 目前只接受一個參數，先以舊版方式上傳（僅 area_id）。")
        upload_config(area_id)

    print(f"⬆️ 已上傳：area_id={area_id}, route_key={route_key}")


if __name__ == "__main__":
    path = input("請輸入單張圖片或資料夾路徑：").strip('"')

    if os.path.isfile(path):
        # ---------- 單張模式：問一次 route_key ----------
        rk = input("請輸入本張圖的 route_key（例如：ib / ob / right ...）：").strip()
        mark_image(path, route_key=rk)

    elif os.path.isdir(path):
        # ---------- 批次模式：整個資料夾共用一個 route_key（只問一次） ----------
        rk = input("請輸入本資料夾共用的 route_key（例如：ib / ob / right ...）：").strip()
        image_files = [f for f in os.listdir(path) if f.lower().endswith((".jpg", ".jpeg", ".png"))]
        if not image_files:
            print("⚠️ 資料夾中沒有可用的圖片")
        else:
            print(f"🔹 找到 {len(image_files)} 張圖片，將依序開啟標記並上傳（route_key='{rk}'）")
            for idx, filename in enumerate(sorted(image_files)):
                print(f"\n=== [{idx+1}/{len(image_files)}] 開始標記 {filename} ===")
                photo_path = os.path.join(path, filename)
                mark_image(photo_path, route_key=rk)
            print("\n🎉 批次標點與上傳完成！")
    else:
        print("❌ 輸入的路徑不存在，請確認後重新執行")