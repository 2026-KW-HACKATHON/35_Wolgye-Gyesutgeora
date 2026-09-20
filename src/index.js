require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const reportRoutes = require('./routes/reportRoutes');
const tagRoutes = require('./routes/tagRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 업로드된 제보 사진 정적 서빙
const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
app.use('/uploads', express.static(UPLOAD_DIR));

// 헬스체크
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// API 라우트
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/tags', tagRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: '요청한 API를 찾을 수 없습니다.' });
});

// multer 등에서 발생하는 에러 처리
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
  return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`월계1동 보행 지도 API 서버 실행 중: http://localhost:${PORT}`);
});
