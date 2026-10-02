// 포인트 내역 창 (마이페이지의 "포인트 내역 보기"에서 열림)
// 현재 포인트, 획득 내역, 차감 내역을 보여줍니다. 데이터는 api.js의 fetchPointHistory()(GET /api/points/history)가 가져옵니다.
// 지급된 포인트는 회수하지 않기로 확정되어(2026-10-02), 차감 내역은 지역 상점 교환(spend)만 생깁니다.

const pointSheet = document.getElementById('pointSheet');

function pointRow(e) {
  const row = document.createElement('div');
  row.className = 'point-row';

  const info = document.createElement('div');
  info.className = 'point-info';
  const reason = document.createElement('div');
  reason.className = 'point-reason';
  reason.textContent = e.reason;
  info.appendChild(reason);
  const sub = document.createElement('div');
  sub.className = 'point-sub';
  const label = e.reportTitle || e.itemName || '';
  sub.textContent = (label ? label + ' · ' : '') + formatDate(e.date);
  info.appendChild(sub);
  row.appendChild(info);

  const amount = document.createElement('div');
  amount.className = 'point-amount ' + (e.type === 'earn' ? 'earn' : 'use');
  amount.textContent = (e.type === 'earn' ? '+' : '-') + e.amount + 'P';
  row.appendChild(amount);

  return row;
}

function fillPointList(boxId, entries, emptyText) {
  const box = document.getElementById(boxId);
  box.textContent = '';
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'point-empty';
    empty.textContent = emptyText;
    box.appendChild(empty);
    return;
  }
  entries.forEach(e => box.appendChild(pointRow(e)));
}

function setPointMsg(text) {
  const el = document.getElementById('pointMsg');
  el.textContent = text || '';
  el.className = 'field-msg' + (text ? ' err' : '');
}

async function openPoints() {
  pointSheet.hidden = false;
  setPointMsg('');
  document.getElementById('pointNow').innerHTML = ((getUser() || {}).points ?? 0) + '<span>P</span>';
  document.getElementById('pointSum').textContent = '';
  document.getElementById('pointEarnList').textContent = '불러오는 중…';
  document.getElementById('pointUseList').textContent = '';

  try {
    const entries = await fetchPointHistory();

    // 현재 포인트를 서버 최신 값으로 갱신
    try {
      const { user } = await fetchMe();
      saveSession(getToken(), user);
      document.getElementById('pointNow').innerHTML = user.points + '<span>P</span>';
    } catch (e) { /* 실패해도 내역은 보여줍니다 */ }

    const earned = entries.filter(e => e.type === 'earn');
    const deducted = entries.filter(e => e.type !== 'earn');
    const earnedSum = earned.reduce((s, e) => s + e.amount, 0);
    const deductedSum = deducted.reduce((s, e) => s + e.amount, 0);
    document.getElementById('pointSum').textContent =
      '지금까지 ' + earnedSum + 'P 획득 · ' + deductedSum + 'P 차감';

    fillPointList('pointEarnList', earned, '아직 획득한 포인트가 없어요. 제보가 승인되면 포인트가 지급돼요.');
    fillPointList('pointUseList', deducted, '아직 차감된 포인트가 없어요.');
  } catch (err) {
    document.getElementById('pointEarnList').textContent = '';
    setPointMsg(errorMessage(err));
  }
}

function closePoints() {
  pointSheet.hidden = true;
}

document.getElementById('pointsMoreBtn').addEventListener('click', openPoints);
document.getElementById('pointClose').addEventListener('click', closePoints);
pointSheet.addEventListener('click', e => { if (e.target === pointSheet) closePoints(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !pointSheet.hidden) closePoints();
});
