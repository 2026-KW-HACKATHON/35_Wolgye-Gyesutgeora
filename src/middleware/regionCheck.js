const { haversineDistanceKm } = require('../utils/geo');
const { removeUploadedFiles } = require('../utils/files');
const region = require('../config/region');

/**
 * 제보 등록 시 단말기 GPS 좌표가 서비스 지역(월계1동) 반경 내인지 검증.
 * 앱은 제보 시점의 현재 위치를 latitude/longitude로 함께 보낸다.
 *
 * 지도 조회 등 읽기 API에는 적용하지 않음.
 */
function requireInRegion(req, res, next) {
  const lat = parseFloat(req.body.latitude);
  const lng = parseFloat(req.body.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    removeUploadedFiles(req);
    return res.status(400).json({ error: '올바른 latitude, longitude가 필요합니다.' });
  }

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
