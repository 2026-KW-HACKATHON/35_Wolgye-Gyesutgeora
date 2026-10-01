const express = require('express');
const router = express.Router();

const { getRoute } = require('../controllers/routeController');

// 경로 주변 보행 경고 조회 - 인증/지역 제한 미들웨어 없음(지역 검사는 컨트롤러에서)
// GET /api/route?from_lat=&from_lng=&to_lat=&to_lng=[&radius_m=30&limit=20]
// GET /api/route?path=lat,lng;lat,lng;...
router.get('/', getRoute);

module.exports = router;
