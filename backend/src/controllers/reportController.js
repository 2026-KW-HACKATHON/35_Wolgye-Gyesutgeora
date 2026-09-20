const pool = require('../config/db');
const { removeUploadedFiles } = require('../utils/files');

const STATUSES = ['pending', 'approved', 'rejected', 'duplicate'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/reports
 * 불편 구간 제보 등록 (기획안 핵심 기능)
 * - 인증 필수 (req.user.id)
 * - 지역 검증은 requireInRegion 미들웨어에서 먼저 처리됨
 * - 사진 최소 1장 필수 (기획안: "사진 촬영(필수)")
 * - multipart/form-data: latitude, longitude, title?, description?, tag_ids(comma-separated), images(files, 최대 3장)
 */
async function createReport(req, res) {
  const { latitude, longitude, title, description, tag_ids } = req.body;
  const userId = req.user.id;
  const files = req.files || [];

  if (files.length === 0) {
    return res.status(400).json({ error: '사진을 최소 1장 첨부해야 합니다.' });
  }

  const tagIdList = [...new Set(parseTagIds(tag_ids))];
  if (tagIdList.length === 0) {
    removeUploadedFiles(req);
    return res.status(400).json({ error: '태그를 최소 1개 이상 선택해야 합니다.' });
  }

  const client = await pool.connect();
  try {
    const valid = await client.query('SELECT id FROM tags WHERE id = ANY($1::int[])', [tagIdList]);
    if (valid.rows.length !== tagIdList.length) {
      removeUploadedFiles(req);
      return res.status(400).json({ error: '존재하지 않는 태그가 포함되어 있습니다.' });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO reports (user_id, title, description, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, title, description, latitude, longitude, status, created_at`,
      [userId, title || null, description || null, latitude, longitude]
    );
    const report = rows[0];

    // 태그 연결
    for (const tagId of tagIdList) {
      await client.query(
        'INSERT INTO report_tags (report_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [report.id, tagId]
      );
    }

    // 이미지 연결
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      await client.query(
        `INSERT INTO report_images (report_id, filename, original, url, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [report.id, file.filename, file.originalname, `/uploads/${file.filename}`, i]
      );
    }

    await client.query('COMMIT');

    const full = await getReportById(report.id);
    return res.status(201).json({ report: full });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    removeUploadedFiles(req);
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  } finally {
    client.release();
  }
}

/**
 * GET /api/reports
 * 지도에 표시할 제보 목록 조회. 인증/지역 제한 없음
 * (다른 지역에서도 월계1동 지도를 미리 확인할 수 있어야 하므로)
 *
 * query: status (선택) - 생략 시 전체 상태 노출
 */
async function listReports(req, res) {
  const status = req.query.status; // 'pending' | 'approved' | 'rejected' | 'duplicate' | undefined(all)
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status는 ${STATUSES.join(', ')} 중 하나여야 합니다.` });
  }

  try {
    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE r.status = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT
         r.id, r.title, r.description, r.latitude::float8 AS latitude, r.longitude::float8 AS longitude,
         r.status, r.view_count, r.created_at,
         u.nickname AS reporter_nickname,
         COALESCE(
           ARRAY_AGG(DISTINCT t.code) FILTER (WHERE t.code IS NOT NULL), '{}'
         ) AS tags,
         COALESCE(
           (SELECT ARRAY_AGG(ri.url ORDER BY ri.sort_order)
            FROM report_images ri WHERE ri.report_id = r.id), '{}'
         ) AS images
       FROM reports r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN report_tags rt ON rt.report_id = r.id
       LEFT JOIN tags t ON t.id = rt.tag_id
       ${where}
       GROUP BY r.id, u.nickname
       ORDER BY r.created_at DESC`,
      params
    );

    return res.json({ reports: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

/**
 * GET /api/reports/mine
 * 내가 등록한 제보 목록 (인증 필수)
 */
async function listMyReports(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT
         r.id, r.title, r.description, r.latitude::float8 AS latitude, r.longitude::float8 AS longitude,
         r.status, r.created_at,
         COALESCE(
           ARRAY_AGG(DISTINCT t.code) FILTER (WHERE t.code IS NOT NULL), '{}'
         ) AS tags,
         COALESCE(
           (SELECT ARRAY_AGG(ri.url ORDER BY ri.sort_order)
            FROM report_images ri WHERE ri.report_id = r.id), '{}'
         ) AS images
       FROM reports r
       LEFT JOIN report_tags rt ON rt.report_id = r.id
       LEFT JOIN tags t ON t.id = rt.tag_id
       WHERE r.user_id = $1
       GROUP BY r.id
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    return res.json({ reports: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

/**
 * GET /api/reports/:id
 * 제보 상세 조회. 조회수 증가.
 */
async function getReport(req, res) {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(404).json({ error: '제보를 찾을 수 없습니다.' });
  }
  try {
    const report = await getReportById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: '제보를 찾을 수 없습니다.' });
    }
    await pool.query('UPDATE reports SET view_count = view_count + 1 WHERE id = $1', [req.params.id]);
    return res.json({ report });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

// ------------------------------------------------------------
// 내부 유틸
// ------------------------------------------------------------

async function getReportById(id) {
  const { rows } = await pool.query(
    `SELECT
       r.id, r.user_id, r.title, r.description, r.latitude::float8 AS latitude, r.longitude::float8 AS longitude,
       r.address, r.status, r.view_count, r.created_at, r.updated_at,
       u.nickname AS reporter_nickname,
       COALESCE(
         ARRAY_AGG(DISTINCT t.code) FILTER (WHERE t.code IS NOT NULL), '{}'
       ) AS tags,
       COALESCE(
         (SELECT ARRAY_AGG(ri.url ORDER BY ri.sort_order)
          FROM report_images ri WHERE ri.report_id = r.id), '{}'
       ) AS images
     FROM reports r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN report_tags rt ON rt.report_id = r.id
     LEFT JOIN tags t ON t.id = rt.tag_id
     WHERE r.id = $1
     GROUP BY r.id, u.nickname`,
    [id]
  );
  return rows[0] || null;
}

function parseTagIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(v => parseInt(v)).filter(v => !Number.isNaN(v));
  }
  return String(raw)
    .split(',')
    .map(v => parseInt(v.trim()))
    .filter(v => !Number.isNaN(v));
}

module.exports = { createReport, listReports, listMyReports, getReport };
