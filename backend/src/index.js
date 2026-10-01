require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const reportRoutes = require('./routes/reportRoutes');
const tagRoutes = require('./routes/tagRoutes');
const adminRoutes = require('./routes/adminRoutes');
const pointRoutes = require('./routes/pointRoutes');
const routeRoutes = require('./routes/routeRoutes');

const app = express();

// ── 보안 헤더 (웹 브라우저 대상) ───────────────────────────────────────────
// 프론트엔드가 같은 서버에서 서빙되므로 CSP를 명시적으로 설정
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'", 'cdnjs.cloudflare.com'],
        styleSrc:    ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
        imgSrc:      ["'self'", 'data:', '*.tile.openstreetmap.org'],
        // 인터넷 장소 검색(Nominatim)만 외부 접속 허용
        connectSrc:  ["'self'", 'https://nominatim.openstreetmap.org'],
        fontSrc:     ["'self'"],
        objectSrc:   ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    // 웹에서 iframe 삽입 방지
    frameguard: { action: 'deny' },
  })
);

// ── 응답 압축 (텍스트·JSON·HTML 모두 gzip) ───────────────────────────────
app.use(compression());

// ── CORS ─────────────────────────────────────────────────────────────────
// 프론트를 같은 서버에서 서빙하면 CORS 불필요.
// 외부 클라이언트(앱, 개발용 로컬 서버 등)가 필요하면 .env의 CORS_ORIGIN에
// 쉼표로 구분해 추가: CORS_ORIGIN=https://example.com,http://localhost:5173
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length
      ? (origin, cb) => {
          // 서버 자체 요청(origin 없음) 또는 허용 목록
          if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
          cb(new Error('CORS: 허용되지 않은 출처입니다.'));
        }
      : false, // CORS_ORIGIN 미설정 → same-origin 전용
    credentials: true, // 쿠키 포함 요청 허용
  })
);

// ── 쿠키 파서 ─────────────────────────────────────────────────────────────
app.use(cookieParser(process.env.COOKIE_SECRET || process.env.JWT_SECRET));

// ── 요청 속도 제한 (Rate Limiting) ───────────────────────────────────────
// 한도는 환경변수로 조정합니다(미설정 시 기본값). 전시처럼 한 IP(공용 와이파이)에서
// 많은 사람이 접속하는 경우 .env / Vercel 환경변수에서 값을 올리세요. .env.example 참고.
const limitFromEnv = (name, fallback) => {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const API_MAX = limitFromEnv('RATE_LIMIT_API_MAX', 100);
const AUTH_MAX = limitFromEnv('RATE_LIMIT_AUTH_MAX', 20);
const REPORT_MAX = limitFromEnv('RATE_LIMIT_REPORT_MAX', 20);
const CHANGE_REPORT_MAX = limitFromEnv('RATE_LIMIT_CHANGE_REPORT_MAX', 20);

// 전체 API: 15분 내 API_MAX건 (기본 100)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: API_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});
app.use('/api', apiLimiter);

// 인증 관련 엔드포인트: 15분 내 AUTH_MAX건 (기본 20, 브루트포스 방어)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '인증 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// 제보 등록: 1시간 내 REPORT_MAX건 (기본 20)
// (신고/변경신고 등 하위 POST 엔드포인트는 제외하고, 제보 생성(POST /api/reports)에만 적용)
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: REPORT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: `제보 등록은 1시간에 최대 ${REPORT_MAX}건까지 가능합니다.` },
});
// 정보 변경 신고(사진 업로드 포함): 1시간 내 CHANGE_REPORT_MAX건 (기본 20)
const changeReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: CHANGE_REPORT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: `정보 변경 신고는 1시간에 최대 ${CHANGE_REPORT_MAX}건까지 가능합니다.` },
});
app.use('/api/reports', (req, res, next) => {
  // 이 미들웨어 기준 req.path는 '/api/reports' 이후 경로 → 생성은 정확히 '/'
  if (req.method === 'POST' && req.path === '/') return reportLimiter(req, res, next);
  // 변경 신고는 '/:id/change-report'
  if (req.method === 'POST' && /^\/[^/]+\/change-report$/.test(req.path)) {
    return changeReportLimiter(req, res, next);
  }
  next();
});

// ── 바디 파서 ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── 업로드 사진 정적 서빙 ─────────────────────────────────────────────────
const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
app.use('/uploads', express.static(UPLOAD_DIR));

// ── 헬스체크 ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── API 라우트 ────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/points', pointRoutes);
app.use('/api/route', routeRoutes);

// ── 프론트엔드 정적 파일 서빙 (웹 배포) ──────────────────────────────────
// FRONTEND_DIR 환경변수로 경로 변경 가능. 기본값: ../frontend/web
const FRONTEND_DIR = process.env.FRONTEND_DIR
  ? path.resolve(process.env.FRONTEND_DIR)
  : path.join(__dirname, '../../frontend/web');

app.use(express.static(FRONTEND_DIR));

// SPA Fallback: /api, /uploads 외 모든 GET → index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return next();
  }
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ── 404 ───────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: '요청한 API를 찾을 수 없습니다.' });
});

// ── 에러 핸들러 ───────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);

  if (err.message?.includes('이미지 파일만')) {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: '파일 용량이 너무 큽니다. (최대 10MB)' });
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: '사진은 images 필드로 최대 3장까지 첨부할 수 있습니다.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '요청 본문(JSON) 형식이 올바르지 않습니다.' });
  }
  if (err.message?.includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`월계1동 보행 지도 서버 실행 중: http://localhost:${PORT}`);
});
