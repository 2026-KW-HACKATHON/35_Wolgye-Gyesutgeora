const express = require('express');
const router = express.Router();
const {
  checkUsername,
  checkNickname,
  register,
  login,
  logout,
  me,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

router.get('/check-username', checkUsername);
router.get('/check-nickname', checkNickname);
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);          // 웹: 쿠키 만료 처리
router.get('/me', requireAuth, me);

module.exports = router;
