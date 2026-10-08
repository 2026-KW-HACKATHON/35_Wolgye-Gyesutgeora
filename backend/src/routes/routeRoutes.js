const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const { getRoute } = require('../controllers/routeController');

const limitFromEnv = (name, fallback) => {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// 경로 조회: 1시간 내 ROUTE_MAX건 (기본 120)
// (프론트는 출발·도착을 드래그·수정하며 반복 호출할 수 있으므로 넉넉하게 둠.
//  TMAP의 일일 무료 한도도 캐시(utils/routeCache.js)와 함께 이 제한으로 보호됨)
const ROUTE_MAX = limitFromEnv('RATE_LIMIT_ROUTE_MAX', 120);
const routeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: ROUTE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: `경로 조회는 1시간에 최대 ${ROUTE_MAX}건까지 가능합니다.` },
});

// 경로 주변 보행 경고 조회 - 인증/지역 제한 미들웨어 없음(지역 검사는 컨트롤러에서)
// GET /api/route?from_lat=&from_lng=&to_lat=&to_lng=[&radius_m=30&limit=20]   (TMAP 호출)
// GET /api/route?path=lat,lng;lat,lng;...                                     (폴리라인 직접 지정)
router.get('/', routeLimiter, getRoute);

module.exports = router;
