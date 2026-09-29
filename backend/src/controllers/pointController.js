const pool = require('../config/db');

/**
 * GET /api/points/history 🔒
 * 내 포인트 내역 (최신순). point_transactions 테이블 기준.
 *
 * type:
 *   - 'earn'   : 제보 승인으로 지급 (reason: report_approved)
 *   - 'revoke' : 지급된 포인트 회수 (reason: approval_cancelled = 승인 취소, report_deleted = 제보 삭제)
 * amount는 항상 양수이고, 증감 방향은 type으로 구분한다.
 * 제보가 삭제된 내역은 report_id가 null이지만 report_title은 남는다.
 * 이 API는 조회수(view_count)를 올리지 않는다.
 *
 * 응답: { history: [{ id, type, amount, reason, report_id, report_title, created_at }] }
 */
async function pointHistory(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, type, amount, reason, report_id, report_title, created_at
       FROM point_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC, id`,
      [req.user.id]
    );

    const history = rows.map(r => ({
      id: r.id,
      type: r.type,
      amount: r.amount,
      reason: r.reason,
      report_id: r.report_id,
      report_title: r.report_title || '',
      created_at: r.created_at,
    }));

    return res.json({ history });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

module.exports = { pointHistory };
