// client/lib/smoothZoom.ts

let _zoomTimer: number | null = null;

/**
 * 平滑放大或縮小地圖視圖（整數步進）
 * @param map Google Maps 實例
 * @param targetZoom 目標 zoom 值
 * @param duration 動畫總時長（毫秒）
 */
export function smoothZoomSteps(
  map: google.maps.Map | null,
  targetZoom: number,
  duration: number = 500
) {
  if (!map) return;

  const startZoom = map.getZoom();
  if (startZoom === undefined) return;

  const delta = targetZoom - startZoom;
  if (delta === 0) return;

  // 若已有動畫在執行，先取消
  if (_zoomTimer) {
    clearInterval(_zoomTimer);
    _zoomTimer = null;
  }

  const steps = Math.abs(delta);
  const stepDuration = Math.max(16, Math.round(duration / Math.max(1, steps)));
  let stepCount = 0;
  const dir = delta > 0 ? 1 : -1;

  _zoomTimer = window.setInterval(() => {
    stepCount++;
    const nextZoom = startZoom + dir * stepCount;
    map.setZoom(nextZoom);

    if (stepCount >= steps) {
      clearInterval(_zoomTimer!);
      _zoomTimer = null;
    }
  }, stepDuration);
}
