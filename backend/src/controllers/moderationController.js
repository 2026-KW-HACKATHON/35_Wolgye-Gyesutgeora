const pool = require('../config/db');
const { changeReportStatus, awardChangeReportPoints } = require('../utils/points');
const { ContentError, parseTagIds, updateReportContent } = require('../utils/reportContent');

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
// 사용자용: 정보 변경 신고 (상황이 바뀜) — JSON 전용 (사진·GPS 없음)
// POST /api/reports/:id/change-report  🔒
// body: { reason, description? }
// 같은 사용자가 같은 제보에 아직 처리되지 않은(open) 신고가 있으면 409 ALREADY_REPORTED.
// ------------------------------------------------------------
async function createChangeReport(req, res) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(404).json({ error: '제보를 찾을 수 없습니다.' });
  }

  const { reason, description } = req.body || {};
  if (!reason || !CHANGE_REASONS.includes(reason)) {
    return res.status(400).json({
      error: `reason은 ${CHANGE_REASONS.join(', ')} 중 하나여야 합니다.`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const exists = await client.query('SELECT id FROM reports WHERE id = $1', [id]);
    if (exists.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '제보를 찾을 수 없습니다.' });
    }

    // 접수(open) 상태 신고 중복 방지 (처리된 뒤 다시 신고하는 것은 가능).
    // 동시에 두 번 눌러도 한 건만 들어가도록 사용자·제보 단위로 잠근다.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`change-report:${id}:${req.user.id}`]);
    const dup = await client.query(
      `SELECT 1 FROM report_change_reports
       WHERE report_id = $1 AND user_id = $2 AND status = 'open' LIMIT 1`,
      [id, req.user.id]
    );
    if (dup.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: '이미 접수된 변경 신고가 있어요. 검토가 끝난 뒤 다시 신고해주세요.',
        code: 'ALREADY_REPORTED',
      });
    }

    const { rows } = await client.query(
      `INSERT INTO report_change_reports (report_id, user_id, reason, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, report_id, reason, description, status, created_at`,
      [id, req.user.id, reason, (typeof description === 'string' ? description.trim() : '') || null]
    );

    await client.query('COMMIT');
    return res.status(201).json({ change_report: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  } finally {
    client.release();
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
//   // 아래는 accept일 때만 쓰이며 모두 선택. 보내면 자동 반영 값보다 우선한다.
//   accessibility_status?: passable|inconvenient|impassable,
//   title?, description?, tag_ids?,
//   status?: pending|approved|rejected|duplicate     // 원본 제보의 검수 상태
// }
//
// 'open'(접수) 상태인 신고만 처리할 수 있다. 이미 처리된 신고는 409 ALREADY_PROCESSED.
//
// accept 시 원본 제보가 자동으로 바뀐다 (신고 사유 기준):
//   now_passable      → 통행 상태를 passable 로
//   now_impassable    → 통행 상태를 impassable 로
//   obstacle_removed  → 태그 obstacle(적치물/장애물) 제거
//   construction_done → 태그 construction(공사 중) 제거
//   info_different / etc → 자동으로 바꿀 수 없으므로 title, description, tag_ids,
//                          accessibility_status, status 중 하나 이상을 직접 보내야 한다(없으면 400 NEEDS_CHANGES).
// 원본 제보의 updated_at(최근 확인일)은 항상 새로 찍힌다.
// 수락하면 신고자에게 포인트(POINTS_PER_CHANGE_REPORT, 기본 30)를 지급하고, 반려하면 지급하지 않는다.
// ------------------------------------------------------------
const AUTO_CHANGES = {
  now_passable:      { accessibilityStatus: 'passable' },
  now_impassable:    { accessibilityStatus: 'impassable' },
  obstacle_removed:  { removeTagCodes: ['obstacle'] },
  construction_done: { removeTagCodes: ['construction'] },
};

async function adminReviewChangeReport(req, res) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(404).json({ error: '변경 신고를 찾을 수 없습니다.' });
  }

  const { action, accessibility_status, status, title, description, tag_ids } = req.body;
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
    await client.query('BEGIN');

    // 신고 행을 잠가 동시에 두 번 처리돼도 수락·포인트 지급이 한 번만 일어나게 한다.
    const { rows: found } = await client.query(
      `SELECT c.id, c.report_id, c.user_id, c.reason, c.status, r.title AS report_title
       FROM report_change_reports c
       JOIN reports r ON r.id = c.report_id
       WHERE c.id = $1
       FOR UPDATE OF c`,
      [id]
    );
    if (found.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '변경 신고를 찾을 수 없습니다.' });
    }
    const changeReport = found[0];

    if (changeReport.status !== 'open') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: '이미 처리된 변경 신고입니다.',
        code: 'ALREADY_PROCESSED',
      });
    }

    let pointsAwarded = 0;

    if (action === 'dismiss') {
      await client.query(
        `UPDATE report_change_reports
         SET status = 'dismissed', resolved_by = $2, resolved_at = NOW()
         WHERE id = $1`,
        [id, req.user.id]
      );
    } else {
      const auto = AUTO_CHANGES[changeReport.reason] || {};

      // 관리자가 직접 보낸 값은 자동 반영 값보다 우선한다.
      const hasTitle = title !== undefined;
      const hasDescription = description !== undefined;
      const hasTags = tag_ids !== undefined && tag_ids !== '';
      const hasManual = hasTitle || hasDescription || hasTags || !!accessibility_status || !!status;

      // 자동 반영 규칙이 없는 사유(info_different, etc)는 관리자가 바꿀 내용을 직접 보내야 한다.
      if (!AUTO_CHANGES[changeReport.reason] && !hasManual) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: '이 신고는 자동으로 반영할 수 없습니다. title, description, tag_ids, accessibility_status, status 중 하나 이상을 함께 보내주세요.',
          code: 'NEEDS_CHANGES',
        });
      }

      const fields = {
        accessibilityStatus: accessibility_status || auto.accessibilityStatus,
      };
      if (hasTitle) fields.title = title;
      if (hasDescription) fields.description = description;
      if (hasTags) fields.tagIds = parseTagIds(tag_ids);
      else if (auto.removeTagCodes) fields.removeTagCodes = auto.removeTagCodes;
      if (fields.accessibilityStatus === undefined) delete fields.accessibilityStatus;

      // 원본 제보 갱신 (+ 최근 확인일 갱신)
      const updated = await updateReportContent(client, changeReport.report_id, fields);
      if (!updated) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '원본 제보를 찾을 수 없습니다.' });
      }

      // 승인 상태 변경은 포인트 지급/회수가 함께 처리되도록 공용 로직을 거친다.
      // (approved → rejected 등으로 바뀌면 제보자에게 지급된 포인트 회수, 처음 approved가 되면 지급)
      if (status) {
        await changeReportStatus(client, changeReport.report_id, status);
      }

      await client.query(
        `UPDATE report_change_reports
         SET status = 'accepted', resolved_by = $2, resolved_at = NOW()
         WHERE id = $1`,
        [id, req.user.id]
      );

      // 신고자에게 포인트 지급 (수락된 신고만)
      pointsAwarded = await awardChangeReportPoints(client, {
        userId: changeReport.user_id,
        reportId: changeReport.report_id,
        reportTitle: changeReport.report_title,
      });
    }

    await client.query('COMMIT');

    const { rows: updated } = await pool.query(
      `SELECT id, report_id, reason, description, status, created_at, resolved_at
       FROM report_change_reports WHERE id = $1`,
      [id]
    );
    return res.json({
      change_report: updated[0],
      ...(pointsAwarded > 0 && { points_awarded: pointsAwarded }),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof ContentError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
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
