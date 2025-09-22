import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Plus, Minus } from "lucide-react";

export default function CameraPreview({ onCapture }: { onCapture: (file: File) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  // 框的大小資訊
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0, centerY: 0 });

  // 水平角度 (gamma = 左右傾斜)
  const [roll, setRoll] = useState(0);

  // ====== Zoom 狀態（雙模式）======
  const [zoom, setZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(3);
  const minZoom = 1;
  const zoomStep = 0.2;
  const useHardwareZoom = useRef(false);
  const pinchRef = useRef<number | null>(null);

  // 啟動相機
  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
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

  useEffect(() => {
    startCamera();
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

  // 監聽裝置方向
  useEffect(() => {
    const enableOrientation = async () => {
      if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof (DeviceOrientationEvent as any).requestPermission === "function"
      ) {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response !== "granted") {
          console.warn("未允許裝置方向存取，水平儀將無法使用");
          return;
        }
      }

      let smooth = 0;
      const alpha = 0.1;
      let lastUpdate = 0;

      const handleOrientation = (event: DeviceOrientationEvent) => {
        if (event.gamma !== null) {
          const now = Date.now();
          if (now - lastUpdate > 300) {
            lastUpdate = now;
            smooth = smooth + alpha * (event.gamma - smooth);
            const rounded5 = Math.round(smooth / 5) * 5;
            setRoll(rounded5);
          }
        }
      };

      window.addEventListener("deviceorientation", handleOrientation);
      return () => window.removeEventListener("deviceorientation", handleOrientation);
    };

    enableOrientation();
  }, []);

  // 繪製虛線框
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
      const fh = overlayRef.current.height * 0.5;
      const fx = overlayRef.current.width * 0.1;
      const fy = overlayRef.current.height * 0.45;

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

  // 雙指縮放
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

  return (
    <div className="relative w-full max-w-md mx-auto">
      {!previewSrc ? (
        <>
          <div className="relative overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-auto bg-black rounded-lg object-cover touch-none"
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
                width: `${Math.min(frameSize.width * 0.99, frameSize.height * 0.99)}px`,
                top: `${frameSize.centerY}px`,
                filter:
                  "invert(1) brightness(200%) contrast(200%) drop-shadow(0 0 5px black)",
              }}
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-90 pointer-events-none z-20"
            />

            {/* 虛線框 */}
            <canvas
              ref={overlayRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
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
                <p className="mt-1 text-sm text-red-500 font-semibold bg-black/60 px-2 py-1 rounded">
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
          <img src={previewSrc} alt="預覽" className="w-full rounded-lg" />
          <div className="flex justify-center gap-4 mt-2">
            <Button variant="secondary" onClick={handleRetake}>
              重新拍攝
            </Button>
            <Button className="bg-primary text-white" onClick={handleConfirm}>
              使用此相片
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
