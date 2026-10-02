// 제보 상태 변경에 따른 포인트 지급을 한곳에서 처리한다.
// 반드시 호출하는 쪽에서 연 트랜잭션(BEGIN ~ COMMIT) 안에서 사용할 것.
//
// 정책: 한 번 지급한 포인트는 회수하지 않는다.
//   승인된 제보를 나중에 반려·중복 처리하거나 삭제해도 제보자의 포인트는 그대로 유지한다.
//   (잘못된 승인은 운영진의 실수이지 제보자의 잘못이 아니므로, 사후 회수 대신 승인 단계에서 걸러낸다)

// 승인 시 지급할 포인트 (환경변수로 조정 가능, 기본 10)
const POINTS_PER_APPROVAL = parseInt(process.env.POINTS_PER_APPROVAL || '10');

// 정보 변경 신고가 수락(accepted)됐을 때 신고자에게 지급할 포인트 (환경변수로 조정 가능, 기본 30)
// 반려(dismissed)된 신고에는 지급하지 않는다.
const POINTS_PER_CHANGE_REPORT = Number.isInteger(parseInt(process.env.POINTS_PER_CHANGE_REPORT))
  ? parseInt(process.env.POINTS_PER_CHANGE_REPORT)
  : 30;

/**
 * point_transactions에 내역 한 줄을 남긴다.
 * - 제보 관련 내역(earn)은 reportId / reportTitle을 넘긴다.
 * - 포인트 사용 내역(spend)은 itemCode / itemName을 넘긴다. (제보와 무관하므로 reportId는 비워 둔다)
 */
async function recordTransaction(client, {
  userId, reportId, reportTitle, itemCode, itemName, type, amount, reason,
}) {
  await client.query(
    `INSERT INTO point_transactions
       (user_id, report_id, report_title, item_code, item_name, type, amount, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, reportId || null, reportTitle || null, itemCode || null, itemName || null, type, amount, reason]
  );
}

/**
 * 제보 상태를 바꾸고 포인트를 정산한다.
 * - approved로 바뀌고 아직 지급 전이면 POINTS_PER_APPROVAL 지급
 * - 그 밖의 상태로 바뀔 때는 아무것도 하지 않는다 (지급된 포인트를 회수하지 않는다)
 * 제보 행을 FOR UPDATE로 잠가 동시에 두 번 처리돼도 지급이 한 번만 일어난다.
 *
 * point_awarded는 한 번 TRUE가 되면 되돌리지 않으므로,
 * '승인 → 반려 → 재승인'을 반복해도 포인트가 중복 지급되지 않는다.
 *
 * 반환: 제보가 없으면 null, 있으면 { pointsAwarded }
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
  }

  return { pointsAwarded };
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
  recordTransaction,
  changeReportStatus,
  awardChangeReportPoints,
};
