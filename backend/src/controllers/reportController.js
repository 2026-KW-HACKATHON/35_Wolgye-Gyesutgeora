const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { removeUploadedFiles } = require('../utils/files');
const { changeReportStatus, revokeAwardedPoints } = require('../utils/points');

// 업로드 사진 저장 폴더 (upload.js와 동일 규칙)
const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');

const STATUSES = ['pending', 'approved', 'rejected', 'duplicate'];
const ACCESSIBILITY_STATUSES = ['passable', 'inconvenient', 'impassable'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/reports
 * 불편 구간 제보 등록 (기획안 핵심 기능)
 * - 인증 필수 (req.user.id)
 * - 지역 검증은 requireInRegion 미들웨어에서 먼저 처리됨
 * - 사진 최소 1장 필수 (기획안: "사진 촬영(필수)")
 * - multipart/form-data:
 *     latitude, longitude,
 *     accessibility_status (passable|inconvenient|impassable, 선택),
 *     title?, description?,
 *     tag_ids (comma-separated),
 *     images (files, 최대 3장)
 */
async function createReport(req, res) {
  const { latitude, longitude, title, description, tag_ids, accessibility_status } = req.body;
  const userId = req.user.id;
  const files = req.files || [];

  if (files.length === 0) {
    return res.status(400).json({ error: '사진을 최소 1장 첨부해야 합니다.' });
  }

  // accessibility_status 값 검증 (전달된 경우에만)
  if (accessibility_status && !ACCESSIBILITY_STATUSES.includes(accessibility_status)) {
    removeUploadedFiles(req);
    return res.status(400).json({
      error: `accessibility_status는 ${ACCESSIBILITY_STATUSES.join(', ')} 중 하나여야 합니다.`,
    });
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
      `INSERT INTO reports (user_id, title, description, latitude, longitude, accessibility_status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, title, description, latitude, longitude, accessibility_status, status, created_at`,
      [userId, title || null, description || null, latitude, longitude, accessibility_status || null]
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
 * 공개 범위 (optionalAuth 뒤에서 실행):
 *   - 비로그인·일반 사용자: 항상 승인(approved)된 제보만. status를 생략하면 approved로 간주하고,
 *     approved 이외의 status를 요청하면 403.
 *   - 관리자: query status로 원하는 상태를 조회. 생략하면 전체.
 *
 * query: status (선택) - pending | approved | rejected | duplicate
 */
async function listReports(req, res) {
  let status = req.query.status;
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status는 ${STATUSES.join(', ')} 중 하나여야 합니다.` });
  }

  if (req.user?.role !== 'admin') {
    if (status && status !== 'approved') {
      return res.status(403).json({
        error: '승인된 제보만 조회할 수 있습니다.',
        code: 'FORBIDDEN_STATUS',
      });
    }
    status = 'approved';
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
         r.id, r.title, r.description,
         r.latitude::float8 AS latitude, r.longitude::float8 AS longitude,
         r.accessibility_status, r.status, r.view_count, r.created_at,
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
         r.id, r.title, r.description,
         r.latitude::float8 AS latitude, r.longitude::float8 AS longitude,
         r.accessibility_status, r.status, r.created_at,
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
 * 제보 상세 조회 (optionalAuth 뒤에서 실행).
 * - 승인된 제보: 누구나 조회, 조회수 증가
 * - 미승인(pending/rejected/duplicate) 제보: 작성자 본인과 관리자만 조회, 조회수는 올리지 않음
 *   그 외에는 존재 여부가 드러나지 않도록 404
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

    if (report.status !== 'approved') {
      const isAdmin = req.user?.role === 'admin';
      const isOwner = !!req.user && req.user.id === report.user_id;
      if (!isAdmin && !isOwner) {
        return res.status(404).json({ error: '제보를 찾을 수 없습니다.' });
      }
    } else {
      await pool.query('UPDATE reports SET view_count = view_count + 1 WHERE id = $1', [req.params.id]);
    }
    return res.json({ report });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

/**
 * PATCH /api/reports/:id/status
 * 관리자 전용: 제보 상태 변경 + 승인 시 포인트 지급 / 승인 취소 시 포인트 회수
 *
 * body: { status: 'approved' | 'rejected' | 'duplicate' }
 *
 * 승인(approved) 처리 시:
 *   - reports.point_awarded가 FALSE인 경우에만 포인트 지급 (중복 방지)
 *   - users.points += POINTS_PER_APPROVAL, point_transactions에 earn 기록
 * 승인된 제보를 rejected/duplicate로 바꾸면:
 *   - 지급된 포인트만큼 users.points 차감(0 미만 불가), point_transactions에 revoke 기록
 *   - point_awarded를 FALSE로 되돌려 중복 회수를 막고, 다시 승인하면 새로 지급
 * 실제 처리는 utils/points.js의 changeReportStatus에서 한다.
 */
async function updateReportStatus(req, res) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(404).json({ error: '제보를 찾을 수 없습니다.' });
  }

  const { status } = req.body;
  // pending으로의 역전환은 허용하지 않음 (의도치 않은 조작 방지)
  const ALLOWED = ['approved', 'rejected', 'duplicate'];
  if (!status || !ALLOWED.includes(status)) {
    return res.status(400).json({
      error: `status는 ${ALLOWED.join(', ')} 중 하나여야 합니다.`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 상태 변경 + 포인트 지급/회수 (제보 행을 잠근 채로 처리)
    const result = await changeReportStatus(client, id, status);
    if (!result) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '제보를 찾을 수 없습니다.' });
    }

    await client.query('COMMIT');

    const updated = await getReportById(id);
    return res.json({
      report: updated,
      ...(result.pointsAwarded > 0 && { points_awarded: result.pointsAwarded }),
      ...(result.pointsRevoked > 0 && { points_revoked: result.pointsRevoked }),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/reports/:id
 * 관리자 전용: 제보 완전 삭제 (하드 삭제)
 *
 * - report_tags / report_images / report_flags / report_change_reports 는
 *   외래키 ON DELETE CASCADE로 함께 삭제됨
 * - 단, uploads/ 폴더의 실제 사진 파일은 DB만으로는 지워지지 않으므로
 *   삭제 전에 파일명을 조회해 두었다가 직접 unlink 한다.
 * - 승인되어 지급된 포인트는 회수한다(users.points 차감 + point_transactions에 revoke 기록).
 *   내역은 제보가 삭제돼도 남는다(report_id는 NULL, 제목은 사본 유지).
 */
async function deleteReport(req, res) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(404).json({ error: '제보를 찾을 수 없습니다.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 행을 잠가 동시 승인/삭제와 겹쳐도 포인트가 한 번만 회수되게 한다
    const { rows: exists } = await client.query(
      `SELECT id, user_id, title, point_awarded, points_amount
       FROM reports WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (exists.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '제보를 찾을 수 없습니다.' });
    }
    const report = exists[0];

    // 삭제 전에 물리 파일명 확보
    const { rows: images } = await client.query(
      'SELECT filename FROM report_images WHERE report_id = $1',
      [id]
    );

    // 지급된 포인트 회수 (기록은 report_id가 NULL로 바뀌어도 남음)
    const pointsRevoked = report.point_awarded
      ? await revokeAwardedPoints(client, report, 'report_deleted')
      : 0;

    // reports 삭제 → 연관 테이블 CASCADE 삭제
    await client.query('DELETE FROM reports WHERE id = $1', [id]);

    await client.query('COMMIT');

    // DB에서 지운 뒤 실제 사진 파일 삭제 (실패해도 요청은 성공 처리)
    for (const img of images) {
      if (!img.filename) continue;
      fs.unlink(path.join(UPLOAD_DIR, img.filename), () => {});
    }

    return res.json({
      message: '제보를 삭제했습니다.',
      deleted_id: id,
      ...(pointsRevoked > 0 && { points_revoked: pointsRevoked }),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------
// 내부 유틸
// ------------------------------------------------------------

async function getReportById(id) {
  const { rows } = await pool.query(
    `SELECT
       r.id, r.user_id, r.title, r.description,
       r.latitude::float8 AS latitude, r.longitude::float8 AS longitude,
       r.address, r.accessibility_status, r.status,
       r.point_awarded, r.points_amount,
       r.view_count, r.created_at, r.updated_at,
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

module.exports = { createReport, listReports, listMyReports, getReport, updateReportStatus, deleteReport };
