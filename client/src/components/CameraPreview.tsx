import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Plus, Minus } from "lucide-react";

export default function CameraPreview({ onCapture }: { onCapture: (file: File) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 縮放倍率
  const [zoom, setZoom] = useState(1);
  const maxZoom = 3;
  const minZoom = 1;
  const zoomStep = 0.2;

  // 手指縮放距離記錄
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

        // log 能力
        const track = streamRef.current.getVideoTracks()[0];
        console.log("📷 Camera Capabilities:", track.getCapabilities());
        console.log("⚙️ Camera Settings:", track.getSettings());
        console.log("🔒 Camera Constraints:", track.getConstraints());
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

  // 繪製虛線框
  useEffect(() => {
    const ctx = overlayRef.current?.getContext("2d");
    if (!ctx || !overlayRef.current) return;

    const draw = () => {
      if (!overlayRef.current || !videoRef.current || previewSrc) return;

      overlayRef.current.width = overlayRef.current.clientWidth;
      overlayRef.current.height = overlayRef.current.clientHeight;

      ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 10]);

      ctx.strokeRect(
        overlayRef.current.width * 0.1,
        overlayRef.current.height * 0.45, // 調整這裡可以上下移
        overlayRef.current.width * 0.8,
        overlayRef.current.height * 0.5
      );

      requestAnimationFrame(draw);
    };
    draw();
  }, [previewSrc]);

  // 拍照 + 裁切
  const handleCapture = () => {
    if (!videoRef.current) return;
    const w = videoRef.current.videoWidth;
    const h = videoRef.current.videoHeight;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (zoom > 1) {
      const cropW = w / zoom;
      const cropH = h / zoom;
      const offsetX = (w - cropW) / 2;
      const offsetY = (h - cropH) / 2;
      ctx.drawImage(videoRef.current, offsetX, offsetY, cropW, cropH, 0, 0, w, h);
    } else {
      ctx.drawImage(videoRef.current, 0, 0, w, h);
    }

    console.log(`📸 Captured image size: ${w}x${h}, zoom=${zoom}`);
    setPreviewSrc(canvas.toDataURL("image/jpeg", 1.0));
  };

  // 確認使用
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
        e.preventDefault(); // 防止瀏覽器縮放整頁
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const newDist = Math.sqrt(dx * dx + dy * dy);
        const diff = newDist - pinchRef.current;
        if (Math.abs(diff) > 10) {
          setZoom((z) => {
            const newZoom = Math.min(maxZoom, Math.max(minZoom, z + diff * 0.005));
            console.log("🔍 Pinch Zoom:", newZoom);
            return newZoom;
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
  }, []);

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
              style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
            />
            <canvas
              ref={overlayRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
            />
            {/* 縮放按鈕 */}
            <div className="absolute bottom-3 right-3 flex gap-2">
              <Button
                type="button"
                size="icon"
                className="rounded-full bg-black/50 text-white hover:bg-black/70"
                onClick={() =>
                  setZoom((z) => {
                    const newZoom = Math.max(minZoom, z - zoomStep);
                    console.log("➖ Button Zoom:", newZoom);
                    return newZoom;
                  })
                }
              >
                <Minus className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                size="icon"
                className="rounded-full bg-black/50 text-white hover:bg-black/70"
                onClick={() =>
                  setZoom((z) => {
                    const newZoom = Math.min(maxZoom, z + zoomStep);
                    console.log("➕ Button Zoom:", newZoom);
                    return newZoom;
                  })
                }
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
