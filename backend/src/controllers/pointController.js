const pool = require('../config/db');

/**
 * GET /api/points/history 🔒
 * 내 포인트 내역 (최신순)
 *
 * 별도의 포인트 내역 테이블이 아직 없으므로, 승인되어 포인트가 지급된 내 제보
 * (reports.point_awarded = TRUE)를 지급 기록으로 사용한다.
 * 지급 시각은 reports.updated_at 을 쓴다. (이후 정보 변경 신고가 반영되면 값이 바뀔 수 있음)
 * 이 API는 조회수(view_count)를 올리지 않는다.
 *
 * 응답: { history: [{ id, type: 'earn', amount, reason, report_id, report_title, created_at }] }
 */
async function pointHistory(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, points_amount, updated_at
       FROM reports
       WHERE user_id = $1 AND point_awarded = TRUE AND points_amount > 0
       ORDER BY updated_at DESC`,
      [req.user.id]
    );

    const history = rows.map(r => ({
      id: r.id,
      type: 'earn',
      amount: r.points_amount,
      reason: 'report_approved',
      report_id: r.id,
      report_title: r.title || '',
      created_at: r.updated_at,
    }));

    return res.json({ history });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

module.exports = { pointHistory };
