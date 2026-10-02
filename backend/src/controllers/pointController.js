const pool = require('../config/db');

/**
 * GET /api/points/history 🔒
 * 내 포인트 내역 (최신순). point_transactions 테이블 기준.
 *
 * type:
 *   - 'earn'  : 포인트 지급 (reason: report_approved = 제보 승인,
 *                            change_report_accepted = 정보 변경 신고 수락)
 *   - 'spend' : 포인트 사용 (reason: store_redeem = 지역 상점 교환, item_name에 상품명)
 * amount는 항상 양수이고, 증감 방향은 type으로 구분한다.
 * 지급된 포인트는 회수하지 않으므로 'revoke' 내역은 더 이상 쌓이지 않는다.
 *   (과거에 쌓인 revoke 행이 있으면 그대로 조회된다)
 * 제보가 삭제된 내역은 report_id가 null이지만 report_title은 남는다.
 * 이 API는 조회수(view_count)를 올리지 않는다.
 *
 * 응답: { history: [{ id, type, amount, reason, report_id, report_title, item_name, created_at }] }
 */
async function pointHistory(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, type, amount, reason, report_id, report_title, item_name, created_at
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
      item_name: r.item_name || '',
      created_at: r.created_at,
    }));

    return res.json({ history });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  }
}

module.exports = { pointHistory };
