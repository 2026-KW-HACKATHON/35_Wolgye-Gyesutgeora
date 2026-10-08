// Vercel 서버리스 함수 진입점.
// 모든 /api/* 요청은 vercel.json 의 rewrite 로 이 파일로 들어오고,
// Express 앱(backend/src/index.js)에서 라우팅을 처리합니다.
module.exports = require('../backend/src/index.js');
