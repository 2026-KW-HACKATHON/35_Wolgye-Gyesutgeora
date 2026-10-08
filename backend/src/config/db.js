const { Pool } = require('pg');

// Neon(또는 Supabase/Railway) 등 클라우드 PostgreSQL 은 SSL 을 요구합니다.
// 로컬 PostgreSQL 은 보통 SSL 이 꺼져 있으므로 환경에 따라 분기합니다.
//   DB_SSL=true          → 명시적으로 SSL 사용
//   process.env.VERCEL    → Vercel 환경이면 자동으로 SSL 사용
const useSSL = process.env.DB_SSL === 'true' || !!process.env.VERCEL;

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'walkmap',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  // 서버리스에서는 함수 인스턴스마다 커넥션을 새로 만들 수 있어 max 를 작게 둡니다.
  // Neon 은 접속 URL 에 "-pooler" 가 붙은 pooler 엔드포인트를 쓰면 pgbouncer 가
  // 다수 커넥션을 흡수합니다 (운영 권장).
  max: parseInt(process.env.DB_POOL_MAX || '2'),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected DB error', err);
});

module.exports = pool;
