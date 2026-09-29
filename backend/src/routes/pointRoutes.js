const express = require('express');
const router = express.Router();

const { pointHistory } = require('../controllers/pointController');
const { requireAuth } = require('../middleware/auth');

// 내 포인트 내역 - 인증 필수
// GET /api/points/history
router.get('/history', requireAuth, pointHistory);

module.exports = router;
