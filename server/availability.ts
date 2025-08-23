// E:\ParkSavvy\server\availability.ts

// ====== 型別 ======
export type AreaAvailability = {
  area_id: string;
  capacity_est: number;
  current_count: number | null;
  free_slots: number;
  state: "has_space" | "no_space" | "unknown";
  updated_at: string | null;
};

export type GroupAgg = {
  capacity_est: number;
  current_count: number | null;
  free_slots: number;
  state: "has_space" | "no_space" | "unknown";
  updated_at: string | null;
};

// ====== 圖示（Supabase Storage 的 https 圖）======
const ICONS: Record<string, string> = {
  has_space:
    "https://polqjhuklxclnvgpjckf.supabase.co/storage/v1/object/public/icons/parking.png",   // 綠
  no_space:
    "https://polqjhuklxclnvgpjckf.supabase.co/storage/v1/object/public/icons/parking-2.png", // 紅
  unknown:
    "https://polqjhuklxclnvgpjckf.supabase.co/storage/v1/object/public/icons/parking-3.png", // 灰
  some_space:
    "https://polqjhuklxclnvgpjckf.supabase.co/storage/v1/object/public/icons/parking-4.png", // 黃（半數內）
};

// ====== 小格(A01/IB_A01...)：抓可用性並做成 Map ======
/** 從後端拿 area_availability，回 Map<area_id, row> */
export async function getAvailabilityMap(): Promise<Map<string, AreaAvailability>> {
  const res = await fetch("/api/parking-hints");
  if (!res.ok) throw new Error("fetch /api/parking-hints failed");
  const rows: AreaAvailability[] = await res.json();
  const map = new Map<string, AreaAvailability>();
  for (const r of rows) map.set(r.area_id, r);
  return map;
}

/** 依小格狀態挑 Marker 的 title 與 icon（備援用 mapping.iconUrl） */
export function pickMarkerMeta(
  areaId: string,
  availabilityById: Map<string, AreaAvailability>,
  fallbackIconUrl?: string
): { title: string; iconUrl: string } {
  const a = availabilityById.get(areaId);
  if (!a) {
    return {
      title: `${areaId} | 狀態: 未知`,
      iconUrl: fallbackIconUrl ?? ICONS.unknown,
    };
  }
  const iconUrl = ICONS[a.state] ?? ICONS.unknown;
  const title = `${areaId} | 空位: ${a.free_slots}/${a.capacity_est}`;
  return { title, iconUrl };
}

// ====== 解析群組鍵（支援 'IB_A01' / 'TR_B03' / 舊格式 'A01'）======
/** 由 area_id 取出群組鍵：'IB_A01' → 'IB_A'；'A01' → 'A' */
export function parseGroupKey(areaId: string): string {
  // 拆前綴（路線代碼）與剩餘字串
  const [prefixMaybe, restMaybe] = areaId.includes("_")
    ? areaId.split("_", 2) // "IB_A01" -> ["IB", "A01"]
    : [null, areaId];      // "A01"    -> [null, "A01"]

  const letter = restMaybe.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? ""; // "A"
  return prefixMaybe ? `${prefixMaybe}_${letter}` : letter;               // "IB_A" / "A"
}

// 依 boxMappings + routeMapping 自動生成 groupMap：{ "IB_A": ["A01","A02",...], ... }
export function deriveGroupMapFromBoxMappings(
  boxMappings: Array<{ spotName: string; rects?: Array<{ name: string }> }>,
  routeMapping: Record<string, string>
): Record<string, string[]> {
  const groupMap: Record<string, string[]> = {};

  for (const m of boxMappings) {
    // 1) 找路線代碼（IB/TR…）：用 spotName 的前綴對照
    const prefix =
      Object.entries(routeMapping).find(([k]) => m.spotName.startsWith(k))?.[1] ?? "";

    if (!m.rects || m.rects.length === 0) continue;

    for (const r of m.rects) {
      const letter = r.name.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? ""; // A/B/C…
      const areaId = r.name;                                              // A01/B02…
      const groupKey = prefix ? `${prefix}_${letter}` : letter;           // IB_A / TR_B / A

      if (!groupMap[groupKey]) groupMap[groupKey] = [];
      if (!groupMap[groupKey].includes(areaId)) groupMap[groupKey].push(areaId);
    }
  }
  return groupMap;
}

// 幫單一 mapping 算出它的群組鍵（給畫 marker 用）
export function getGroupKeyForMapping(
  mapping: { spotName: string; rects?: Array<{ name: string }> },
  routeMapping: Record<string, string>
): string {
  const prefix =
    Object.entries(routeMapping).find(([k]) => mapping.spotName.startsWith(k))?.[1] ?? "";
  const firstSub = mapping.rects?.[0]?.name ?? "";
  const letter = firstSub.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? "";
  return prefix ? `${prefix}_${letter}` : letter;
}

// ====== 聚合：把小格聚成群組（IB_A / TR_B / ...）======
/** 將 Map<area_id,row> 依「路線_字母」聚合成 Map<groupKey,row>（例：'IB_A'） */
export function buildGroupAvailability(avById: Map<string, AreaAvailability>) {
  const byGroup = new Map<string, GroupAgg>();

  for (const row of avById.values()) {
    const group = parseGroupKey(String(row.area_id)); // ← 關鍵：用路線_字母分組
    const cur =
      byGroup.get(group) ?? {
        capacity_est: 0,
        current_count: 0,
        free_slots: 0,
        state: "unknown",
        updated_at: null as string | null,
      };

    // 容量加總
    cur.capacity_est += row.capacity_est ?? 0;

    // current_count：任一小格為 null → 整組視為 unknown
    if (row.current_count == null) {
      cur.current_count = null;
    } else if (cur.current_count != null) {
      cur.current_count += row.current_count;
    }

    // updated_at 取最新
    if (!cur.updated_at || (row.updated_at && row.updated_at > cur.updated_at)) {
      cur.updated_at = row.updated_at;
    }

    byGroup.set(group, cur);
  }

  // 回填 free_slots 與群組 state
  for (const [, cur] of byGroup) {
    if (cur.current_count == null) {
      cur.free_slots = 0;
      cur.state = "unknown";
    } else {
      cur.free_slots = Math.max(cur.capacity_est - cur.current_count, 0);
      cur.state = cur.free_slots >= 1 ? "has_space" : "no_space";
    }
  }

  return byGroup; // Map<"IB_A", GroupAgg> / Map<"TR_B", GroupAgg> ...
}

// ====== 群組(A/B/C...)：半數門檻選 icon/title ======
/**
 * 規則：
 * - current_count 為 null → unknown(灰)
 * - free_slots === 0 → no_space(紅)
 * - 1 ≤ free_slots ≤ floor(capacity/2) → some_space(黃)
 * - free_slots > floor(capacity/2) → has_space(綠)
 */
export function pickGroupMarkerMetaWithHalfRule(
  groupKey: string,
  group?: GroupAgg
): { title: string; iconUrl: string } {
  if (!group || group.current_count == null) {
    return { title: `${groupKey} 區 | 狀態: 未知`, iconUrl: ICONS.unknown };
  }

  const cap = Math.max(group.capacity_est ?? 0, 0);
  const half = Math.floor(cap / 2);

  let iconUrl = ICONS.has_space; // 預設：空位多
  if (group.free_slots === 0) {
    iconUrl = ICONS.no_space;    // 滿
  } else if (group.free_slots <= half) {
    iconUrl = ICONS.some_space;  // 半數內：黃
  }

  const title = `${groupKey} 區 | 空位: ${group.free_slots}/${cap}`;
  return { title, iconUrl };
}

// 依自動生成的 groupMap 做聚合：回傳 Map<groupKey, GroupAgg>
export function buildGroupAvailabilityWithMapping(
  avById: Map<string, AreaAvailability>,
  groupMap: Record<string, string[]>
): Map<string, GroupAgg> {
  const byGroup = new Map<string, GroupAgg>();

  for (const [groupKey, areaIds] of Object.entries(groupMap)) {
    let cap = 0;
    let curCount: number | null = 0;
    let latest: string | null = null;

    for (const id of areaIds) {
      const row = avById.get(id);
      if (!row) continue;

      cap += row.capacity_est ?? 0;

      if (row.current_count == null) {
        curCount = null;          // 任一小格未知 → 整組未知
      } else if (curCount != null) {
        curCount += row.current_count;
      }

      if (!latest || (row.updated_at && row.updated_at > latest)) {
        latest = row.updated_at;
      }
    }

    let freeSlots = 0;
    let state: GroupAgg["state"] = "unknown";
    if (curCount == null) {
      freeSlots = 0;
      state = "unknown";
    } else {
      freeSlots = Math.max(cap - curCount, 0);
      state = freeSlots >= 1 ? "has_space" : "no_space";
    }

    byGroup.set(groupKey, {
      capacity_est: cap,
      current_count: curCount,
      free_slots: freeSlots,
      state,
      updated_at: latest,
    });
  }

  return byGroup;
}