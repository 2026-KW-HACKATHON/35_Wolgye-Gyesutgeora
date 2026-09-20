const express = require('express');
const router = express.Router();

const {
  createReport,
  listReports,
  listMyReports,
  getReport,
} = require('../controllers/reportController');

const { requireAuth } = require('../middleware/auth');
const { requireInRegion } = require('../middleware/regionCheck');
const upload = require('../middleware/upload');

// 지도 조회 - 인증/지역 제한 없음
router.get('/', listReports);

// 내 제보 목록 - 인증 필수
router.get('/mine', requireAuth, listMyReports);

// 제보 상세
router.get('/:id', getReport);

// 제보 등록 - 인증 필수 + 지역(월계1동) 내에서만 가능 + 사진 최대 3장
router.post(
  '/',
  requireAuth,
  upload.array('images', 3),
  requireInRegion,
  createReport
);

module.exports = router;
