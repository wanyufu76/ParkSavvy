import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, MapPin, Car, Navigation as NavigationIcon } from "lucide-react";
import type { ParkingSpot } from "@shared/schema";

interface FilterOptions {
  distanceRange: number[];
  priceRange: number[];
  sortBy: string;
}

interface ParkingSpotListProps {
  parkingSpots: ParkingSpot[];
  filters: FilterOptions;
  onSpotClick?: (spot: ParkingSpot) => void;
}

export default function ParkingSpotList({
  parkingSpots,
  filters,
  onSpotClick,
}: ParkingSpotListProps) {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  const addFavoriteMutation = useMutation({
    mutationFn: async (parkingSpotId: number) => {
      const res = await apiRequest("POST", "/api/favorites", { parkingSpotId });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "加入最愛失敗");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/favorites"] });
      toast({ title: "已加入最愛", description: "已成功加入我的最愛" });
    },
    onError: (error: any) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "需要登入",
          description: "請先登入以使用此功能",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 1000);
        return;
      }

      // ✅ 這裡改成固定訊息
      if (error.message?.includes("已經收藏過該停車位")) {
        toast({
          title: "收藏失敗",
          description: "此停車位已經在我的最愛中",
        });
      } else {
        toast({
          title: "加入失敗",
          description: "請稍後再試",
          variant: "destructive",
        });
      }
    },
  });

  const calculateDistance = (spot: ParkingSpot) => {
    const lat1 = 25.0133,
      lng1 = 121.5406;
    const lat2 = parseFloat(spot.latitude),
      lng2 = parseFloat(spot.longitude);
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  };

  // ✅ 只保留「距離 + 價格」篩選
  const filteredAndSortedSpots = useMemo(() => {
    return parkingSpots
      .filter((spot) => {
        const distance = calculateDistance(spot);
        const price = spot.pricePerHour ?? 30;

        if (distance > filters.distanceRange[1]) return false;
        if (price < filters.priceRange[0] || price > filters.priceRange[1])
          return false;

        return true;
      })
      .sort((a, b) => {
        if (filters.sortBy === "distance")
          return calculateDistance(a) - calculateDistance(b);
        if (filters.sortBy === "recent") return b.id - a.id;
        return 0;
      });
  }, [parkingSpots, filters]);

  const handleNavigation = (spot: ParkingSpot) => {
    const lat = parseFloat(spot.latitude),
      lng = parseFloat(spot.longitude);
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
      "_blank"
    );
  };

  const handleAddToFavorites = (spot: ParkingSpot) => {
    if (!isAuthenticated) {
      toast({
        title: "需要登入",
        description: "請先登入使用此功能",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 1000);
      return;
    }
    addFavoriteMutation.mutate(spot.id);
  };

  if (filteredAndSortedSpots.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Car className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          找不到符合條件的停車位
        </h3>
        <p className="text-gray-600">請調整篩選條件或搜尋範圍</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">
          找到 {filteredAndSortedSpots.length} 個停車位
        </h3>
        <Badge variant="secondary">
          {filters.sortBy === "distance" && "按距離排序"}
          {filters.sortBy === "recent" && "按新增時間排序"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredAndSortedSpots.map((spot) => {
          const distance = calculateDistance(spot);
          const price = spot.pricePerHour ?? 30;

          return (
            <Card
              key={spot.id}
              className="hover:shadow-md transition-shadow duration-200 cursor-pointer"
            >
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h4 className="font-semibold text-lg text-gray-900 mb-1">
                      {spot.name}
                    </h4>
                    <div className="flex items-center text-gray-600 text-sm mb-2">
                      <MapPin className="h-3 w-3 mr-1" />
                      {spot.address}
                    </div>
                    <div className="text-sm text-gray-600">
                      距離：約 {distance} 公尺
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddToFavorites(spot);
                    }}
                    disabled={addFavoriteMutation.isPending}
                  >
                    <Heart className="h-4 w-4" />
                  </Button>
                </div>

                <div className="text-sm mb-4">
                  <div className="text-gray-500">費率</div>
                  <div className="font-semibold text-gray-900">
                    NT${price} / 小時
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNavigation(spot);
                    }}
                  >
                    <NavigationIcon className="h-3 w-3 mr-1" />
                    導航
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSpotClick?.(spot);
                    }}
                  >
                    查看詳情
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
