/**
 * 관리자 계정 1개 생성/전환 스크립트 (단일 관리자 운영용)
 *
 * 사용법:
 *   node scripts/create-admin.js <아이디> <닉네임> <비밀번호>
 *   예) node scripts/create-admin.js wgadmin 월계관리자 'Str0ngPass!'
 *
 * 동작:
 *   - 아이디가 없으면: role='admin' 계정을 새로 만듭니다.
 *   - 아이디가 이미 있으면: 그 계정을 role='admin'으로 승격하고, (선택) 비밀번호를 갱신합니다.
 *
 * 특징:
 *   - 일반 회원가입(POST /api/auth/register)으로는 admin이 생성되지 않습니다.
 *     관리자 계정은 반드시 이 스크립트(또는 scripts/set-admin.sql)로만 만듭니다.
 *   - 서버 시작 시 자동 생성하지 않습니다. 관리자는 1개만 두고 수동 관리합니다.
 *
 * 주의: .env의 DB 접속 정보를 사용하므로, backend/ 폴더에서 실행하세요.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const USERNAME_RE = /^[a-z0-9_]{4,20}$/;

async function main() {
  const [, , rawUsername, rawNickname, password] = process.argv;

  if (!rawUsername || !rawNickname || !password) {
    console.error('사용법: node scripts/create-admin.js <아이디> <닉네임> <비밀번호>');
    process.exit(1);
  }

  const username = String(rawUsername).trim().toLowerCase();
  const nickname = String(rawNickname).trim();

  if (!USERNAME_RE.test(username)) {
    console.error('아이디는 영문 소문자·숫자·밑줄(_) 4~20자여야 합니다.');
    process.exit(1);
  }
  if (nickname.length < 2 || nickname.length > 20) {
    console.error('닉네임은 2~20자여야 합니다.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('비밀번호는 8자 이상이어야 합니다.');
    process.exit(1);
  }

  const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'walkmap',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    const hash = await bcrypt.hash(password, 12);

    // 이미 있으면 admin 승격 + 비밀번호 갱신, 없으면 새로 생성
    const { rows } = await pool.query(
      `INSERT INTO users (username, nickname, password, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (username)
       DO UPDATE SET role = 'admin', password = EXCLUDED.password
       RETURNING id, username, nickname, role, created_at`,
      [username, nickname, hash]
    );

    const u = rows[0];
    console.log('관리자 계정이 준비되었습니다:');
    console.log(`  id:       ${u.id}`);
    console.log(`  username: ${u.username}`);
    console.log(`  nickname: ${u.nickname}`);
    console.log(`  role:     ${u.role}`);
    console.log('\nadmin.html 에서 위 아이디/비밀번호로 로그인하세요.');
  } catch (err) {
    // 닉네임 중복 등
    if (err.code === '23505') {
      console.error('닉네임이 이미 사용 중입니다. 다른 닉네임으로 다시 시도하세요.');
    } else {
      console.error('실패:', err.message);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
