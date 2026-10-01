const pool = require('../config/db');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** 양의 정수로 파싱. 잘못된 값이면 null */
function parsePositiveInt(v) {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** ILIKE 와일드카드(%, _, \) 이스케이프 — 검색어를 문자 그대로 매칭 */
const escapeLike = s => s.replace(/[\\%_]/g, '\\$&');

/**
 * GET /api/admin/users 🔒 admin
 * 회원 목록 (페이지 나누기 + 검색). 비밀번호 해시는 절대 조회하지 않는다.
 *
 * 쿼리:
 *   page   : 페이지 번호 (기본 1)
 *   limit  : 페이지당 개수 (기본 20, 최대 100)
 *   q      : 아이디·닉네임 부분 일치 검색 (대소문자 무시)
 *   role   : user | admin
 *   active : true | false (is_active 필터)
 *
 * 응답: { users: [{ id, username, nickname, role, points, is_active, report_count, created_at, updated_at }],
 *         pagination: { page, limit, total, total_pages } }
 * 정렬: 가입 최신순
 */
async function adminListUsers(req, res) {
  const page = parsePositiveInt(req.query.page);
  const limit = parsePositiveInt(req.query.limit);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const { role, active } = req.query;

  if (page === null) {
    return res.status(400).json({ error: 'page는 1 이상의 정수여야 합니다.', code: 'INVALID_PAGE' });
  }
  if (limit === null || (limit !== undefined && limit > MAX_LIMIT)) {
    return res.status(400).json({
      error: `limit은 1~${MAX_LIMIT} 사이의 정수여야 합니다.`,
      code: 'INVALID_LIMIT',
    });
  }
  if (role !== undefined && !['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'role은 user 또는 admin이어야 합니다.', code: 'INVALID_ROLE' });
  }
  if (active !== undefined && !['true', 'false'].includes(active)) {
    return res.status(400).json({ error: 'active는 true 또는 false여야 합니다.', code: 'INVALID_ACTIVE' });
  }

  const pageNo = page ?? 1;
  const pageSize = limit ?? DEFAULT_LIMIT;

  try {
    const params = [];
    const conds = [];

    if (q) {
      params.push(`%${escapeLike(q)}%`);
      conds.push(`(u.username ILIKE $${params.length} OR u.nickname ILIKE $${params.length})`);
    }
    if (role) {
      params.push(role);
      conds.push(`u.role = $${params.length}`);
    }
    if (active !== undefined) {
      params.push(active === 'true');
      conds.push(`u.is_active = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM users u ${where}`, params);
    const total = countRes.rows[0].total;

    const listParams = [...params, pageSize, (pageNo - 1) * pageSize];
    const { rows } = await pool.query(
      `SELECT
         u.id, u.username, u.nickname, u.role, u.points, u.is_active,
         u.created_at, u.updated_at,
         (SELECT COUNT(*)::int FROM reports r WHERE r.user_id = u.id) AS report_count
       FROM users u
       ${where}
       ORDER BY u.created_at DESC, u.id
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    return res.json({
      users: rows,
      pagination: {
        page: pageNo,
        limit: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

module.exports = { adminListUsers };
