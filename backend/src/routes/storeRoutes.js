const express = require('express');
const router = express.Router();

const { redeem } = require('../controllers/storeController');
const { requireAuth } = require('../middleware/auth');

// 지역 상점 포인트 교환 - 인증 필수
// POST /api/store/redeem  body: { item_id }
router.post('/redeem', requireAuth, redeem);

module.exports = router;
