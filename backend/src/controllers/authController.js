const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// 아이디: 영문 소문자·숫자·밑줄 4~20자 (대문자로 입력해도 소문자로 저장)
const USERNAME_RE = /^[a-z0-9_]{4,20}$/;
const USERNAME_RULE = '아이디는 영문·숫자·밑줄(_) 4~20자여야 합니다.';
const NICKNAME_RULE = '닉네임은 2~20자여야 합니다.';

const normUsername = v => String(v || '').trim().toLowerCase();
const normNickname = v => String(v || '').trim();
const validUsername = v => USERNAME_RE.test(v);
const validNickname = v => v.length >= 2 && v.length <= 20;

/**
 * 쿠키 옵션 (웹 브라우저용 httpOnly 쿠키)
 * HTTPS 환경(운영)에서는 secure: true가 되도록 환경변수로 제어합니다.
 */
function cookieOptions() {
  const maxAge = parseDurationMs(process.env.JWT_EXPIRES_IN || '7d');
  return {
    httpOnly: true,                                        // JS 접근 차단 (XSS 방어)
    secure: process.env.NODE_ENV === 'production',        // HTTPS에서만 전송
    sameSite: process.env.NODE_ENV === 'production'
      ? 'strict'
      : 'lax',
    maxAge,
  };
}

/**
 * '7d', '24h', '60m' 같은 JWT 만료 문자열 → 밀리초 변환
 */
function parseDurationMs(str) {
  const n = parseInt(str);
  if (str.endsWith('d')) return n * 24 * 60 * 60 * 1000;
  if (str.endsWith('h')) return n * 60 * 60 * 1000;
  if (str.endsWith('m')) return n * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000; // fallback: 7일
}

/**
 * GET /api/auth/check-username?username=...
 * 가입 화면의 "아이디 중복 확인" 버튼용
 */
async function checkUsername(req, res) {
  const username = normUsername(req.query.username);
  if (!validUsername(username)) {
    return res.status(400).json({ error: USERNAME_RULE, code: 'INVALID_USERNAME' });
  }
  try {
    const { rows } = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    const available = rows.length === 0;
    return res.json({
      available,
      message: available ? '사용 가능한 아이디입니다.' : '이미 사용 중인 아이디입니다.',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

/**
 * GET /api/auth/check-nickname?nickname=...
 * 가입 화면의 "닉네임 중복 확인" 버튼용
 */
async function checkNickname(req, res) {
  const nickname = normNickname(req.query.nickname);
  if (!validNickname(nickname)) {
    return res.status(400).json({ error: NICKNAME_RULE, code: 'INVALID_NICKNAME' });
  }
  try {
    const { rows } = await pool.query('SELECT 1 FROM users WHERE nickname = $1', [nickname]);
    const available = rows.length === 0;
    return res.json({
      available,
      message: available ? '사용 가능한 닉네임입니다.' : '이미 사용 중인 닉네임입니다.',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

/**
 * POST /api/auth/register  { username, nickname, password }
 * 개인정보 없이 아이디·닉네임·비밀번호만으로 가입.
 * 성공 시 httpOnly 쿠키로 토큰을 발급하고, 응답 바디에도 포함합니다.
 */
async function register(req, res) {
  const username = normUsername(req.body.username);
  const nickname = normNickname(req.body.nickname);
  const password = req.body.password || '';

  if (!username || !nickname || !password) {
    return res.status(400).json({ error: 'username, nickname, password는 필수입니다.' });
  }
  if (!validUsername(username)) {
    return res.status(400).json({ error: USERNAME_RULE, code: 'INVALID_USERNAME' });
  }
  if (!validNickname(nickname)) {
    return res.status(400).json({ error: NICKNAME_RULE, code: 'INVALID_NICKNAME' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
  }

  try {
    const dup = await pool.query(
      'SELECT username, nickname FROM users WHERE username = $1 OR nickname = $2',
      [username, nickname]
    );
    if (dup.rows.some(r => r.username === username)) {
      return res.status(409).json({ error: '이미 사용 중인 아이디입니다.', code: 'USERNAME_TAKEN' });
    }
    if (dup.rows.some(r => r.nickname === nickname)) {
      return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.', code: 'NICKNAME_TAKEN' });
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (username, nickname, password)
       VALUES ($1, $2, $3)
       RETURNING id, username, nickname, role, points`,
      [username, nickname, hash]
    );

    const user = rows[0];
    const token = signToken(user);

    // 웹 브라우저: httpOnly 쿠키로 토큰 전달
    res.cookie('access_token', token, cookieOptions());

    return res.status(201).json({ token, user });
  } catch (err) {
    if (err.code === '23505') {
      const code = err.constraint?.includes('username') ? 'USERNAME_TAKEN' : 'NICKNAME_TAKEN';
      return res.status(409).json({ error: '이미 사용 중인 아이디 또는 닉네임입니다.', code });
    }
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

/**
 * POST /api/auth/login  { username, password }
 * 성공 시 httpOnly 쿠키로 토큰을 발급하고, 응답 바디에도 포함합니다.
 */
async function login(req, res) {
  const username = normUsername(req.body.username);
  const password = req.body.password || '';
  if (!username || !password) {
    return res.status(400).json({ error: 'username과 password가 필요합니다.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, username, nickname, password, role, points
         FROM users WHERE username = $1 AND is_active = TRUE`,
      [username]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const { password: _, ...safeUser } = user;
    const token = signToken(safeUser);

    // 웹 브라우저: httpOnly 쿠키로 토큰 전달
    res.cookie('access_token', token, cookieOptions());

    return res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

/**
 * POST /api/auth/logout
 * 웹 브라우저의 httpOnly 쿠키를 만료시킵니다.
 * 클라이언트가 Bearer 토큰 방식이면 클라이언트 측에서 토큰을 삭제하면 됩니다.
 */
function logout(req, res) {
  res.clearCookie('access_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  });
  return res.json({ message: '로그아웃 되었습니다.' });
}

/**
 * GET /api/auth/me
 */
async function me(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, nickname, role, points, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    return res.json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, nickname: user.nickname, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = { checkUsername, checkNickname, register, login, logout, me };
