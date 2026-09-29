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

const { requireAuth, requireAdmin, optionalAuth } = require('../middleware/auth');
const { requireInRegion } = require('../middleware/regionCheck');
const upload = require('../middleware/upload');

// 지도 조회 - 인증/지역 제한 없음
// 비로그인·일반 사용자에게는 승인(approved)된 제보만 보인다.
// 관리자 토큰이 있으면 ?status= 로 pending/rejected/duplicate 도 조회 가능(생략 시 전체).
router.get('/', optionalAuth, listReports);

// 내 제보 목록 - 인증 필수 (내 제보는 상태와 관계없이 모두 보임)
router.get('/mine', requireAuth, listMyReports);

// 제보 상세 - 승인된 제보는 누구나, 미승인 제보는 작성자 본인·관리자만
router.get('/:id', optionalAuth, getReport);

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

// 관리자 전용: 제보 상태 변경 + 승인 시 포인트 자동 지급, 승인 취소 시 자동 회수
// PATCH /api/reports/:id/status  body: { status: 'approved' | 'rejected' | 'duplicate' }
router.patch('/:id/status', requireAuth, requireAdmin, updateReportStatus);

// 관리자 전용: 제보 삭제 (연관 데이터 + 사진 파일까지 삭제, 지급된 포인트는 회수)
// DELETE /api/reports/:id
router.delete('/:id', requireAuth, requireAdmin, deleteReport);

module.exports = router;
