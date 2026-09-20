const express = require('express');
const router = express.Router();

const {
  createReport,
  listReports,
  listMyReports,
  getReport,
  updateReportStatus,
} = require('../controllers/reportController');

const { requireAuth, requireAdmin } = require('../middleware/auth');
const { requireInRegion } = require('../middleware/regionCheck');
const upload = require('../middleware/upload');

// 지도 조회 - 인증/지역 제한 없음
// 프론트: GET /api/reports?status=approved 로 승인된 제보만 지도에 표시
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

// 관리자 전용: 제보 상태 변경 + 승인 시 포인트 자동 지급
// PATCH /api/reports/:id/status  body: { status: 'approved' | 'rejected' | 'duplicate' }
router.patch('/:id/status', requireAuth, requireAdmin, updateReportStatus);

module.exports = router;
