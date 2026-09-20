const { haversineDistanceKm } = require('../utils/geo');
const { removeUploadedFiles } = require('../utils/files');
const region = require('../config/region');

/**
 * 제보 등록 시 GPS 좌표가 서비스 지역(월계1동) 반경 내인지 검증합니다.
 *
 * 웹 브라우저 환경을 고려한 에러 코드 분리:
 *   - LOCATION_REQUIRED : latitude/longitude 값 자체가 없음
 *                         → 브라우저 위치 권한을 거부했거나 전송을 누락한 경우
 *   - LOCATION_INVALID  : 값이 있으나 숫자/범위가 잘못됨
 *   - OUT_OF_REGION     : 좌표는 정상이나 서비스 지역 밖
 *
 * 지도 조회 등 읽기 API에는 적용하지 않습니다.
 */
function requireInRegion(req, res, next) {
  const rawLat = req.body.latitude;
  const rawLng = req.body.longitude;

  // ── 위치 값 자체가 없는 경우 (브라우저 위치 권한 거부 등) ──────────────
  if (rawLat === undefined || rawLat === null || rawLat === '' ||
      rawLng === undefined || rawLng === null || rawLng === '') {
    removeUploadedFiles(req);
    return res.status(400).json({
      error: '위치 정보가 필요합니다. 브라우저의 위치 권한을 허용한 후 다시 시도해주세요.',
      code: 'LOCATION_REQUIRED',
    });
  }

  const lat = parseFloat(rawLat);
  const lng = parseFloat(rawLng);

  // ── 숫자 변환 실패 또는 범위 초과 ─────────────────────────────────────
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    removeUploadedFiles(req);
    return res.status(400).json({
      error: '위치 값이 올바르지 않습니다.',
      code: 'LOCATION_INVALID',
    });
  }

  // ── 서비스 지역 반경 검사 ──────────────────────────────────────────────
  const distance = haversineDistanceKm(region.CENTER_LAT, region.CENTER_LNG, lat, lng);

  if (distance > region.RADIUS_KM) {
    removeUploadedFiles(req);
    return res.status(403).json({
      error: '서비스 지역(월계1동) 밖에서는 제보를 등록할 수 없습니다.',
      code: 'OUT_OF_REGION',
      distance_km: Math.round(distance * 100) / 100,
      allowed_radius_km: region.RADIUS_KM,
    });
  }

  next();
}

module.exports = { requireInRegion };
