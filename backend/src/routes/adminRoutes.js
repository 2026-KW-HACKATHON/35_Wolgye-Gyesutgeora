const express = require('express');
const router = express.Router();

const {
  adminListFlags,
  adminUpdateFlag,
  adminListChangeReports,
  adminReviewChangeReport,
} = require('../controllers/moderationController');

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
// PATCH /api/admin/change-reports/:id  body: { action: accept|dismiss, accessibility_status?, status? }
router.get('/change-reports', adminListChangeReports);
router.patch('/change-reports/:id', adminReviewChangeReport);

module.exports = router;
