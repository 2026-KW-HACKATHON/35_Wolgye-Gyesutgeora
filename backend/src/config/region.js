/**
 * 서비스 지역(월계1동) 판단 기준: 중심점 + 반지름 (Haversine 거리)
 *
 * 기본 좌표는 월계1동 대략 중심(placeholder)이므로 .env에서 조정 가능.
 * 원형 근사라 실제 행정경계와는 오차가 있음.
 */
module.exports = {
  CENTER_LAT: parseFloat(process.env.REGION_CENTER_LAT || '37.6215'),
  CENTER_LNG: parseFloat(process.env.REGION_CENTER_LNG || '127.0605'),
  RADIUS_KM: parseFloat(process.env.REGION_RADIUS_KM || '1.5'),
};
