// TMAP 보행자 길찾기 API를 호출해 두 지점 사이의 실제 보행로 폴리라인을 돌려준다.
// 응답 좌표계: [[위도, 경도], ...] (프론트 Leaflet polyline과 바로 호환)
//
// 실패 시 Error 객체의 `tmapCode`를 통해 호출자에게 상황을 알린다:
//   - 'KEY_NOT_CONFIGURED' : .env의 TMAP_APP_KEY가 비어 있음
//   - 'NO_ROUTE'           : TMAP이 LineString 없이 응답(경로 없음)
//   - 'UPSTREAM_ERROR'     : 네트워크·타임아웃·4xx/5xx·파싱 실패
//
// Node 18+의 전역 fetch/AbortController를 사용한다(별도 패키지 없음).

const TMAP_URL = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';

// 돌려줄 폴리라인의 최대 점 개수. routeController의 MAX_PATH_POINTS와 맞춤.
const MAX_RESULT_POINTS = 200;

/**
 * TMAP 보행자 길찾기를 호출한다.
 * @param {number} fromLat  출발 위도 (WGS84)
 * @param {number} fromLng  출발 경도 (WGS84)
 * @param {number} toLat    도착 위도 (WGS84)
 * @param {number} toLng    도착 경도 (WGS84)
 * @returns {Promise<{ coordinates: Array<[number, number]>, totalDistanceM: number, totalTimeS: number }>}
 */
async function requestWalkingRoute(fromLat, fromLng, toLat, toLng) {
  const appKey = process.env.TMAP_APP_KEY;
  if (!appKey) {
    throw makeErr('TMAP_APP_KEY가 설정되지 않았습니다.', 'KEY_NOT_CONFIGURED');
  }

  const timeoutMs = parsePositiveInt(process.env.TMAP_TIMEOUT_MS, 5000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(TMAP_URL, {
      method: 'POST',
      headers: {
        appKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      // TMAP은 X=경도, Y=위도 (주의: 프로젝트 전반의 lat/lng 순서와 반대)
      body: JSON.stringify({
        startX: fromLng,
        startY: fromLat,
        endX: toLng,
        endY: toLat,
        startName: '출발',
        endName: '도착',
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
      }),
      signal: controller.signal,
    });
  } catch (e) {
    throw makeErr('TMAP 호출 실패: ' + (e && e.message ? e.message : 'network'), 'UPSTREAM_ERROR');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const text = await safeText(res);
    const err = makeErr('TMAP 응답 오류: HTTP ' + res.status, 'UPSTREAM_ERROR');
    err.upstreamStatus = res.status;
    err.upstreamBody = text;
    throw err;
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw makeErr('TMAP 응답 파싱 실패', 'UPSTREAM_ERROR');
  }

  const features = Array.isArray(data && data.features) ? data.features : [];
  const coordinates = [];
  let totalDistanceM = 0;
  let totalTimeS = 0;

  for (const f of features) {
    const geomType = f && f.geometry && f.geometry.type;
    const coords = f && f.geometry && f.geometry.coordinates;
    const props = (f && f.properties) || {};

    if (geomType === 'Point') {
      // 요약 feature(출발점)의 properties에 totalDistance / totalTime이 들어 있다.
      const d = Number(props.totalDistance);
      const t = Number(props.totalTime);
      if (Number.isFinite(d) && d > 0) totalDistanceM = Math.max(totalDistanceM, d);
      if (Number.isFinite(t) && t > 0) totalTimeS = Math.max(totalTimeS, t);
    } else if (geomType === 'LineString' && Array.isArray(coords)) {
      for (const c of coords) {
        if (!Array.isArray(c) || c.length < 2) continue;
        const lng = Number(c[0]);
        const lat = Number(c[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        // 연속한 중복 좌표는 걸러서 폴리라인을 가볍게 유지
        const last = coordinates[coordinates.length - 1];
        if (!last || last[0] !== lat || last[1] !== lng) {
          coordinates.push([lat, lng]);
        }
      }
    }
  }

  if (coordinates.length < 2) {
    throw makeErr('TMAP이 경로를 반환하지 않았습니다.', 'NO_ROUTE');
  }

  // 200점 상한을 넘으면 균일 샘플링(시작·끝은 반드시 포함)
  const sampled = downsample(coordinates, MAX_RESULT_POINTS);

  return { coordinates: sampled, totalDistanceM, totalTimeS };
}

function makeErr(message, code) {
  const e = new Error(message);
  e.tmapCode = code;
  return e;
}

function parsePositiveInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function safeText(res) {
  try { return await res.text(); } catch (_) { return ''; }
}

/**
 * 좌표 배열을 maxPoints 이하로 균일 샘플링한다.
 * 시작점과 끝점은 반드시 유지되고, 연속 중복은 제거한다.
 */
function downsample(coords, maxPoints) {
  if (coords.length <= maxPoints) return coords;
  const n = coords.length;
  const result = [];
  const step = (n - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints - 1; i++) {
    const idx = Math.round(i * step);
    const c = coords[idx];
    const last = result[result.length - 1];
    if (!last || last[0] !== c[0] || last[1] !== c[1]) result.push(c);
  }
  const end = coords[n - 1];
  const last = result[result.length - 1];
  if (!last || last[0] !== end[0] || last[1] !== end[1]) result.push(end);
  return result;
}

module.exports = { requestWalkingRoute };
