const pool = require('../config/db');
const region = require('../config/region');
const { haversineDistanceKm, pointToSegment } = require('../utils/geo');
const { requestWalkingRoute } = require('../utils/tmap');
const routeCache = require('../utils/routeCache');

const DEFAULT_RADIUS_M = 30;
const MAX_RADIUS_M = 200;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_PATH_POINTS = 200;

/**
 * 쿼리에서 경로 좌표 배열을 만든다.
 *  - from_lat, from_lng, to_lat, to_lng : 출발지→도착지 (TMAP 보행자 길찾기로 폴리라인을 산출)
 *  - path=lat,lng;lat,lng;...           : 호출자가 지정한 폴리라인(2~200점, TMAP 호출 생략)
 * path가 있으면 path를 우선한다.
 * 반환: { points, fromTmap } 또는 { error }
 */
function parsePoints(query) {
  if (query.path) {
    const raw = String(query.path)
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => s.split(',').map(v => v.trim()));
    if (raw.length < 2 || raw.length > MAX_PATH_POINTS || raw.some(c => c.length !== 2)) {
      return { error: `path는 "위도,경도;위도,경도" 형식의 점 2~${MAX_PATH_POINTS}개여야 합니다.` };
    }
    const points = raw.map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }));
    if (!validateCoords(points)) return { error: '좌표 값이 올바르지 않습니다.' };
    return { points, fromTmap: false };
  }

  const { from_lat, from_lng, to_lat, to_lng } = query;
  if ([from_lat, from_lng, to_lat, to_lng].some(v => v === undefined || v === '')) {
    return { error: 'from_lat, from_lng, to_lat, to_lng (또는 path)가 필요합니다.' };
  }
  const points = [
    { lat: Number(from_lat), lng: Number(from_lng) },
    { lat: Number(to_lat), lng: Number(to_lng) },
  ];
  if (!validateCoords(points)) return { error: '좌표 값이 올바르지 않습니다.' };
  return { points, fromTmap: true };
}

function validateCoords(points) {
  return points.every(
    p => Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
         p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180
  );
}

function parseIntParam(raw, def, min, max) {
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/**
 * GET /api/route   (인증·로그인 불필요)
 * 보행 경로(TMAP) 또는 호출자가 제공한 폴리라인 근처의 승인(approved)된 제보를 warnings로 반환한다.
 *
 * query:
 *   from_lat, from_lng, to_lat, to_lng : 출발→도착 (TMAP 보행자 길찾기로 실제 보행로 폴리라인 생성)
 *   path=lat,lng;lat,lng;...           : 폴리라인을 직접 지정 (TMAP 호출 생략)
 *   radius_m (선택, 기본 30, 1~200)   폴리라인에서 이 거리 이내 제보만 포함
 *   limit    (선택, 기본 20, 1~50)    warnings 최대 개수
 *
 * - 입력 출발·도착(또는 path 각 점) 중 하나라도 서비스 지역 밖이면 403 OUT_OF_REGION.
 *   TMAP이 돌려주는 중간 점은 월계1동 경계를 소폭 벗어난 소로를 지날 수 있어 검사 대상에서 뺀다.
 * - TMAP 호출 실패:
 *     503 ROUTING_UNAVAILABLE  : TMAP_APP_KEY 미설정 (reason=KEY_NOT_CONFIGURED)
 *     404 NO_ROUTE_FOUND       : TMAP이 경로를 찾지 못함
 *     502 UPSTREAM_ERROR       : 네트워크·타임아웃·4xx/5xx 등
 */
async function getRoute(req, res) {
  const parsed = parsePoints(req.query);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error, code: 'INVALID_ROUTE' });
  }
  let { points, fromTmap } = parsed;

  const radiusM = parseIntParam(req.query.radius_m, DEFAULT_RADIUS_M, 1, MAX_RADIUS_M);
  const limit = parseIntParam(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  if (radiusM === null) {
    return res.status(400).json({ error: `radius_m는 1~${MAX_RADIUS_M} 사이 정수여야 합니다.`, code: 'INVALID_ROUTE' });
  }
  if (limit === null) {
    return res.status(400).json({ error: `limit은 1~${MAX_LIMIT} 사이 정수여야 합니다.`, code: 'INVALID_ROUTE' });
  }

  // ── 서비스 지역 검사 (입력 좌표만: TMAP 중간 점은 포함하지 않음) ────────
  for (const p of points) {
    const distance = haversineDistanceKm(region.CENTER_LAT, region.CENTER_LNG, p.lat, p.lng);
    if (distance > region.RADIUS_KM) {
      return res.status(403).json({
        error: '서비스 지역(월계1동) 밖의 경로는 안내할 수 없습니다.',
        code: 'OUT_OF_REGION',
        distance_km: Math.round(distance * 100) / 100,
        allowed_radius_km: region.RADIUS_KM,
      });
    }
  }

  // ── from/to 모드: TMAP 보행자 길찾기 호출 ────────────────────────────────
  let tmapTotalDistanceM = null;
  if (fromTmap) {
    const from = points[0];
    const to = points[1];
    const key = routeCache.cacheKey(from.lat, from.lng, to.lat, to.lng);
    try {
      let result = routeCache.get(key);
      if (!result) {
        result = await requestWalkingRoute(from.lat, from.lng, to.lat, to.lng);
        routeCache.set(key, result);
      }
      points = result.coordinates.map(([lat, lng]) => ({ lat, lng }));
      tmapTotalDistanceM = Math.round(result.totalDistanceM);
    } catch (err) {
      const code = err && err.tmapCode;
      if (code === 'KEY_NOT_CONFIGURED') {
        return res.status(503).json({
          error: '보행 경로 길찾기 서비스가 설정되지 않았습니다. 서버 관리자에게 문의하세요.',
          code: 'ROUTING_UNAVAILABLE',
          reason: 'KEY_NOT_CONFIGURED',
        });
      }
      if (code === 'NO_ROUTE') {
        return res.status(404).json({
          error: '출발지와 도착지 사이의 보행 경로를 찾지 못했습니다.',
          code: 'NO_ROUTE_FOUND',
        });
      }
      console.error('[route] TMAP 호출 실패:', err && err.message ? err.message : err);
      return res.status(502).json({
        error: '보행 경로 길찾기 서비스에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        code: 'UPSTREAM_ERROR',
      });
    }
  }

  try {
    // ── 1차 필터: 폴리라인 bounding box + 여유(반경) — DB에서 후보만 가져옴 ─
    const lats = points.map(p => p.lat);
    const lngs = points.map(p => p.lng);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const marginLat = radiusM / 111320;
    const marginLng = radiusM / (111320 * Math.cos((midLat * Math.PI) / 180));

    const { rows } = await pool.query(
      `SELECT
         r.id, r.title,
         r.latitude::float8 AS latitude, r.longitude::float8 AS longitude,
         r.accessibility_status,
         COALESCE(
           ARRAY_AGG(DISTINCT t.code) FILTER (WHERE t.code IS NOT NULL), '{}'
         ) AS tags
       FROM reports r
       LEFT JOIN report_tags rt ON rt.report_id = r.id
       LEFT JOIN tags t ON t.id = rt.tag_id
       WHERE r.status = 'approved'
         AND r.latitude  BETWEEN $1 AND $2
         AND r.longitude BETWEEN $3 AND $4
       GROUP BY r.id`,
      [
        Math.min(...lats) - marginLat, Math.max(...lats) + marginLat,
        Math.min(...lngs) - marginLng, Math.max(...lngs) + marginLng,
      ]
    );

    // ── 2차 필터: 선분별 정확한 거리 계산 ──────────────────────────────────
    // 각 선분 길이를 누적해 "경로 상 위치(along_m)"를 구한다.
    const segLen = [];
    for (let i = 0; i < points.length - 1; i++) {
      segLen.push(haversineDistanceKm(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng) * 1000);
    }
    const totalM = segLen.reduce((a, b) => a + b, 0);

    const hits = [];
    for (const r of rows) {
      let best = null;
      let startM = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const { distanceM, t } = pointToSegment(
          { lat: r.latitude, lng: r.longitude }, points[i], points[i + 1]
        );
        if (best === null || distanceM < best.distanceM) {
          best = { distanceM, alongM: startM + t * segLen[i] };
        }
        startM += segLen[i];
      }
      if (best.distanceM <= radiusM) {
        hits.push({
          report_id: r.id,
          title: r.title,
          latitude: r.latitude,
          longitude: r.longitude,
          tags: r.tags,
          accessibility_status: r.accessibility_status,
          distance_m: Math.round(best.distanceM * 10) / 10,
          along_m: Math.round(best.alongM),
        });
      }
    }

    hits.sort((a, b) => a.along_m - b.along_m || a.distance_m - b.distance_m);

    return res.json({
      route: points.map(p => [p.lat, p.lng]),   // [[위도, 경도], ...] (프론트 폴리라인용)
      route_distance_m: tmapTotalDistanceM != null ? tmapTotalDistanceM : Math.round(totalM),
      radius_m: radiusM,
      warnings: hits.slice(0, limit),
      total_warnings: hits.length,
      truncated: hits.length > limit,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

module.exports = { getRoute };
