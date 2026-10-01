/**
 * 두 좌표 간 거리를 km 단위로 계산 (Haversine 공식)
 */
function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // 지구 반지름(km)
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

const EARTH_RADIUS_M = 6371000;

/**
 * 점 P에서 선분 AB까지의 최단 거리(m)와, 선분 위 가장 가까운 지점까지의 비율 t(0~1)를 구한다.
 * 월계동 규모(수 km)에서는 기준점 위도 기준 등장방형(equirectangular) 평면 근사로 충분히 정확하다.
 * 좌표 인자: { lat, lng }
 */
function pointToSegment(p, a, b) {
  const lat0 = toRad((a.lat + b.lat) / 2);
  const kx = EARTH_RADIUS_M * Math.cos(lat0) * (Math.PI / 180); // 경도 1도당 m
  const ky = EARTH_RADIUS_M * (Math.PI / 180);                  // 위도 1도당 m

  const ax = a.lng * kx, ay = a.lat * ky;
  const bx = b.lng * kx, by = b.lat * ky;
  const px = p.lng * kx, py = p.lat * ky;

  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * dx, cy = ay + t * dy;
  return { distanceM: Math.hypot(px - cx, py - cy), t };
}

module.exports = { haversineDistanceKm, pointToSegment };
