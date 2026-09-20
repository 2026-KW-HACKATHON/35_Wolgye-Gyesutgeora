const jwt = require('jsonwebtoken');

/**
 * JWT 인증 미들웨어
 *
 * 웹 환경에서는 두 가지 방식을 모두 지원합니다.
 *   1. Authorization: Bearer <token>  — 기존 방식 (앱 / fetch 요청)
 *   2. httpOnly 쿠키 (access_token)   — 웹 브라우저 권장 방식
 *
 * 두 방식이 동시에 있으면 Authorization 헤더를 우선합니다.
 */
function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, username, nickname, role }
    next();
  } catch {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
}

/**
 * 어드민 전용 미들웨어 (requireAuth 이후 사용)
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  }
  next();
}

/**
 * 요청에서 JWT를 추출합니다.
 *   - Authorization: Bearer <token> 헤더 우선
 *   - 없으면 쿠키(access_token) 확인
 */
function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice(7);
  }
  // cookie-parser가 등록되어 있어야 req.cookies가 존재함
  return req.cookies?.access_token ?? null;
}

module.exports = { requireAuth, requireAdmin };
