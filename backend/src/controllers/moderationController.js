const pool = require('../config/db');
const { changeReportStatus } = require('../utils/points');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FLAG_REASONS = ['bad_photo', 'wrong_info', 'duplicate', 'etc'];
const CHANGE_REASONS = [
  'obstacle_removed', 'construction_done', 'now_passable',
  'now_impassable', 'info_different', 'etc',
];
const ACCESSIBILITY_STATUSES = ['passable', 'inconvenient', 'impassable'];
const REPORT_STATUSES = ['pending', 'approved', 'rejected', 'duplicate'];

// ------------------------------------------------------------
// 사용자용: 잘못된 정보 신고
// POST /api/reports/:id/flags  🔒
// body: { reason: bad_photo|wrong_info|duplicate|etc, description? }
// ------------------------------------------------------------
async function createFlag(req, res) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(404).json({ error: '제보를 찾을 수 없습니다.' });
  }

  const { reason, description } = req.body;
  if (!reason || !FLAG_REASONS.includes(reason)) {
    return res.status(400).json({
      error: `reason은 ${FLAG_REASONS.join(', ')} 중 하나여야 합니다.`,
    });
  }

  try {
    const exists = await pool.query('SELECT id FROM reports WHERE id = $1', [id]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ error: '제보를 찾을 수 없습니다.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO report_flags (report_id, user_id, reason, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, report_id, reason, description, status, created_at`,
      [id, req.user.id, reason, (description || '').trim() || null]
    );

    return res.status(201).json({ flag: rows[0] });
  } catch (err) {
    // (report_id, user_id) UNIQUE 위반 → 이미 신고한 제보
    if (err.code === '23505') {
      return res.status(409).json({
        error: '이미 이 제보를 신고하셨어요. 검토 후 조치할게요.',
        code: 'ALREADY_FLAGGED',
      });
    }
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

// ------------------------------------------------------------
// 사용자용: 정보 변경 신고 (상황이 바뀜)
// POST /api/reports/:id/change-report  🔒
// body: { reason, description? }
// ------------------------------------------------------------
async function createChangeReport(req, res) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(404).json({ error: '제보를 찾을 수 없습니다.' });
  }

  const { reason, description } = req.body;
  if (!reason || !CHANGE_REASONS.includes(reason)) {
    return res.status(400).json({
      error: `reason은 ${CHANGE_REASONS.join(', ')} 중 하나여야 합니다.`,
    });
  }

  try {
    const exists = await pool.query('SELECT id FROM reports WHERE id = $1', [id]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ error: '제보를 찾을 수 없습니다.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO report_change_reports (report_id, user_id, reason, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, report_id, reason, description, status, created_at`,
      [id, req.user.id, reason, (description || '').trim() || null]
    );

    return res.status(201).json({ change_report: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

// ------------------------------------------------------------
// 관리자용: 잘못된 정보 신고 목록
// GET /api/admin/flags?status=open  🔒 admin
// ------------------------------------------------------------
async function adminListFlags(req, res) {
  const status = req.query.status;
  if (status && !['open', 'resolved', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: 'status는 open, resolved, dismissed 중 하나여야 합니다.' });
  }

  try {
    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE f.status = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT
         f.id, f.reason, f.description, f.status, f.created_at,
         f.report_id,
         reporter.nickname AS flagger_nickname,
         r.title  AS report_title,
         r.status AS report_status,
         r.accessibility_status AS report_accessibility_status,
         owner.nickname AS report_owner_nickname,
         COALESCE(
           (SELECT ri.url FROM report_images ri
            WHERE ri.report_id = r.id ORDER BY ri.sort_order LIMIT 1),
           NULL
         ) AS report_image
       FROM report_flags f
       JOIN users   reporter ON reporter.id = f.user_id
       JOIN reports r        ON r.id = f.report_id
       JOIN users   owner    ON owner.id = r.user_id
       ${where}
       ORDER BY f.created_at DESC`,
      params
    );

    return res.json({ flags: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

// ------------------------------------------------------------
// 관리자용: 신고 상태 변경
// PATCH /api/admin/flags/:id  🔒 admin
// body: { status: resolved | dismissed }
// (제보 자체의 반려/삭제는 각각 PATCH /api/reports/:id/status, DELETE /api/reports/:id 로)
// ------------------------------------------------------------
async function adminUpdateFlag(req, res) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(404).json({ error: '신고를 찾을 수 없습니다.' });
  }
  const { status } = req.body;
  if (!['resolved', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: 'status는 resolved 또는 dismissed여야 합니다.' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE report_flags SET status = $1 WHERE id = $2
       RETURNING id, report_id, reason, description, status, created_at`,
      [status, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '신고를 찾을 수 없습니다.' });
    }
    return res.json({ flag: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

// ------------------------------------------------------------
// 관리자용: 정보 변경 신고 목록
// GET /api/admin/change-reports?status=open  🔒 admin
// ------------------------------------------------------------
async function adminListChangeReports(req, res) {
  const status = req.query.status;
  if (status && !['open', 'accepted', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: 'status는 open, accepted, dismissed 중 하나여야 합니다.' });
  }

  try {
    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE c.status = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT
         c.id, c.reason, c.description, c.status, c.created_at,
         c.report_id,
         reporter.nickname AS reporter_nickname,
         r.title  AS report_title,
         r.status AS report_status,
         r.accessibility_status AS report_accessibility_status,
         r.updated_at AS report_updated_at,
         COALESCE(
           (SELECT ri.url FROM report_images ri
            WHERE ri.report_id = r.id ORDER BY ri.sort_order LIMIT 1),
           NULL
         ) AS report_image
       FROM report_change_reports c
       JOIN users   reporter ON reporter.id = c.user_id
       JOIN reports r        ON r.id = c.report_id
       ${where}
       ORDER BY c.created_at DESC`,
      params
    );

    return res.json({ change_reports: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

// ------------------------------------------------------------
// 관리자용: 정보 변경 신고 처리
// PATCH /api/admin/change-reports/:id  🔒 admin
// body: {
//   action: 'accept' | 'dismiss',
//   accessibility_status?: passable|inconvenient|impassable,  // accept 시 원본에 반영(선택)
//   status?: pending|approved|rejected|duplicate              // accept 시 원본에 반영(선택)
// }
// accept 시: 신고를 accepted로 바꾸고, 넘어온 값으로 원본 제보를 갱신.
//            값을 안 넘겨도 원본 updated_at(최근 확인일)은 새로 찍힘.
//            status를 넘기면 PATCH /api/reports/:id/status 와 같이 포인트 지급/회수도 함께 처리됨.
// ------------------------------------------------------------
async function adminReviewChangeReport(req, res) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(404).json({ error: '변경 신고를 찾을 수 없습니다.' });
  }

  const { action, accessibility_status, status } = req.body;
  if (!['accept', 'dismiss'].includes(action)) {
    return res.status(400).json({ error: "action은 'accept' 또는 'dismiss'여야 합니다." });
  }
  if (accessibility_status && !ACCESSIBILITY_STATUSES.includes(accessibility_status)) {
    return res.status(400).json({
      error: `accessibility_status는 ${ACCESSIBILITY_STATUSES.join(', ')} 중 하나여야 합니다.`,
    });
  }
  if (status && !REPORT_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status는 ${REPORT_STATUSES.join(', ')} 중 하나여야 합니다.`,
    });
  }

  const client = await pool.connect();
  try {
    const { rows: found } = await client.query(
      'SELECT id, report_id, status FROM report_change_reports WHERE id = $1',
      [id]
    );
    if (found.length === 0) {
      return res.status(404).json({ error: '변경 신고를 찾을 수 없습니다.' });
    }
    const changeReport = found[0];

    await client.query('BEGIN');

    if (action === 'dismiss') {
      await client.query(
        `UPDATE report_change_reports SET status = 'dismissed' WHERE id = $1`,
        [id]
      );
    } else {
      // accept: 신고 반영 완료 처리 + 원본 제보 갱신(+최근 확인일 갱신)
      await client.query(
        `UPDATE report_change_reports SET status = 'accepted' WHERE id = $1`,
        [id]
      );

      // 원본 제보 갱신 — 넘어온 값만 반영. updated_at은 트리거로 자동 갱신됨.
      // 통행 상태 반영 (값이 없어도 최근 확인일(updated_at)이 새로 찍히도록 항상 UPDATE 수행)
      await client.query(
        `UPDATE reports
         SET accessibility_status = COALESCE($1, accessibility_status), updated_at = NOW()
         WHERE id = $2`,
        [accessibility_status || null, changeReport.report_id]
      );

      // 승인 상태 변경은 포인트 지급/회수가 함께 처리되도록 공용 로직을 거친다.
      // (approved → rejected 등으로 바뀌면 지급된 포인트 회수, 처음 approved가 되면 지급)
      if (status) {
        await changeReportStatus(client, changeReport.report_id, status);
      }
    }

    await client.query('COMMIT');

    const { rows: updated } = await pool.query(
      `SELECT id, report_id, reason, description, status, created_at
       FROM report_change_reports WHERE id = $1`,
      [id]
    );
    return res.json({ change_report: updated[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  } finally {
    client.release();
  }
}

module.exports = {
  createFlag,
  createChangeReport,
  adminListFlags,
  adminUpdateFlag,
  adminListChangeReports,
  adminReviewChangeReport,
};
