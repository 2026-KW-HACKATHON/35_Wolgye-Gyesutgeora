const express = require('express');
const router = express.Router();

const {
  createReport,
  listReports,
  listMyReports,
  getReport,
  updateReportStatus,
  deleteReport,
} = require('../controllers/reportController');

const {
  createFlag,
  createChangeReport,
} = require('../controllers/moderationController');

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

// 잘못된 정보 신고 - 인증 필수
// POST /api/reports/:id/flags  body: { reason, description? }
router.post('/:id/flags', requireAuth, createFlag);

// 정보 변경 신고(상황이 바뀜) - 인증 필수
// POST /api/reports/:id/change-report  body: { reason, description? }
router.post('/:id/change-report', requireAuth, createChangeReport);

// 관리자 전용: 제보 상태 변경 + 승인 시 포인트 자동 지급
// PATCH /api/reports/:id/status  body: { status: 'approved' | 'rejected' | 'duplicate' }
router.patch('/:id/status', requireAuth, requireAdmin, updateReportStatus);

// 관리자 전용: 제보 삭제 (연관 데이터 + 사진 파일까지 삭제)
// DELETE /api/reports/:id
router.delete('/:id', requireAuth, requireAdmin, deleteReport);

module.exports = router;
