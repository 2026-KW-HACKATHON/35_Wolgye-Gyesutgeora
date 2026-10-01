// 제보 상태 변경에 따른 포인트 지급·회수를 한곳에서 처리한다.
// 반드시 호출하는 쪽에서 연 트랜잭션(BEGIN ~ COMMIT) 안에서 사용할 것.

// 승인 시 지급할 포인트 (환경변수로 조정 가능, 기본 10)
const POINTS_PER_APPROVAL = parseInt(process.env.POINTS_PER_APPROVAL || '10');

// 정보 변경 신고가 수락(accepted)됐을 때 신고자에게 지급할 포인트 (환경변수로 조정 가능, 기본 30)
// 반려(dismissed)된 신고에는 지급하지 않는다.
const POINTS_PER_CHANGE_REPORT = Number.isInteger(parseInt(process.env.POINTS_PER_CHANGE_REPORT))
  ? parseInt(process.env.POINTS_PER_CHANGE_REPORT)
  : 30;

async function recordTransaction(client, { userId, reportId, reportTitle, type, amount, reason }) {
  await client.query(
    `INSERT INTO point_transactions (user_id, report_id, report_title, type, amount, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, reportId, reportTitle || null, type, amount, reason]
  );
}

/**
 * 지급됐던 포인트를 회수한다. (report는 point_awarded = TRUE인 행이어야 함)
 * - reports.point_awarded를 FALSE로 되돌려 중복 회수를 막는다.
 *   (이후 다시 승인하면 새로 지급되므로 '승인→반려→승인'을 반복해도 포인트가 늘지 않는다)
 * - 포인트는 0 밑으로 내려가지 않는다.
 * 회수한 포인트를 반환한다.
 */
async function revokeAwardedPoints(client, report, reason) {
  const amount = report.points_amount || 0;

  await client.query(
    'UPDATE reports SET point_awarded = FALSE, points_amount = 0 WHERE id = $1',
    [report.id]
  );
  if (amount <= 0) return 0;

  await client.query(
    'UPDATE users SET points = GREATEST(points - $1, 0) WHERE id = $2',
    [amount, report.user_id]
  );
  await recordTransaction(client, {
    userId: report.user_id,
    reportId: report.id,
    reportTitle: report.title,
    type: 'revoke',
    amount,
    reason,
  });
  return amount;
}

/**
 * 제보 상태를 바꾸고 포인트를 정산한다.
 * - approved로 바뀌고 아직 지급 전이면 POINTS_PER_APPROVAL 지급
 * - approved에서 다른 상태(rejected/duplicate/pending)로 바뀌고 지급된 상태면 회수
 * 제보 행을 FOR UPDATE로 잠가 동시에 두 번 처리돼도 지급·회수가 한 번만 일어난다.
 *
 * 반환: 제보가 없으면 null, 있으면 { pointsAwarded, pointsRevoked }
 */
async function changeReportStatus(client, reportId, newStatus) {
  const { rows } = await client.query(
    `SELECT id, user_id, title, status, point_awarded, points_amount
     FROM reports WHERE id = $1 FOR UPDATE`,
    [reportId]
  );
  if (rows.length === 0) return null;
  const report = rows[0];

  await client.query('UPDATE reports SET status = $1 WHERE id = $2', [newStatus, reportId]);

  let pointsAwarded = 0;
  let pointsRevoked = 0;

  if (newStatus === 'approved' && !report.point_awarded) {
    await client.query(
      'UPDATE reports SET point_awarded = TRUE, points_amount = $1 WHERE id = $2',
      [POINTS_PER_APPROVAL, reportId]
    );
    await client.query(
      'UPDATE users SET points = points + $1 WHERE id = $2',
      [POINTS_PER_APPROVAL, report.user_id]
    );
    await recordTransaction(client, {
      userId: report.user_id,
      reportId,
      reportTitle: report.title,
      type: 'earn',
      amount: POINTS_PER_APPROVAL,
      reason: 'report_approved',
    });
    pointsAwarded = POINTS_PER_APPROVAL;
  } else if (newStatus !== 'approved' && report.point_awarded) {
    pointsRevoked = await revokeAwardedPoints(client, report, 'approval_cancelled');
  }

  return { pointsAwarded, pointsRevoked };
}

/**
 * 정보 변경 신고 수락 시 신고자에게 포인트를 지급한다. (POINTS_PER_CHANGE_REPORT, 기본 30)
 * - users.points를 올리고 point_transactions에 earn / change_report_accepted 로 기록한다.
 * - 중복 지급 방지는 호출하는 쪽 책임: 신고 행을 FOR UPDATE로 잠그고
 *   status가 'open'일 때만 호출한다(수락은 open → accepted로 한 번만 일어난다).
 * 지급한 포인트를 반환한다. (설정값이 0 이하이면 지급하지 않고 0)
 */
async function awardChangeReportPoints(client, { userId, reportId, reportTitle }) {
  const amount = POINTS_PER_CHANGE_REPORT;
  if (amount <= 0) return 0;

  await client.query(
    'UPDATE users SET points = points + $1 WHERE id = $2',
    [amount, userId]
  );
  await recordTransaction(client, {
    userId,
    reportId,
    reportTitle,
    type: 'earn',
    amount,
    reason: 'change_report_accepted',
  });
  return amount;
}

module.exports = {
  POINTS_PER_APPROVAL,
  POINTS_PER_CHANGE_REPORT,
  revokeAwardedPoints,
  changeReportStatus,
  awardChangeReportPoints,
};
