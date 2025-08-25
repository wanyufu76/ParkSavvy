import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Navigation as NavigationIcon, X } from "lucide-react";
import type { ParkingSpot } from "@shared/schema";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Props {
  spot: ParkingSpot | null;
  onClose: () => void;
}

export default function SpotDetailDrawer({ spot, onClose }: Props) {
  const queryClient = useQueryClient();
  const [uploadedSpots, setUploadedSpots] = useState<string[]>([]);

  // 撈子車格資料
  const { data: subSpots = [] } = useQuery({
    queryKey: ["/api/parking-sub-spots", spot?.id],
    queryFn: async () => {
      if (!spot) return [];
      const res = await fetch(`/api/parking-sub-spots?spotId=${spot.id}`);
      if (!res.ok) throw new Error("無法載入子停車格");
      return res.json();
    },
    enabled: !!spot,
  });

  useEffect(() => {
    fetch("/api/uploads")
      .then((res) => res.json())
      .then((data) => {
        const uploaded = data.map((item: any) => item.location);
        setUploadedSpots(uploaded);
      })
      .catch(() => {
        setUploadedSpots([]);
      });
  }, []);

  const handlePointUsage = async (action: "navigation" | "streetview") => {
    try {
      const res = await fetch("/api/points/use", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) return false;
      const data = await res.json();
      if (data.success === true) {
        queryClient.invalidateQueries({ queryKey: ["/api/points"] });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  if (!spot) return null;

  const lat = parseFloat(spot.latitude);
  const lng = parseFloat(spot.longitude);

  const handleOpenImage = async (id: string, location: string) => {
    const processedUrl = `/processed_images/${id}_output.jpg`;
    const baseUrl = `/base_images/base_${id}.jpg`;

    try {
      const res = await fetch(processedUrl, { method: "HEAD" });
      if (res.ok) {
        window.open(processedUrl, "_blank");
        return;
      }
    } catch {
      // ignore
    }

    const useProcessed = uploadedSpots.includes(location);
    const imageUrl = useProcessed ? processedUrl : baseUrl;
    window.open(imageUrl, "_blank");
  };

   // 區域對照表（小寫對應資料夾）
  const routeMapping: Record<string, string> = {
    "基隆路四段73巷": "ib",
    "基隆路三段155巷": "tr",
    "羅斯福路四段113巷": "police",
    "萊爾富側邊": "hilife",
    "公館國小側邊": "gges",
  };

  // 判斷 spotName 對應的區域
  function getRegionFromSpotName(spotName: string): string {
    if (!spotName) return "";

    // 嘗試精確比對 key
    const prefix = Object.keys(routeMapping).find((key) =>
      spotName.includes(key)   // 用 includes 而不是 startsWith，比較寬鬆
    );

    if (prefix) {
      return routeMapping[prefix];
    }

    // fallback：用數字判斷，避免 key 不完全對上
    if (spotName.includes("73")) return "ib";
    if (spotName.includes("155")) return "tr";
    if (spotName.includes("113")) return "police";
    if (spotName.includes("萊爾富")) return "hilife";
    if (spotName.includes("公館國小")) return "gges";

    console.warn("⚠️ 無法判斷區域，spotName =", spotName);
    return "";
  }

  return (
    <div
      className="
        fixed z-50 bg-white shadow-lg border
        right-2 top-4
        w-[320px] max-h-[56vh] rounded-lg
        overflow-y-auto
        sm:top-20 sm:right-4 sm:w-[400px] sm:max-h-[70vh]
      "
    >
      {/* Header */}
      <div className="flex justify-between items-start sticky top-0 bg-white p-4 z-10">
        <h3 className="text-lg font-semibold">{spot.name}</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Body */}
      <div className="px-4 pb-4 flex flex-col gap-2">
        <p className="text-sm text-muted-foreground truncate">{spot.address}</p>

        {/* 價格 + 導航（並列於同一行） */}
        <div className="flex items-center justify-between gap-3 mt-1">
          <p className="text-sm">NT$ {spot.pricePerHour || 20} / 小時</p>

          <Button
            className="px-3 py-1 text-sm w-auto"
            onClick={async () => {
              const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
              const newWin = window.open(url, "_blank");
              const ok = await handlePointUsage("navigation");
              if (!ok && newWin) {
                try {
                  newWin.close();
                } catch {}
                alert("積分不足，無法使用導航功能");
              }
            }}
          >
            <NavigationIcon className="h-4 w-4 mr-1" />
            導航
          </Button>
        </div>

        {/* 街景按鈕群：手機小按鈕橫向滾動，桌機維持縱向 full-width（透過 sm:class） */}
        <div className="mt-3">
          <div className="flex gap-2 overflow-x-auto sm:flex-col sm:overflow-x-visible">
            {subSpots.map((ps: any) => (
              <Button
                key={ps.id}
                variant="outline"
                className="px-2 py-1 text-xs w-auto flex-shrink-0 sm:w-full"
                onClick={async () => {
                  // 先 open 再檢查：保持既有行為（不改導向邏輯）
                  const region = getRegionFromSpotName(spot.name);
                  const url = `/processed_images/${region}/${ps.label}_output.jpg`;
                  const newWin = window.open(url, "_blank");
                  const ok = await handlePointUsage("streetview");
                  if (!ok && newWin) {
                    try {
                      newWin.close();
                    } catch {}
                    alert("積分不足，無法查看街景");
                    return;
                  }
                  // 若有足夠積分，newWin 會顯示該 url（或瀏覽器會顯示 404，如果檔案不存在會在 server 判斷）
                }}
              >
                街景：{ps.label}
              </Button>
            ))}

            {subSpots.length === 0 && (
              <p className="text-sm text-muted-foreground text-center w-full">
                無子停車格資料
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
