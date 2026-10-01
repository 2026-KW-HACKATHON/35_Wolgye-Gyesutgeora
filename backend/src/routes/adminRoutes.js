const express = require('express');
const router = express.Router();

const {
  adminListFlags,
  adminUpdateFlag,
  adminListChangeReports,
  adminReviewChangeReport,
} = require('../controllers/moderationController');

const { adminListUsers } = require('../controllers/adminUserController');

const { requireAuth, requireAdmin } = require('../middleware/auth');

// 모든 /api/admin/* 는 관리자 토큰 필요
router.use(requireAuth, requireAdmin);

// 잘못된 정보 신고
// GET   /api/admin/flags?status=open|resolved|dismissed
// PATCH /api/admin/flags/:id   body: { status: resolved | dismissed }
router.get('/flags', adminListFlags);
router.patch('/flags/:id', adminUpdateFlag);

// 정보 변경 신고
// GET   /api/admin/change-reports?status=open|accepted|dismissed
// PATCH /api/admin/change-reports/:id  body: { action: accept|dismiss, accessibility_status?, title?, description?, tag_ids?, status? }
//   accept → 신고 사유별로 원본 제보 자동 반영 + 신고자에게 포인트 지급(기본 30). 접수(open) 상태만 처리 가능
router.get('/change-reports', adminListChangeReports);
router.patch('/change-reports/:id', adminReviewChangeReport);

// 회원 목록 (페이지 나누기·검색, 비밀번호 해시 제외)
// GET /api/admin/users?page=1&limit=20&q=검색어&role=user|admin&active=true|false
// ※ 회원 정지·탈퇴 처리는 정책 결정 후 별도 구현
router.get('/users', adminListUsers);

module.exports = router;
