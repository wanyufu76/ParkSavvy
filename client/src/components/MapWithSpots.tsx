import { useEffect, useRef ,useState} from "react";
import { io } from "socket.io-client";
import type { ParkingSpot } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAvailabilityMap, pickGroupMarkerMetaWithHalfRule, deriveGroupMapFromBoxMappings, getGroupKeyForMapping, buildGroupAvailabilityWithMapping, } from "../../../server/availability";
const socket = io();
import { smoothZoomSteps } from "@/lib/smoothZoom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  const [showInsufficientPointsDialog, setShowInsufficientPointsDialog] = useState(false);
  const [insufficientMessage, setInsufficientMessage] = useState("❌ 積分不足，請上傳影像來獲得積分。");

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
    gestureHandling: "greedy", // 單指拖曳
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
      iconUrl:"", //"https://cdn-icons-png.flaticon.com/512/608/608690.png",
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
      spotName: "基隆路四段73巷路邊停車格B",
      point: { lat: 25.012143, lng: 121.540345 },
      iconUrl:"",// "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "B01",
          coords: [
            { lat: 25.012332, lng: 121.540246 },
            { lat: 25.012273, lng: 121.540296 },
            { lat: 25.012243, lng: 121.540254 },
            { lat: 25.012303, lng: 121.540204 },
          ],
          label: { lat: 25.012310, lng: 121.540291 },
          pano: { lat: 25.012287, lng: 121.540247 },
        },
        {
          name: "B02",
          coords: [
            { lat: 25.012252, lng: 121.540317 },
            { lat: 25.012190, lng: 121.540368 },
            { lat: 25.012159, lng: 121.540322 },
            { lat: 25.012222, lng: 121.540272 },
          ],
          label: { lat: 25.012229, lng: 121.540358 },
          pano: { lat: 25.012204, lng: 121.540321 },
        },
        {
          name: "B03",
          coords: [
            { lat: 25.012165, lng: 121.540382 },
            { lat: 25.012102, lng: 121.540438 },
            { lat: 25.012072, lng: 121.540392 },
            { lat: 25.012136, lng: 121.540340 },
          ],
          label: { lat: 25.012126, lng: 121.540439 },
          pano: { lat: 25.012100, lng: 121.540394 },
        },
        {
          name: "B04",
          coords: [
            { lat: 25.012079, lng: 121.540458 },
            { lat: 25.012016, lng: 121.540511 },
            { lat: 25.011983, lng: 121.540461 },
            { lat: 25.012046, lng: 121.540411 },
          ],
          label: { lat: 25.012048, lng: 121.540507 },
          pano: { lat: 25.012019, lng: 121.540407 },
        },
      ],
    },
    {
      spotName: "基隆路四段73巷路邊停車格C",
      point: { lat: 25.012775, lng: 121.539811 },
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "C01",
          coords: [
            { lat: 25.012921, lng: 121.539757 },
            { lat: 25.012858, lng: 121.539813 },
            { lat: 25.012829, lng: 121.539772 },
            { lat: 25.012893, lng: 121.539718 },
          ],
          label: { lat: 25.012900, lng: 121.539800 },
          pano: { lat: 25.012874, lng: 121.539762 },
        },
        {
          name: "C02",
          coords: [
            { lat: 25.012836, lng: 121.539832 },
            { lat: 25.012773, lng: 121.539887 },
            { lat: 25.012743, lng: 121.539843 },
            { lat: 25.012807, lng: 121.539788 },
          ],
          label: { lat: 25.012816, lng: 121.539872 },
          pano: { lat: 25.012788, lng: 121.539835 },
        },
        {
          name: "C03",
          coords: [
            { lat: 25.012750, lng: 121.539905 },
            { lat: 25.012686, lng: 121.539959 },
            { lat: 25.012655, lng: 121.539913 },
            { lat: 25.012720, lng: 121.539859 },
          ],
          label: { lat: 25.012729, lng: 121.539947 },
          pano: { lat: 25.012704, lng: 121.539905 },
        },
      ],
    },
    {
      spotName: "基隆路四段73巷路邊停車格D",
      point: { lat: 25.012847, lng: 121.539682 },
      iconUrl:"",// "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "D01",
          coords: [
            { lat: 25.012823, lng: 121.539662 },
            { lat: 25.012714, lng: 121.539748 },
            { lat: 25.012745, lng: 121.539795 },
            { lat: 25.012853, lng: 121.539707 },
          ],
          label: { lat: 25.012751, lng: 121.539694 },
          pano: { lat: 25.012777, lng: 121.539733 },
        },
      ],
    },
    {
      spotName: "基隆路四段73巷路邊停車格E",
      point: { lat: 25.012450, lng: 121.540043 },
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "E01",
          coords: [
            { lat: 25.012568, lng: 121.539871 },
            { lat: 25.012599, lng: 121.539917 },
            { lat: 25.012505, lng: 121.539993 },
            { lat: 25.012475, lng: 121.539947 },
          ],
          label: { lat: 25.012513, lng: 121.539892 },
          pano: { lat: 25.012534, lng: 121.539931 },
        },
        {
          name: "E02",
          coords: [
            { lat: 25.012453, lng: 121.539968 },
            { lat: 25.012483, lng: 121.540010 },
            { lat: 25.012418, lng: 121.540062 },
            { lat: 25.012388, lng: 121.540018 },
          ],
          label: { lat: 25.012411, lng: 121.539981 },
          pano: { lat: 25.012438, lng: 121.540014 },
        },
        {
          name: "E03",
          coords: [
            { lat: 25.012369, lng: 121.540036 },
            { lat: 25.012398, lng: 121.540080 },
            { lat: 25.012333, lng: 121.540136 },
            { lat: 25.012302, lng: 121.540092 },
          ],
          label: { lat: 25.012324, lng: 121.540049 },
          pano: { lat: 25.012348, lng: 121.540087 },
        },
      ],
    },
    {
      spotName: "基隆路四段73巷路邊停車格F",
      point: { lat: 25.011992, lng: 121.540419 },
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
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
      point: { lat: 25.011594, lng: 121.540730 }, 
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "G01",
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
      point: { lat: 25.011488, lng: 121.540855 }, 
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
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

    {
      spotName: "基隆路三段155巷路邊停車格A",     
      point: { lat: 25.015380, lng: 121.542840 }, 
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "A01",
          coords: [
            { lat: 25.015481, lng: 121.542766 },
            { lat: 25.015422, lng: 121.542811 },
            { lat: 25.015395, lng: 121.542772 },
            { lat: 25.015454, lng: 121.542727 },
          ],
          label: { lat: 25.015418, lng: 121.542729 },
          pano:  { lat: 25.015452, lng: 121.542789 },
        },
        {
          name: "A02",
          coords: [
            { lat: 25.015404, lng: 121.542825 },
            { lat: 25.015345, lng: 121.542870 },
            { lat: 25.015318, lng: 121.542831 },
            { lat: 25.015377, lng: 121.542786 },
          ],
          label: { lat: 25.015341, lng: 121.542788 },
          pano:  { lat: 25.015375, lng: 121.542848 },
        },
        {
          name: "A03",
          coords: [
            { lat: 25.015325, lng: 121.542887 },
            { lat: 25.015266, lng: 121.542932 },
            { lat: 25.015237, lng: 121.542893 },
            { lat: 25.015298, lng: 121.542848 },
          ],
          label: { lat: 25.015262, lng: 121.542850 },
          pano:  { lat: 25.015296, lng: 121.542910 },
        },
      ],
    },
    {
      spotName: "基隆路三段155巷路邊停車格B",     
      point: { lat: 25.015180, lng: 121.542990 }, 
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "B01",
          coords: [
            { lat: 25.015261, lng: 121.542936 },
            { lat: 25.015205, lng: 121.542980 }, 
            { lat: 25.015182, lng: 121.542942 }, 
            { lat: 25.015238, lng: 121.542900 },
          ],
          label: { lat: 25.015200, lng: 121.542900 },
          pano:  { lat: 25.015230, lng: 121.542960 }
        },
        {
          name: "B02",
          coords: [
            { lat: 25.015183, lng: 121.542996 }, 
            { lat: 25.015127, lng: 121.543040 }, 
            { lat: 25.015104, lng: 121.543004 }, 
            { lat: 25.015161, lng: 121.542959 },
          ],
          label: { lat: 25.015123, lng: 121.542959 },
          pano:  { lat: 25.015153, lng: 121.543020 },
        },
      ],
    },

    {
      spotName: "基隆路三段155巷路邊停車格C",     
      point: { lat: 25.015050, lng: 121.543100 }, 
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "C01",
          coords: [
            { lat: 25.015104, lng: 121.543061 }, 
            { lat: 25.015058, lng: 121.543095 }, 
            { lat: 25.015032, lng: 121.543055 }, 
            { lat: 25.015078, lng: 121.543021 },
          ],
          label: { lat: 25.015050, lng: 121.543020 },
          pano:  { lat: 25.015085, lng: 121.543080 },
        },
        {
          name: "C02",
          coords: [
            { lat: 25.015047, lng: 121.543107 },
            { lat: 25.015001, lng: 121.543141 },
            { lat: 25.014975, lng: 121.543101 },
            { lat: 25.015021, lng: 121.543067 },
          ],
          label: { lat: 25.014990, lng: 121.543070 },
          pano:  { lat: 25.015025, lng: 121.543130 },
        },
      ],
    },

    {
      spotName: "基隆路三段155巷路邊停車格D",     
      point: { lat: 25.014852, lng: 121.543311 }, 
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "D01",
          coords: [
            { lat: 25.014943, lng: 121.543242 },
            { lat: 25.014890, lng: 121.543285 }, 
            { lat: 25.014917, lng: 121.543324 }, 
            { lat: 25.014972, lng: 121.543281 },
          ],
          label: { lat: 25.014956, lng: 121.543320 },
          pano:  { lat: 25.014861, lng: 121.543308 },
        },
        {
          name: "D02",
          coords: [
            { lat: 25.014890, lng: 121.543285 },
            { lat: 25.014834, lng: 121.543332 }, 
            { lat: 25.014861, lng: 121.543369 }, 
            { lat: 25.014917, lng: 121.543324 },
          ],
          label: { lat: 25.014900, lng: 121.543368 },
          pano:  { lat: 25.014861, lng: 121.543308 },
        },
        {
          name: "D03",
          coords: [
            { lat: 25.014834, lng: 121.543332 },
            { lat: 25.014780, lng: 121.543374 }, 
            { lat: 25.014809, lng: 121.543413 }, 
            { lat: 25.014861, lng: 121.543369 },
          ],
          label: { lat: 25.014850, lng: 121.543409 },
          pano:  { lat: 25.014861, lng: 121.543308 },
        },
      ],
    },

    {
      spotName: "基隆路三段155巷路邊停車格E",     
      point: { lat: 25.014495, lng: 121.543545 }, 
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "E01",
          coords: [
            { lat: 25.014596, lng: 121.543468 },
            { lat: 25.014538, lng: 121.543517 },
            { lat: 25.014509, lng: 121.543475 },
            { lat: 25.014569, lng: 121.543426 },
          ],
          label: { lat: 25.014530, lng: 121.543435 },
          pano:  { lat: 25.014560, lng: 121.543495 },
        },
        {
          name: "E02",
          coords: [
            { lat: 25.014522, lng: 121.543530 },
            { lat: 25.014464, lng: 121.543579 },
            { lat: 25.014435, lng: 121.543537 },
            { lat: 25.014493, lng: 121.543488 },
          ],
          label: { lat: 25.014458, lng: 121.543495 },
          pano:  { lat: 25.014488, lng: 121.543555 },
        },
        {
          name: "E03",
          coords: [
            { lat: 25.014450, lng: 121.543591 },
            { lat: 25.014402, lng: 121.543631 },
            { lat: 25.014373, lng: 121.543589 },
            { lat: 25.014421, lng: 121.543549 },
          ],
          label: { lat: 25.014391, lng: 121.543550 },
          pano:  { lat: 25.014421, lng: 121.543610 }, 
        },
      ],
    },
    {
      spotName: "基隆路三段155巷路邊停車格F",     
      point: { lat: 25.014549, lng: 121.543558 }, 
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "F01",
          coords: [
            { lat: 25.014618, lng: 121.543507 },
            { lat: 25.014573, lng: 121.543546 },
            { lat: 25.014604, lng: 121.543586 },
            { lat: 25.014649, lng: 121.543549 },
          ],
          label: { lat: 25.014629, lng: 121.543584 },
          pano:  { lat: 25.014550, lng: 121.5435655 },
        },
        {
          name: "F02",
          coords: [
            { lat: 25.014573, lng: 121.543546 },
            { lat: 25.014524, lng: 121.543587 },
            { lat: 25.014555, lng: 121.543628 },
            { lat: 25.014604, lng: 121.543586 },
          ],
          label: { lat: 25.014585, lng: 121.543626 },
          pano:  { lat: 25.014550, lng: 121.5435655 },
        },
        {
          name: "F03",
          coords: [
            { lat: 25.014524, lng: 121.543587 },
            { lat: 25.014481, lng: 121.543623 },
            { lat: 25.014511, lng: 121.543666 },
            { lat: 25.014555, lng: 121.543628 },
          ],
          label: { lat: 25.014542, lng: 121.543660 },
          pano:  { lat: 25.014550, lng: 121.5435655 },
        },
      ],
    },
    {
      spotName: "基隆路三段155巷路邊停車格G",     
      point: { lat: 25.014275, lng: 121.543785 }, 
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "G01",
          coords: [
            { lat: 25.014329, lng: 121.543747 },
            { lat: 25.014280, lng: 121.543786 },
            { lat: 25.014310, lng: 121.543825 },
            { lat: 25.014360, lng: 121.543786 },
          ],
          label: { lat: 25.014340, lng: 121.543826 },
          pano:  { lat: 25.014284, lng: 121.543777 },
        },
        {
          name: "G02",
          coords: [
            { lat: 25.014280, lng: 121.543786 },
            { lat: 25.014235, lng: 121.543823 },
            { lat: 25.014265, lng: 121.543862 },
            { lat: 25.014310, lng: 121.543825 },
          ],
          label: { lat: 25.014302, lng: 121.543858 },
          pano:  { lat: 25.014284, lng: 121.543777 },
        },
      ],
    },
    {
      spotName: "基隆路三段155巷路邊停車格H",     
      point: { lat: 25.014110, lng: 121.543860 }, 
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "H01",
          coords: [
            { lat: 25.014231, lng: 121.543772 },
            { lat: 25.014176, lng: 121.543816 },
            { lat: 25.014152, lng: 121.543782 },
            { lat: 25.014207, lng: 121.543738 },
          ],
          label: { lat: 25.014171, lng: 121.543737 },
          pano:  { lat: 25.014177, lng: 121.543796 },
        },
        {
          name: "H02",
          coords: [
            { lat: 25.014165, lng: 121.543827 },
            { lat: 25.014097, lng: 121.543881 },
            { lat: 25.014073, lng: 121.543847 },
            { lat: 25.014140, lng: 121.543791 },
          ],
          label: { lat: 25.014099, lng: 121.543796 },
          pano:  { lat: 25.014119, lng: 121.543836 },
        },
        {
          name: "H03",
          coords: [
            { lat: 25.014085, lng: 121.543892 },
            { lat: 25.014026, lng: 121.543939 },
            { lat: 25.014002, lng: 121.543905 },
            { lat: 25.014061, lng: 121.543858 },
          ],
          label: { lat: 25.014023, lng: 121.543859 },
          pano:  { lat: 25.014030, lng: 121.543918 },
        },
      ],
    },//-20 -40
    {
      spotName: "基隆路三段155巷路邊停車格I",     
      point: { lat: 25.013700, lng: 121.544180 }, 
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "I01",
          coords: [
            { lat: 25.013832, lng: 121.544093 },
            { lat: 25.013773, lng: 121.544138 },
            { lat: 25.013748, lng: 121.544099 },
            { lat: 25.013807, lng: 121.544054 },
          ],
          label: { lat: 25.013770, lng: 121.544055 },
          pano:  { lat: 25.013805, lng: 121.544116 },
        },
        {
          name: "I02",
          coords: [
            { lat: 25.013748, lng: 121.544157 },
            { lat: 25.013689, lng: 121.544202 },
            { lat: 25.013664, lng: 121.544163 },
            { lat: 25.013723, lng: 121.544118 },
          ],
          label: { lat: 25.013685, lng: 121.544119 },
          pano:  { lat: 25.013721, lng: 121.544180 },
        },
        {
          name: "I03",
          coords: [
            { lat: 25.013667, lng: 121.544219 },
            { lat: 25.013608, lng: 121.544264 },
            { lat: 25.013583, lng: 121.544225 },
            { lat: 25.013642, lng: 121.544180 },
          ],
          label: { lat: 25.013604, lng: 121.544182 },
          pano:  { lat: 25.013640, lng: 121.544243 },
        },
      ],
    },
    {
      spotName: "基隆路三段155巷路邊停車格J",     
      point: { lat: 25.013480, lng: 121.544345 }, 
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "J01",
          coords: [
            { lat: 25.013596, lng: 121.544272 },
            { lat: 25.013536, lng: 121.544318 },
            { lat: 25.013511, lng: 121.544278 },
            { lat: 25.013571, lng: 121.544233 },
          ],
          label: { lat: 25.013533, lng: 121.544230 },
          pano:  { lat: 25.013566, lng: 121.544298 },
        },
        {
          name: "J02",
          coords: [
            { lat: 25.013523, lng: 121.544328 },
            { lat: 25.013463, lng: 121.544374 },
            { lat: 25.013438, lng: 121.544334 },
            { lat: 25.013498, lng: 121.544289 },
          ],
          label: { lat: 25.013460, lng: 121.544286 },
          pano:  { lat: 25.013493, lng: 121.544354 },
        },
        {
          name: "J03",
          coords: [
            { lat: 25.013445, lng: 121.544387 },
            { lat: 25.013385, lng: 121.544432 },
            { lat: 25.013360, lng: 121.544392 },
            { lat: 25.013420, lng: 121.544347 },
          ],
          label: { lat: 25.013382, lng: 121.544345 },
          pano:  { lat: 25.013415, lng: 121.544413 },
        },
      ],
    },
    {
      spotName: "基隆路三段155巷路邊停車格K",     
      point: { lat: 25.012746, lng: 121.544968 }, 
      iconUrl:"", // "https://cdn-icons-png.flaticon.com/512/608/608690.png",
      rects: [
        {
          name: "K01",
          coords: [
            { lat: 25.012786, lng: 121.544943 },
            { lat: 25.012727, lng: 121.544988 }, 
            { lat: 25.012756, lng: 121.545027 },
            { lat: 25.012814, lng: 121.544982 },
          ],
          label: { lat: 25.012790, lng: 121.545025 },
          pano:  { lat: 25.012785, lng: 121.545005 }
        },
      ],
    },
    {
      spotName: "羅斯福路四段113巷路邊停車格A",     
      point: { lat: 25.011320, lng: 121.538986 }, 
      iconUrl: "", 
      rects: [
        {
          name: "A01",
          coords: [
            { lat: 25.011334, lng: 121.538952 },
            { lat: 25.011336, lng: 121.539024 },
            { lat: 25.011372, lng: 121.539020 },
            { lat: 25.011370, lng: 121.538948 },
          ],
          label: { lat: 25.011383, lng: 121.538986 },
          pano:  { lat: 25.011353, lng: 121.538986 }
        },
      ],
    },
    {
      spotName: "羅斯福路四段113巷路邊停車格B",     
      point: { lat: 25.011354, lng: 121.540140 },
      iconUrl: "", 
      rects: [
        {
          name: "B01",
          coords: [
            { lat: 25.011353, lng: 121.539677 },
            { lat: 25.011376, lng: 121.540602 },
            { lat: 25.011416, lng: 121.540602 },
            { lat: 25.011393, lng: 121.539677 },
          ],
          label: { lat: 25.011424, lng: 121.540140 },
          pano:  { lat: 25.011384, lng: 121.540140 }
        },
      ],
    },
    {
      spotName: "萊爾富側邊路邊停車格A",     
      point: { lat: 25.013085, lng: 121.543009 },  
      iconUrl: "", 
      rects: [
        {
          name: "A01",
          coords: [
            { lat: 25.013014, lng: 121.543069 },
            { lat: 25.013151, lng: 121.542960 },
            { lat: 25.013132, lng: 121.542934 },
            { lat: 25.012995, lng: 121.543043 }
          ],
          label: { lat: 25.013054, lng: 121.542976 },
          pano:  { lat: 25.013085, lng: 121.543009 }
        },
      ],
    },
    {
      spotName: "萊爾富側邊路邊停車格B",     
      point: { lat: 25.012932, lng: 121.543180 },
      iconUrl: "", 
      rects: [
        {
          name: "B01",
          coords: [
            { lat: 25.012897, lng: 121.543212 },
            { lat: 25.013002, lng: 121.543118 },
            { lat: 25.013027, lng: 121.543147 },
            { lat: 25.012922, lng: 121.543241 },
          ],
          label: { lat: 25.012992, lng: 121.543200 },
          pano:  { lat: 25.012962, lng: 121.543180 }
        },
      ],
    },
    {
      spotName: "萊爾富側邊路邊停車格C",     
      point: { lat: 25.013083, lng: 121.543050 },
      iconUrl: "", 
      rects: [
        {
          name: "C01",
          coords: [
            { lat: 25.013171, lng: 121.542986 },
            { lat: 25.013036, lng: 121.543091 },
            { lat: 25.013055, lng: 121.543115 },
            { lat: 25.013190, lng: 121.543010 },
          ],
          label: { lat: 25.013133, lng: 121.543070 },
          pano:  { lat: 25.013113, lng: 121.543050 }
        },
      ],
    },
    {
      spotName: "萊爾富側邊路邊停車格D",     
      point: { lat: 25.013510, lng: 121.543328 },
      iconUrl: "", 
      rects: [
        {
          name: "D01",
          coords: [
            { lat: 25.013299, lng: 121.542984 },
            { lat: 25.013748, lng: 121.543694 },
            { lat: 25.013780, lng: 121.543672 },
            { lat: 25.013331, lng: 121.542962 },
          ],
          label: { lat: 25.013580, lng: 121.543328 },
          pano:  { lat: 25.013540, lng: 121.543328 }
        },
      ],
    },
    {
      spotName: "萊爾富側邊路邊停車格E",     
      point: { lat: 25.013830, lng: 121.543827 },
      iconUrl: "", 
      rects: [
        {
          name: "E01",
          coords: [
            { lat: 25.013813, lng: 121.543795 },
            { lat: 25.013864, lng: 121.543872 },
            { lat: 25.013895, lng: 121.543850 },
            { lat: 25.013844, lng: 121.543773 },
          ],
          label: { lat: 25.013885, lng: 121.543802 },
          pano:  { lat: 25.013855, lng: 121.543822 } 
        },
      ],
    },
    {
      spotName: "萊爾富側邊路邊停車格F",     
      point: { lat: 25.013575, lng: 121.543490 }, 
      iconUrl: "", 
      rects: [
        {
          name: "F01",
          coords: [
            { lat: 25.013302, lng: 121.543049 }, 
            { lat: 25.013844, lng: 121.543895 },
            { lat: 25.013820, lng: 121.543913 },
            { lat: 25.013278, lng: 121.543067 }, 
          ],
          label: { lat: 25.013522, lng: 121.543483 },
          pano:  { lat: 25.013562, lng: 121.543483 } 
        },
      ],
    },
    {
      spotName: "公館國小側邊路邊停車格A",     
      point: { lat: 25.012583, lng: 121.543414 },  
      iconUrl: "", 
      rects: [
        {
          name: "A01",
          coords: [
            { lat: 25.012669, lng: 121.543353 },
            { lat: 25.012629, lng: 121.543384 },
            { lat: 25.012603, lng: 121.543345 },
            { lat: 25.012642, lng: 121.543313 }
          ],
          label: { lat: 25.012614, lng: 121.543318 }, 
          pano:  { lat: 25.012649, lng: 121.543358 }
        },
        {
          name: "A02",
          coords: [
            { lat: 25.012619, lng: 121.543392 },
            { lat: 25.012580, lng: 121.543423 },
            { lat: 25.012553, lng: 121.543383 },
            { lat: 25.012592, lng: 121.543352 }
          ],
          label: { lat: 25.012564, lng: 121.543357 }, 
          pano:  { lat: 25.012589, lng: 121.543393 }
        },
        {
          name: "A03",
          coords: [
            { lat: 25.012564, lng: 121.543436 },
            { lat: 25.012525, lng: 121.543468 },
            { lat: 25.012498, lng: 121.543427 },
            { lat: 25.012537, lng: 121.543396 }
          ],
          label: { lat: 25.012509, lng: 121.543397 },
          pano:  { lat: 25.012534, lng: 121.543438 }
        },
      ],
    },
    {
      spotName: "公館國小側邊路邊停車格B",     
      point: { lat: 25.012423, lng: 121.543548 },  
      iconUrl: "", 
      rects: [
        {
          name: "B01",
          coords: [
            { lat: 25.012501, lng: 121.543489 },
            { lat: 25.012471, lng: 121.543514 },
            { lat: 25.012447, lng: 121.543474 },
            { lat: 25.012477, lng: 121.543449 }
          ],
          label: { lat: 25.012454, lng: 121.543451 },
          pano:  { lat: 25.012478, lng: 121.543488 }
        },
        {
          name: "B02",
          coords: [
            { lat: 25.012459, lng: 121.543524 },
            { lat: 25.012429, lng: 121.543549 },
            { lat: 25.012405, lng: 121.543509 },
            { lat: 25.012435, lng: 121.543484 }
          ],
          label: { lat: 25.012413, lng: 121.543486 },
          pano:  { lat: 25.012436, lng: 121.543523 }
        },
        {
          name: "B03",
          coords: [
            { lat: 25.012417, lng: 121.543558 },
            { lat: 25.012372, lng: 121.543594 },
            { lat: 25.012348, lng: 121.543554 },
            { lat: 25.012394, lng: 121.543519 }
          ],
          label: { lat: 25.012364, lng: 121.543526 },
          pano:  { lat: 25.012387, lng: 121.543563 }
        }
      ],
    },
    {
      spotName: "公館國小側邊路邊停車格C",     
      point: { lat: 25.012266, lng: 121.543682 },  
      iconUrl: "", 
      rects: [
        {
          name: "C01",
          coords: [
            { lat: 25.012349, lng: 121.543616 },
            { lat: 25.012302, lng: 121.543654 },
            { lat: 25.012278, lng: 121.543619 },
            { lat: 25.012325, lng: 121.543581 }
          ],
          label: { lat: 25.012294, lng: 121.543589 },
          pano:  { lat: 25.012316, lng: 121.543624 }
        },
        {
          name: "C02",
          coords: [
            { lat: 25.012291, lng: 121.543664 },
            { lat: 25.012252, lng: 121.543695 },
            { lat: 25.012229, lng: 121.543661 },
            { lat: 25.012267, lng: 121.543629 }
          ],
          label: { lat: 25.012239, lng: 121.543635 },
          pano:  { lat: 25.012259, lng: 121.543672 }
        },
        {
          name: "C03",
          coords: [
            { lat: 25.012240, lng: 121.543705 },
            { lat: 25.012202, lng: 121.543737 },
            { lat: 25.012178, lng: 121.543702 },
            { lat: 25.012216, lng: 121.543670 }
          ],
          label: { lat: 25.012189, lng: 121.543677 },
          pano:  { lat: 25.012213, lng: 121.543710 }
        },
      ],
    },
    {
      spotName: "公館國小側邊路邊停車格D",     
      point: { lat: 25.012138, lng: 121.543785 },  
      iconUrl: "", 
      rects: [
        {
          name: "D01",
          coords: [
            { lat: 25.012183, lng: 121.543750 },
            { lat: 25.012151, lng: 121.543778 },
            { lat: 25.012129, lng: 121.543741 },
            { lat: 25.012160, lng: 121.543714 }
          ],
          label: { lat: 25.012136, lng: 121.543718 },
          pano:  { lat: 25.012158, lng: 121.543753 }
        },
        {
          name: "D02",
          coords: [
            { lat: 25.012140, lng: 121.543788 },
            { lat: 25.012100, lng: 121.543821 },
            { lat: 25.012077, lng: 121.543785 },
            { lat: 25.012117, lng: 121.543752 }
          ],
          label: { lat: 25.012090, lng: 121.543758 },
          pano:  { lat: 25.012109, lng: 121.543795 }
        },
      ],
    },
    {
      spotName: "公館國小側邊路邊停車格E",     
      point: { lat: 25.012023, lng: 121.543885 },  
      iconUrl: "", 
      rects: [
        {
          name: "E01",
          coords: [
            { lat: 25.012079, lng: 121.543839 },
            { lat: 25.012057, lng: 121.543857 },
            { lat: 25.012033, lng: 121.543821 },
            { lat: 25.012055, lng: 121.543803 }
          ],
          label: { lat: 25.012037, lng: 121.543801 },
          pano:  { lat: 25.012059, lng: 121.543837 }
        },
        {
          name: "E02",
          coords: [
            { lat: 25.012047, lng: 121.543866 },
            { lat: 25.012022, lng: 121.543886 },
            { lat: 25.011998, lng: 121.543849 },
            { lat: 25.012023, lng: 121.543829 }
          ],
          label: { lat: 25.012002, lng: 121.543829 },
          pano:  { lat: 25.012024, lng: 121.543865 }
        },
        {
          name: "E03",
          coords: [
            { lat: 25.012009, lng: 121.543897 },
            { lat: 25.011977, lng: 121.543924 },
            { lat: 25.011952, lng: 121.543888 },
            { lat: 25.011984, lng: 121.543861 }
          ],
          label: { lat: 25.011966, lng: 121.543860 },
          pano:  { lat: 25.011984, lng: 121.543899 }
        },
      ],
    },
    {
      spotName: "公館國小側邊路邊停車格F",     
      point: { lat: 25.011923, lng: 121.543957 },  
      iconUrl: "", 
      rects: [
        {
          name: "F01",
          coords: [
            { lat: 25.011977, lng: 121.543924 },
            { lat: 25.011900, lng: 121.543990 },
            { lat: 25.011874, lng: 121.543953 },
            { lat: 25.011951, lng: 121.543887 }
          ],
          label: { lat: 25.011905, lng: 121.543907 },
          pano:  { lat: 25.011929, lng: 121.543945 }
        },
      ],
    },
  ];

  // spotName 的前綴 → 路線代碼；日後有新路就加一行
  const routeMapping: Record<string, string> = {
    "基隆路四段73巷": "IB",
    "基隆路三段155巷": "TR",
    "羅斯福路四段113巷": "POLICE",
    "萊爾富側邊":"HILIFE",
    "公館國小側邊":"GGES",
  };


  const availabilityById = await getAvailabilityMap();

  // 2) 由 boxMappings+routeMapping 自動生成 groupMap（例如 IB_A: ["A01","A02"...]）
  const groupMap = deriveGroupMapFromBoxMappings(boxMappings, routeMapping);
  console.log("groupMap =", groupMap);

  // 3) 依 groupMap 聚合出各群組(IB_A/TR_B…)狀態
  const availabilityByGroup = buildGroupAvailabilityWithMapping(availabilityById, groupMap);
  console.log("groups =", [...availabilityByGroup.keys()]); // 應該看到 ["IB_A","IB_B","TR_A",...]

  // 4) 畫 P 點（其餘邏輯維持原樣）
  for (const mapping of boxMappings) {
    const matchedSpot = spots.find((s) => s.name === mapping.spotName); // 保留原本

    // ✅ 用 helper 直接算出這個點的群組鍵（IB_A / TR_B … 或 A/B …）
    const groupKey = getGroupKeyForMapping(mapping, routeMapping);
    const group = availabilityByGroup.get(groupKey);

    // ✅ 半數門檻規則：>½ 綠、≤½ 黃、=0 紅、未知 灰
    const { title, iconUrl } = pickGroupMarkerMetaWithHalfRule(groupKey, group);

    // ✅ 其他不動
    const marker = new g.maps.Marker({
      position: mapping.point,
      map,
      title,
      icon: { url: iconUrl, scaledSize: new g.maps.Size(36, 36) },
    });

    console.log(`🅿️ P 點 marker 建立: ${mapping.spotName}, groupKey=${groupKey}`, group);
    // console.log("spotName=", mapping.spotName,
    //         "firstSub=", firstSub,
    //         "prefix=", prefix,
    //         "groupKey=", groupKey,
    //         "group=", group);

    marker.addListener("click", async () => {
    if (!isZoomed) {
      console.log("🔍 Zoom in 中...");
      // 立即 zoom + 置中，不等扣分
      smoothZoomSteps(map, 21, 200);
      map.setCenter(mapping.point);
      isZoomed = true;

      try {
        // 接著再去扣分
        const res = await fetch("/api/points/use", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "map" }),
        });

        const data = await res.json();
        if (!(res.ok && data.success === true)) {
        setInsufficientMessage("請上傳影像來獲取積分\n積分使用詳情可至個人設定頁面中查看");
        setShowInsufficientPointsDialog(true);
        return;
      }

        console.log(`✅ 已扣 ${data.cost || 10} 積分，剩餘 ${data.updatedPoints}`);
        queryClient.invalidateQueries({ queryKey: ["/api/points"] });

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
        // 進入 zoom-in 後，先清掉之前的紅點（防殘留）
        redPointMarkers.forEach((m) => m.setMap(null));
        redPointMarkers = [];

        // 1) 直接用你現成 helper 算這顆 P 的群組鍵：e.g. "IB_H" / "TR_A" / "H"
        const groupKey = getGroupKeyForMapping(mapping, routeMapping); // 例："IB_H"
        const norm = (s:any)=> (s??"").toString().trim().toUpperCase();

        // 2) 拉紅點資料
        const redRes = await fetch("/api/red-points");
        const redPoints = await redRes.json();

        // 3) 用 location 直接過濾（location 形如 "IB_H01"）
        //    重點：只要開頭符合 "IB_H" 就是同一路線同一字母區
        const expectedPrefix = norm(groupKey); // "IB_H" 或 "H"
        const filtered = Array.isArray(redPoints)
          ? redPoints.filter((pt:any) => {
              const loc = norm(pt.location || pt.inferred_area || "");
              // 支援舊資料：如果 groupKey 沒帶路線只比對字母
              return expectedPrefix.includes("_")
                ? loc.startsWith(expectedPrefix + "")  // "IB_H01".startsWith("IB_H")
                : loc.split("_")[1]?.startsWith(expectedPrefix); // "IB_H01" -> "H01"
            })
          : [];

        console.log(`🔴 ${expectedPrefix} 區紅點筆數:`, filtered.length);

        // 4) 畫點（原樣）
        for (const pt of filtered) {
          const redMarker = new g.maps.Marker({
            position: { lat: pt.lat, lng: pt.lng },
            map,
            icon: {
              path: g.maps.SymbolPath.CIRCLE,
              scale: 7.5,
              fillColor: "red",
              fillOpacity: 1,
              strokeColor: "white",
              strokeOpacity: 0.8,
              strokeWeight: 2,
            },
            label: {
              text: pt.motor_index?.toString() ?? "",
              color: "white",
              fontSize: "12px",
              fontWeight: "bold",
            },
          });
          redPointMarkers.push(redMarker);
        }

        isZoomed = true;
      } catch (err) {
        console.error("❌ 扣分或地圖處理失敗:", err);
        alert("系統錯誤，請稍後再試");
      }
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


 return (
  <div className="relative w-full h-full">
    <div ref={mapRef} className="w-full h-full" />

    {/* 積分不足對話框 */}
    <Dialog open={showInsufficientPointsDialog} onOpenChange={setShowInsufficientPointsDialog}>
      <DialogContent className="sm:max-w-[400px] rounded-xl">
        <DialogHeader>
          <DialogTitle>積分不足</DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {insufficientMessage}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center pt-2">
          <Button onClick={() => setShowInsufficientPointsDialog(false)}>關閉</Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* ✅ P 點顏色圖例：左上角 + 蒂芬妮綠 */}
    <div
      className="absolute top-4 left-4 bg-white bg-opacity-90 rounded-xl shadow-lg p-3 text-sm space-y-1"
      style={{ zIndex: 10 }}
    >
      <div>
        <span
          className="inline-block w-3 h-3 rounded-full mr-2"
          style={{ backgroundColor: "#30D5C8" }} // 蒂芬妮綠
        />
        車位充足
      </div>
      <div>
        <span className="inline-block w-3 h-3 rounded-full bg-yellow-400 mr-2" />
        車位有限
      </div>
      <div>
        <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2" />
        車位已滿
      </div>
    </div>
  </div>
);
}