import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import type { ParkingSpot } from "@shared/schema";

const socket = io();

interface Props {
  onSpotClick?: (spot: ParkingSpot & { subSpots: SubSpot[] }) => void;
}

interface SubSpot {
  id: string;
  name: string;
  labelPosition: google.maps.LatLngLiteral;
  streetViewPosition: google.maps.LatLngLiteral;
}

export default function MapWithSpots({ onSpotClick }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scriptId = "gmaps-api";
    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script");
      s.id = scriptId;
      s.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;
      s.async = true;
      s.defer = true;
      document.body.appendChild(s);
      s.onload = initMap;
    } else {
      initMap();
    }
  }, []);

  const initMap = async () => {
  if (!(window as any).google || !mapRef.current) return;

  const g = (window as any).google;
  const center = { lat: 25.0135, lng: 121.542041 };
  const map = new g.maps.Map(mapRef.current, {
    center,
    zoom: 17,
    streetViewControl: true,
    mapTypeControl: false,
    scaleControl: true,
    zoomControl: true,
  });
  (window as any).dbgMap = map;   // ← 只在開發環境加

  console.log("✅ 地圖初始化完成");

  const res = await fetch("/api/parking-spots");
  const spots: ParkingSpot[] = await res.json();
  console.log("✅ 停車場資料載入:", spots);

  let isZoomed = false;
  let drawnRects: google.maps.Polygon[] = [];
  let labels: google.maps.Marker[] = [];
  let redPointMarkers: google.maps.Marker[] = [];

  const boxMappings = [
  {
    spotName: "基隆路四段73巷路邊停車格A",
    point: { lat: 25.011824, lng: 121.540574 },
    iconUrl: "https://cdn-icons-png.flaticon.com/512/608/608690.png",
    rects: [
      {
        name: "A01",
        coords: [
          { lat: 25.011927, lng: 121.540503 },
          { lat: 25.011957, lng: 121.540543 },
          { lat: 25.011899, lng: 121.540588 },
          { lat: 25.011869, lng: 121.540548 },
        ],
        label: { lat: 25.01196, lng: 121.54057 },
        pano: { lat: 25.01193, lng: 121.54055 },
      },
      {
        name: "A02",
        coords: [
          { lat: 25.011832, lng: 121.540578 },
          { lat: 25.011862, lng: 121.540618 },
          { lat: 25.011803, lng: 121.540663 },
          { lat: 25.011773, lng: 121.540622 },
        ],
        label: { lat: 25.011865, lng: 121.540655 },
        pano: { lat: 25.01183, lng: 121.54063 },
      },
      {
        name: "A03",
        coords: [
          { lat: 25.011743, lng: 121.540651 },
          { lat: 25.011773, lng: 121.540690 },
          { lat: 25.011713, lng: 121.540736 },
          { lat: 25.011683, lng: 121.540695 },
        ],
        label: { lat: 25.011775, lng: 121.54074 },
        pano: { lat: 25.01174, lng: 121.54071 },
      },
    ],
  },
  {
    spotName: "基隆路四段73巷路邊停車格F",
    point: { lat: 25.011992, lng: 121.540419 },
    iconUrl: "https://cdn-icons-png.flaticon.com/512/608/608690.png",
    rects: [
      {
        name: "F01",
        coords: [
          { lat: 25.012104, lng: 121.540322 },
          { lat: 25.012075, lng: 121.540277 },
          { lat: 25.012012, lng: 121.540327 },
          { lat: 25.012042, lng: 121.540371 },
        ],
        label: { lat: 25.012041, lng: 121.540270 },
        pano: { lat: 25.012063, lng: 121.540320 },
      },
      {
        name: "F02",
        coords: [
          { lat: 25.011986, lng: 121.540347 },
          { lat: 25.012016, lng: 121.540393 },
          { lat: 25.011953, lng: 121.540445 },
          { lat: 25.011922, lng: 121.540400 },
        ],
        label: { lat: 25.011942, lng: 121.540360 },
        pano: { lat: 25.011971, lng: 121.540393},
      },
      {
        name: "F03",
        coords: [
          { lat: 25.011892, lng: 121.540425 },
          { lat: 25.011921, lng: 121.540472 },
          { lat: 25.011859, lng: 121.540520 },
          { lat: 25.011829, lng: 121.540474 },
        ],
        label: { lat: 25.011852, lng: 121.540434 },
        pano: { lat: 25.011878, lng: 121.540470 },
      },
    ],
  },
  {
    spotName: "基隆路四段73巷路邊停車格G",     
    point: { lat: 25.011594, lng: 121.540730 }, // 你到時候給我正確的P點位置
    iconUrl: "https://cdn-icons-png.flaticon.com/512/608/608690.png",
    rects: [
      {
        name: "H01",
        coords: [
          { lat: 25.011622, lng: 121.540705 },
          { lat: 25.011561, lng: 121.540752 },
          { lat: 25.011531, lng: 121.540711 },
          { lat: 25.011592, lng: 121.540658 },
        ],
        label: { lat: 25.011547, lng: 121.540664 },
        pano: { lat: 25.011581, lng: 121.540704 },
      },
    ],
  },
  {
    spotName: "基隆路四段73巷路邊停車格H",     
    point: { lat: 25.011488, lng: 121.540855 }, // 你到時候給我正確的P點位置
    iconUrl: "https://cdn-icons-png.flaticon.com/512/608/608690.png",
    rects: [
      {
        name: "H01",
        coords: [
          { lat: 25.011594, lng: 121.540828 },
          { lat: 25.011536, lng: 121.540875 },
          { lat: 25.011507, lng: 121.540835 },
          { lat: 25.011568, lng: 121.540786 },
        ],
        label: { lat: 25.011580, lng: 121.540874 },
        pano: { lat: 25.011533, lng: 121.540837 },
      },
      {
        name: "H02",
        coords: [
          { lat: 25.011498, lng: 121.540900 },
          { lat: 25.011458, lng: 121.540933 },
          { lat: 25.011429, lng: 121.540893 },
          { lat: 25.011473, lng: 121.540860 },
        ],
        label: { lat: 25.011494, lng: 121.540938 },
        pano: { lat: 25.011468, lng: 121.540889 },
      },
    ],
  },
  
];

  for (const mapping of boxMappings) {
    const matchedSpot = spots.find((s) => s.name === mapping.spotName);

    // ✅ 一開始就畫 P 點 marker
    const marker = new g.maps.Marker({
      position: mapping.point,
      map,
      title: mapping.spotName,
      icon: {
        url: mapping.iconUrl,
        scaledSize: new g.maps.Size(36, 36),
      },
    });
    console.log(`🅿️ P 點 marker 建立: ${mapping.spotName}`);

    marker.addListener("click", async () => {
      if (!isZoomed) {
        console.log("🔍 Zoom in 中...");
        map.setZoom(21);
        map.setCenter(mapping.point);

        const subSpots: SubSpot[] = [];

        // 畫格子框與 label
        mapping.rects.forEach((box) => {
          const rect = new g.maps.Polygon({
            paths: box.coords,
            strokeColor: "#1E90FF",
            strokeOpacity: 0.9,
            strokeWeight: 3,
            fillColor: "#87CEFA",
            fillOpacity: 0.6,
            map,
          });
          drawnRects.push(rect);

          const label = new g.maps.Marker({
            position: box.label,
            map,
            label: {
              text: box.name,
              color: "white",
              fontSize: "14px",
              fontWeight: "bold",
            },
            icon: {
              path: g.maps.SymbolPath.CIRCLE,
              scale: 14,
              fillColor: "#1E90FF",
              fillOpacity: 1,
              strokeWeight: 0,
            },
          });
          labels.push(label);

          subSpots.push({
            id: box.name,
            name: box.name,
            labelPosition: box.label,
            streetViewPosition: box.pano,
          });
        });

        // 呼叫右側明細面板
        if (matchedSpot) {
          onSpotClick?.({
            ...matchedSpot,
            subSpots,
          });
        }

        // ✅ 此時才畫紅點
        try {
          const redRes   = await fetch("/api/red-points");
          const redPoints = await redRes.json();
          console.log("🔴 紅點資料筆數:", redPoints.length);

          for (const pt of redPoints) {
            const redMarker = new g.maps.Marker({
              // ⭐ 直接用經緯度欄位
              position: {
                lat: pt.lat,
                lng: pt.lng,
              },
              map,
              icon: {
                path: g.maps.SymbolPath.CIRCLE,
                scale: 7,               // 半徑 (px) ─ 依需求微調
                fillColor: "red",
                fillOpacity: 1,

                strokeColor: "white",   // 白色外框
                strokeOpacity: 0.8,
                strokeWeight: 2,        // 外框線寬 (px)；1~2 最適合
              },
              // label: {
              //   text: pt.plate_text || pt.motor_index?.toString() || "?",
              //   color: "black",
              //   fontSize: "12px",
              //   fontWeight: "bold",
              // },
              label: {
                text: pt.motor_index?.toString() ?? "",
                color: "white",
                fontSize: "12px",
                fontWeight: "bold",
              },
            });
            redPointMarkers.push(redMarker);
          }
        } catch (e) {
          console.warn("⚠️ 紅點載入失敗:", e);
        }

        isZoomed = true;
      } else {
        // zoom out 清除格子與紅點
        console.log("↩️ Zoom out 回原始地圖");
        map.setZoom(16);
        map.setCenter(center);

        drawnRects.forEach((r) => r.setMap(null));
        labels.forEach((l) => l.setMap(null));
        redPointMarkers.forEach((m) => m.setMap(null));

        drawnRects = [];
        labels = [];
        redPointMarkers = [];

        isZoomed = false;
      }
    });
  }
};

  return <div ref={mapRef} className="w-full h-full" />;
}