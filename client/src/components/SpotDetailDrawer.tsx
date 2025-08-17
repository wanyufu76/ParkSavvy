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

  // ✅ 撈子車格資料
const { data: subSpots = [] } = useQuery({
  queryKey: ["/api/parking-sub-spots", spot?.id],
  queryFn: async () => {
    if (!spot) return [];
    const res = await fetch(`/api/parking-sub-spots?spotId=${spot.id}`);
    if (!res.ok) throw new Error("無法載入子停車格");
    return res.json();
  },
  enabled: !!spot, // spot 存在時才查詢
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

      if (!res.ok) return false; // 積分不足或其他錯誤
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

    // 新增：先檢查 processed_images 是否有檔案
    // 8/11新加（processed都先備份好了，base_images基本作廢)
    try {
      const res = await fetch(processedUrl, { method: "HEAD" });
      if (res.ok) {
        window.open(processedUrl, "_blank");
        return;
      }
    } catch {
      // 忽略錯誤，走原本的判斷
    }
    
    const useProcessed = uploadedSpots.includes(location);
    const imageUrl = useProcessed ? processedUrl : baseUrl;
    window.open(imageUrl, "_blank");
  };

  return (
    <div
      className="
        fixed bg-white shadow-lg border rounded-lg z-50 p-5 space-y-4
        overflow-y-auto max-h-[70vh]
        top-20 right-4
        w-[85%] max-w-sm
        md:w-[400px]
      "
    >
      <div className="flex justify-between items-start">
        <h3 className="text-lg font-semibold">{spot.name}</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">{spot.address}</p>
      <p>NT$ {spot.pricePerHour || 20} / 小時</p>

      {/* 導航按鈕（主停車場） */}
      <div className="grid gap-2">
        <Button
          className="w-full"
          onClick={async () => {
            // 先向後端請求扣點
            const ok = await handlePointUsage("navigation");

            // 如果扣點成功才開導航
            if (ok) {
              window.open(
                `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
                "_blank"
              );
            } else {
              alert("積分不足，無法使用導航功能");
            }
          }}
        >
          <NavigationIcon className="h-4 w-4 mr-1" />
          導航
        </Button>
      </div>

      <div className="mt-4 space-y-2">
      {subSpots.map((ps: any) => (
        <Button
          key={ps.id}
          variant="outline"
          className="w-full"
          onClick={async () => {
            const ok = await handlePointUsage("streetview");
            if (ok) {
              handleOpenImage(ps.label, ps.label); // ps.label 就是 A01, B02...
            } else {
              alert("積分不足，無法查看街景");
            }
          }}
        >
          查看街景：{ps.label}
        </Button>
      ))}
      {subSpots.length === 0 && (
        <p className="text-sm text-muted-foreground text-center">
          無子停車格資料
        </p>
      )}
    </div>
        </div>
  );
}
