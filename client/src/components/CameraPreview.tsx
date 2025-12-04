import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Plus, Minus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import goodExample from "@/assets/good_example.jpg";
import badExample from "@/assets/bad_example.jpg";

// 新增：引入 ONNX 偵測器
import { createOnnxDetector } from "@/lib/onnxDetector";

export default function CameraPreview({
  onCapture,
}: {
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  // 第二層偵測框畫布 & 工作畫布
  const detCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 框的大小資訊
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0, centerY: 0 });

  // 水平角度 (gamma = 左右傾斜)
  const [roll, setRoll] = useState(0);

  // Zoom 狀態
  const [zoom, setZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(3);
  const minZoom = 1;
  const zoomStep = 0.2;
  const useHardwareZoom = useRef(false);
  const pinchRef = useRef<number | null>(null);

  // 範例 Dialog 狀態
  const [showGuide, setShowGuide] = useState(true);
  const [skipGuide, setSkipGuide] = useState(false);

  // 偵測器（只建一次）
  const detectorRef = useRef(
    createOnnxDetector({
      modelUrl: "/models/yolov8n.onnx",
      inputSize: 640,
      confThres: 0.7,
      normalize: true,
    })
  );

  // 啟動相機
  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }

      const track = streamRef.current.getVideoTracks()[0];
      trackRef.current = track;

      const caps = track.getCapabilities?.();
      if (caps && (caps as any).zoom) {
        const z = (caps as any).zoom;
        useHardwareZoom.current = true;
        setMaxZoom(z.max ?? 3);
        setZoom(z.min ?? 1);
      } else {
        useHardwareZoom.current = false;
        setMaxZoom(3);
        setZoom(1);
      }
    } catch (err) {
      console.error("相機開啟失敗:", err);
    }
  };

  const [dontShowThisLogin, setDontShowThisLogin] = useState(false);

  // 進來就看一次 Session 設定
  useEffect(() => {
    const skipped = sessionStorage.getItem("guide_skip_this_login") === "1";
    if (skipped) {
      setShowGuide(false);
    }
  }, []);

  useEffect(() => {
    startCamera();
    detectorRef.current.load().catch(console.warn);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (useHardwareZoom.current && trackRef.current) {
      trackRef.current
        .applyConstraints({ advanced: [{ zoom }] })
        .catch((err) => console.warn("Zoom applyConstraints failed:", err));
    }
  }, [zoom]);

  // 監聽裝置方向（夾值避免跳大數）
  useEffect(() => {
    const enableOrientation = async () => {
      if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof (DeviceOrientationEvent as any).requestPermission === "function"
      ) {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response !== "granted") {
          alert("請允許感測器存取，才能使用水平儀功能");
          return;
        }
      }

      let smooth = 0;
      const alpha = 0.1;
      let lastUpdate = 0;

      const handleOrientation = (event: DeviceOrientationEvent) => {
        if (event.gamma === null || event.beta === null) return;

        const now = Date.now();
        if (now - lastUpdate > 500) {
          lastUpdate = now;

          const isLandscape =
            window.screen.orientation?.type.startsWith("landscape") ||
            Math.abs((window as any).orientation as number) === 90;

          const raw = isLandscape ? event.beta! : event.gamma!;
          smooth = smooth + alpha * (raw - smooth);
          const val = Math.round(smooth);
          setRoll(Number.isFinite(val) ? Math.max(-89, Math.min(89, val)) : 0);
        }
      };

      window.addEventListener("deviceorientation", handleOrientation);
      return () =>
        window.removeEventListener("deviceorientation", handleOrientation);
    };

    enableOrientation();
  }, []);

  // 繪製虛線框（原本功能）
  useEffect(() => {
    const ctx = overlayRef.current?.getContext("2d");
    if (!ctx || !overlayRef.current) return;

    const draw = () => {
      if (!overlayRef.current || !videoRef.current || previewSrc) return;

      overlayRef.current.width = overlayRef.current.clientWidth;
      overlayRef.current.height = overlayRef.current.clientHeight;
      ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);

      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 8]);

      const fw = overlayRef.current.width * 0.8;
      const fh = overlayRef.current.height * 0.55;
      const fx = overlayRef.current.width * 0.1;
      const fy = overlayRef.current.height * 0.4;

      ctx.strokeRect(fx, fy, fw, fh);

      setFrameSize({
        width: fw,
        height: fh,
        centerY: fy + fh / 2,
      });

      requestAnimationFrame(draw);
    };
    draw();
  }, [previewSrc]);

  const handleCapture = () => {
    if (!videoRef.current) return;
    const w = videoRef.current.videoWidth;
    const h = videoRef.current.videoHeight;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!useHardwareZoom.current && zoom > 1) {
      const cropW = w / zoom;
      const cropH = h / zoom;
      const offsetX = (w - cropW) / 2;
      const offsetY = (h - cropH) / 2;
      ctx.drawImage(videoRef.current, offsetX, offsetY, cropW, cropH, 0, 0, w, h);
    } else {
      ctx.drawImage(videoRef.current, 0, 0, w, h);
    }

    setPreviewSrc(canvas.toDataURL("image/jpeg", 1.0));
  };

  const handleConfirm = () => {
    if (!previewSrc) return;
    const arr = previewSrc.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    const file = new File([u8arr], `capture-${Date.now()}.jpg`, { type: mime });
    onCapture(file);
    setPreviewSrc(null);
    startCamera();
  };

  const handleRetake = () => {
    setPreviewSrc(null);
    startCamera();
  };

  // 雙指縮放（原本功能）
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = Math.sqrt(dx * dx + dy * dy);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const newDist = Math.sqrt(dx * dx + dy * dy);
        const diff = newDist - pinchRef.current;
        if (Math.abs(diff) > 10) {
          setZoom((z) => {
            const next = Math.min(maxZoom, Math.max(minZoom, z + diff * 0.005));
            return next;
          });
          pinchRef.current = newDist;
        }
      }
    };

    const handleTouchEnd = () => {
      pinchRef.current = null;
    };

    video.addEventListener("touchstart", handleTouchStart, { passive: false });
    video.addEventListener("touchmove", handleTouchMove, { passive: false });
    video.addEventListener("touchend", handleTouchEnd);

    return () => {
      video.removeEventListener("touchstart", handleTouchStart);
      video.removeEventListener("touchmove", handleTouchMove);
      video.removeEventListener("touchend", handleTouchEnd);
    };
  }, [maxZoom]);

  // 即時偵測 + 畫框
  useEffect(() => {
    let raf = 0;
    let running = true;

    const loop = async () => {
      if (!running) return;
      const v = videoRef.current;
      const dc = detCanvasRef.current;
      if (!v || !dc || previewSrc) {
        raf = requestAnimationFrame(loop);
        return;
      }
      if (v.readyState < 2) {
        raf = requestAnimationFrame(loop);
        return;
      }

      // 擷取當前幀（若是軟體 zoom，做置中裁切再縮回）
      if (!workCanvasRef.current) workCanvasRef.current = document.createElement("canvas");
      const work = workCanvasRef.current;
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      work.width = vw;
      work.height = vh;
      const wctx = work.getContext("2d")!;
      if (!useHardwareZoom.current && zoom > 1) {
        const cropW = Math.round(vw / zoom);
        const cropH = Math.round(vh / zoom);
        const sx = Math.floor((vw - cropW) / 2);
        const sy = Math.floor((vh - cropH) / 2);
        wctx.drawImage(v, sx, sy, cropW, cropH, 0, 0, vw, vh);
      } else {
        wctx.drawImage(v, 0, 0, vw, vh);
      }
      const frame = wctx.getImageData(0, 0, vw, vh);

      // 推論（回傳原始相機座標系）
      const { boxes } = await detectorRef.current.detect(frame);

      // 對齊 detCanvas 實際像素（含 DPR）
      const dpr = window.devicePixelRatio || 1;
      const CW = dc.clientWidth;
      const CH = dc.clientHeight;
      if (dc.width !== Math.round(CW * dpr) || dc.height !== Math.round(CH * dpr)) {
        dc.width = Math.round(CW * dpr);
        dc.height = Math.round(CH * dpr);
      }
      const ctx = dc.getContext("2d")!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, dc.width, dc.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // === 用「實際渲染矩形」精準對齊（解決上下略差）===
      const rect = v.getBoundingClientRect();            // video 實際渲染框
      const parentRect = dc.getBoundingClientRect();     // 畫布所在容器框
      const visZoom = (!useHardwareZoom.current && zoom > 1) ? zoom : 1;

      // video 的可視寬高與在容器內的偏移
      const visW = rect.width;
      const visH = rect.height;
      const outerOffX = rect.left - parentRect.left;
      const outerOffY = rect.top  - parentRect.top;

      // object-cover 內容與 inner 偏移（再加上你的 zoom）
      const baseScale  = Math.max(visW / vw, visH / vh);
      const totalScale = baseScale * visZoom;
      const drawW = vw * totalScale;
      const drawH = vh * totalScale;
      const offX = outerOffX + (visW - drawW) / 2;
      const offY = outerOffY + (visH - drawH) / 2;

      // debug：紫框顯示可視內容（可留著）
      ctx.strokeStyle = "#ff00ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(offX, offY, drawW, drawH);
      ctx.strokeStyle = "#00ffff";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.font = `14px system-ui`;

      // 畫偵測框（raw 相機座標 → 螢幕座標）
      for (const b of boxes) {
        const sx = offX + b.x1 * totalScale;
        const sy = offY + b.y1 * totalScale;
        const sw = (b.x2 - b.x1) * totalScale;
        const sh = (b.y2 - b.y1) * totalScale;

        ctx.strokeRect(sx, sy, sw, sh);

        // ⬇ 如果你的 onnxDetector 還沒加 sigmoid，可先臨時夾值避免爆 %（不想改別檔的話）
        const safeConf = Math.max(0, Math.min(1, b.conf));
        const label = `${b.cls} ${(safeConf * 100).toFixed(0)}%`;

        const tw = ctx.measureText(label).width + 8;
        const th = 18;
        ctx.fillRect(sx, Math.max(0, sy - th), tw, th);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, sx + 4, Math.max(12, sy - 4));
        ctx.fillStyle = "rgba(0,0,0,0.6)";
      }
      raf = requestAnimationFrame(loop);
    };

    loop();
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [previewSrc, zoom]);

  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* 範例 Dialog */}
      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>拍照範例</DialogTitle>
          </DialogHeader>

          <div className="flex gap-4 items-start">
            <div className="flex-1">
              <img
                src={goodExample}
                alt="好的範例"
                className="rounded w-full h-auto max-w-[720px]"
              />
              <p className="text-green-600 font-bold text-center">合格範例 ✅</p>
              <p className="text-xs text-muted-foreground text-center mt-1">
                （保持水平、完整機車）
              </p>
            </div>

            <div className="flex-1">
              <img
                src={badExample}
                alt="壞的範例"
                className="rounded w-full h-auto max-w-[720px]"
                onError={(e) => {
                  console.error("badExample 載入失敗：請檢查路徑/副檔名/大小寫");
                  (e.currentTarget as HTMLImageElement).src = goodExample;
                }}
              />
              <p className="text-red-600 font-bold text-center">不合格範例 ❌</p>
              <p className="text-xs text-muted-foreground text-center mt-1">
                （歪斜、裁切、未拍攝機車）
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <Checkbox
              id="dont-show-this-login"
              checked={dontShowThisLogin}
              onCheckedChange={(v) => setDontShowThisLogin(!!v)}
            />
            <label htmlFor="dont-show-this-login" className="text-sm text-muted-foreground select-none cursor-pointer">
              此次登入不再提醒
            </label>
          </div>

          <Button
            className="mt-4 w-full"
            onClick={() => {
              setShowGuide(false);
              if (!skipGuide) setSkipGuide(true);
              if (dontShowThisLogin) sessionStorage.setItem("guide_skip_this_login", "1");
            }}
          >
            我了解了
          </Button>
        </DialogContent>
      </Dialog>

      {!previewSrc ? (
        <>
          <div className="relative overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full max-h-[70vh] bg-black rounded-lg object-cover touch-none"
              style={
                !useHardwareZoom.current
                  ? { transform: `scale(${zoom})`, transformOrigin: "center" }
                  : undefined
              }
            />

            {/* 摩托車輔助圖 */}
            <img
              src="/scooter.png"
              alt="構圖輔助"
              style={{
                width: `${Math.min(
                  frameSize.width * 1.2,
                  frameSize.height * 1.2
                )}px`,
                top: `${frameSize.centerY}px`,
                filter:
                  "invert(1) brightness(200%) contrast(200%) drop-shadow(0 0 5px black)",
              }}
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-90 pointer-events-none z-20"
            />

            {/* 虛線框（原本） */}
            <canvas
              ref={overlayRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
            />

            {/* 偵測框畫布（在最底層，以免遮到你的輔助圖） */}
            <canvas
              ref={detCanvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none z-0"
            />

            {/* 水平儀數字 + 提示 */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-center">
              <p
                className="text-2xl font-bold"
                style={{
                  color:
                    Math.abs(roll) <= 10
                      ? "lime"
                      : Math.abs(roll) <= 20
                      ? "orange"
                      : "red",
                }}
              >
                {roll}°
              </p>
              {Math.abs(roll) > 20 && (
                <p className="mt-1 text-sm font-semibold bg-black/60 px-2 py-1 rounded text-white">
                  請保持水平
                </p>
              )}
            </div>

            {/* 縮放按鈕 */}
            <div className="absolute bottom-3 right-3 flex gap-2">
              <Button
                type="button"
                size="icon"
                className="rounded-full bg-black/50 text-white hover:bg-black/70"
                onClick={() => setZoom((z) => Math.max(minZoom, z - zoomStep))}
              >
                <Minus className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                size="icon"
                className="rounded-full bg-black/50 text-white hover:bg-black/70"
                onClick={() => setZoom((z) => Math.min(maxZoom, z + zoomStep))}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="flex justify-center mt-2">
            <Button
              type="button"
              onClick={handleCapture}
              className="p-3 rounded-full bg-primary text-white hover:bg-primary/90"
            >
              <Camera className="h-6 w-6" />
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center">
            <img
              src={previewSrc}
              alt="預覽"
              className="w-auto max-w-full max-h-[70vh] object-contain rounded-lg"
            />
            <div className="flex justify中心 gap-4 mt-4">
              <Button variant="secondary" onClick={handleRetake}>
                重新拍攝
              </Button>
              <Button className="bg-primary text-white" onClick={handleConfirm}>
                使用此相片
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
