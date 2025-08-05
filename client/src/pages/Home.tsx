import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

import MapWithSpots from "@/components/MapWithSpots";
import SpotDetailDrawer from "@/components/SpotDetailDrawer";
import ParkingFilters from "@/components/ParkingFilters";
import ParkingSpotList from "@/components/ParkingSpotList";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { RefreshCw, Map, List } from "lucide-react";
import type { ParkingSpot } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export default function Home() {
  const { toast } = useToast();
  const {
    data: parkingSpots = [],
    isLoading,
    refetch,
  } = useQuery<ParkingSpot[]>({
    queryKey: ["/api/parking-spots"],
  });

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const loginOK = p.get("login") === "success";
    const err = p.get("error");

    if (loginOK) {
      toast({ title: "登入成功", description: "歡迎使用智慧停車！" });
    } else if (err) {
      const dict: Record<string, string> = {
        login_failed: "登入失敗，請重試",
        token_failed: "驗證失敗，請重新登入",
        missing_code: "授權碼遺失，請重新登入",
      };
      toast({
        title: "登入失敗",
        description: dict[err] ?? `登入錯誤：${err}`,
        variant: "destructive",
      });
    }
    if (loginOK || err) history.replaceState({}, "", "/");
  }, [toast]);

  const [activeTab, setActiveTab] = useState<"map" | "list">("map");
  const [selectedSpot, setSelectedSpot] = useState<(ParkingSpot & { subSpots?: any[] }) | null>(null);
  const [filters, setFilters] = useState({
  searchTerm: "",
  distanceRange: [0, 99999999],
  priceRange: [10, 9999999],
  sortBy: "distance",
});

  const handleClearFilters = () =>
    setFilters({
      searchTerm: "",
      distanceRange: [0, 5000],
      priceRange: [10, 200],
      sortBy: "distance",
    });

  const handleSpotClick = (s: ParkingSpot) => {
    setSelectedSpot(s);
    setActiveTab("map");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <section className="bg-gradient-to-r from-primary to-secondary text-white py-12 text-center">
        <h2 className="text-4xl font-bold mb-3">智慧停車位檢測系統</h2>
        <p className="text-lg text-cyan-100 mb-6">
          透過 AI 即時掌握台科大周邊停車位狀況
        </p>
      </section>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <ParkingFilters
          filters={filters}
          onFiltersChange={setFilters}
          onClearFilters={handleClearFilters}
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <div className="flex justify-between items-center mb-4">
            <TabsList className="grid w-[240px] grid-cols-2">
              <TabsTrigger value="map" className="flex items-center gap-1">
                <Map className="h-4 w-4" /> 地圖
              </TabsTrigger>
              <TabsTrigger value="list" className="flex items-center gap-1">
                <List className="h-4 w-4" /> 列表
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-4 text-sm text-gray-700">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw
                  className={`h-3 w-3 mr-1 ${isLoading ? "animate-spin" : ""}`}
                />
                更新
              </Button>
            </div>
          </div>

          <TabsContent value="map">
            <div className="relative h-[70vh] rounded-lg overflow-hidden">
              <MapWithSpots onSpotClick={handleSpotClick} />
              <div className="absolute top-0 right-0 z-50">
                <SpotDetailDrawer
                  spot={selectedSpot}
                  onClose={() => setSelectedSpot(null)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="list">
            <ParkingSpotList
              parkingSpots={parkingSpots}
              filters={filters}
              onSpotClick={handleSpotClick}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
