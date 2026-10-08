// 포인트 내역 창 (마이페이지의 "포인트 내역 보기"에서 열림)
// 현재 포인트, 획득 내역, 차감 내역을 보여줍니다. 데이터는 api.js의 fetchPointHistory()(GET /api/points/history)가 가져옵니다.
// 지급된 포인트는 회수하지 않기로 확정되어(2026-10-02), 차감 내역은 지역 상점 교환(spend)만 생깁니다.
// 2026-10-08: 목록이 길어질 수 있어서 기본은 최근 3개월만 보여주고, 원하면 전체를 볼 수 있게 함
// (상단 합계도 지금 보이는 기간 기준으로만 계산 — 전체 보기로 바꾸면 "지금까지", 아니면 "최근 N개월" 기준으로 바뀜).

const pointSheet = document.getElementById('pointSheet');
const POINT_RECENT_MONTHS = 3;
let pointAllEntries = [];
let pointShowAll = false;

function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

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
    pointAllEntries = await fetchPointHistory();
    pointShowAll = false;

    // 현재 포인트를 서버 최신 값으로 갱신
    try {
      const { user } = await fetchMe();
      saveSession(getToken(), user);
      document.getElementById('pointNow').innerHTML = user.points + '<span>P</span>';
    } catch (e) { /* 실패해도 내역은 보여줍니다 */ }

    renderPointLists();
  } catch (err) {
    document.getElementById('pointEarnList').textContent = '';
    setPointMsg(errorMessage(err));
  }
}

// pointShowAll 상태에 맞춰 목록을 다시 그립니다 (합계도 지금 보이는 기간 기준으로만 계산, 2026-10-08)
function renderPointLists() {
  const cutoff = monthsAgo(POINT_RECENT_MONTHS);
  const visible = pointShowAll ? pointAllEntries : pointAllEntries.filter(e => new Date(e.date) >= cutoff);
  const hiddenCount = pointAllEntries.length - visible.length;

  const earnedSum = visible.filter(e => e.type === 'earn').reduce((s, e) => s + e.amount, 0);
  const deductedSum = visible.filter(e => e.type !== 'earn').reduce((s, e) => s + e.amount, 0);
  document.getElementById('pointSum').textContent =
    (pointShowAll ? '지금까지' : '최근 ' + POINT_RECENT_MONTHS + '개월') + ' ' + earnedSum + 'P 획득 · ' + deductedSum + 'P 차감';

  const toggle = document.getElementById('pointRangeToggle');
  if (hiddenCount > 0 || pointShowAll) {
    toggle.hidden = false;
    toggle.textContent = pointShowAll
      ? '최근 ' + POINT_RECENT_MONTHS + '개월만 보기'
      : POINT_RECENT_MONTHS + '개월 이전 내역 더 보기 (' + hiddenCount + '건)';
  } else {
    toggle.hidden = true;
  }

  fillPointList('pointEarnList', visible.filter(e => e.type === 'earn'), '아직 획득한 포인트가 없어요. 제보가 승인되면 포인트가 지급돼요.');
  fillPointList('pointUseList', visible.filter(e => e.type !== 'earn'), '아직 차감된 포인트가 없어요.');
}

function closePoints() {
  pointSheet.hidden = true;
}

document.getElementById('pointsMoreBtn').addEventListener('click', openPoints);
document.getElementById('pointClose').addEventListener('click', closePoints);
document.getElementById('pointRangeToggle').addEventListener('click', () => {
  pointShowAll = !pointShowAll;
  renderPointLists();
});
pointSheet.addEventListener('click', e => { if (e.target === pointSheet) closePoints(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !pointSheet.hidden) closePoints();
});
