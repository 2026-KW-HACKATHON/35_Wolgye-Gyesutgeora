// 마이페이지: 내 포인트, 내가 등록한 제보 목록과 검토 상태
// (제보 상태 변경 신고, 포인트를 상점에서 쓰는 기능은 이번 범위에 없습니다 — README 참고)

const mypageSheet = document.getElementById('mypageSheet');

// 제보 검토 상태(status) → 표시 문구·색. 서버 값은 pending|approved|rejected|duplicate
const REVIEW_STATUS = {
  pending:   { label: '검토 중', cls: 'pending' },
  approved:  { label: '승인됨', cls: 'approved' },
  rejected:  { label: '반려됨', cls: 'rejected' },
  duplicate: { label: '중복 제보', cls: 'rejected' }
};

// "내 제보" 목록에서만 안 보이게 숨기는 기능 (2026-10-08 추가).
// 실제로 서버 제보를 삭제하는 게 아니라 — 삭제는 관리자만 가능함(backend/API.md 참고) — 이 계정의
// 마이페이지 목록에서만 가리는 것입니다. 브라우저에 로컬로 저장되므로 다른 기기에서는 다시 보입니다.
let myReportsAll = [];

function hiddenReportsKey() {
  const user = getUser();
  return 'wg_hidden_reports_' + ((user || {}).id || (user || {}).username || 'anon');
}

function getHiddenReportIds() {
  try { return JSON.parse(localStorage.getItem(hiddenReportsKey())) || []; } catch (e) { return []; }
}

function hideReportLocally(id) {
  const ids = getHiddenReportIds();
  if (!ids.includes(id)) ids.push(id);
  try { localStorage.setItem(hiddenReportsKey(), JSON.stringify(ids)); } catch (e) { /* 저장 안 돼도 이번 화면에선 반영됨 */ }
}

function unhideReportLocally(id) {
  const ids = getHiddenReportIds().filter(x => x !== id);
  try { localStorage.setItem(hiddenReportsKey(), JSON.stringify(ids)); } catch (e) { /* 저장 안 돼도 이번 화면에선 반영됨 */ }
}

let myShowHidden = false;   // "숨긴 제보 보기" 토글 상태

function reportCard(r, hidden) {
  const card = document.createElement('div');
  card.className = 'my-card';

  const thumb = document.createElement('div');
  thumb.className = 'my-thumb';
  if (r.images && r.images[0]) {
    const img = document.createElement('img');
    img.src = imageUrl(r.images[0]);
    img.alt = '';
    img.addEventListener('error', () => { thumb.textContent = '사진 없음'; img.remove(); });
    thumb.appendChild(img);
  } else {
    thumb.textContent = '사진 없음';
  }
  card.appendChild(thumb);

  const body = document.createElement('div');
  body.className = 'my-body';

  const top = document.createElement('div');
  top.className = 'my-top';
  const review = REVIEW_STATUS[r.status] || { label: r.status, cls: 'pending' };
  const badge = document.createElement('span');
  badge.className = 'review-badge ' + review.cls;
  badge.textContent = review.label;
  top.appendChild(badge);
  if (r.accessibility_status) {
    const s = document.createElement('span');
    s.className = 'status-badge ' + r.accessibility_status;
    s.textContent = (tagInfo[r.accessibility_status] || {}).label || r.accessibility_status;
    top.appendChild(s);
  }
  body.appendChild(top);

  const title = document.createElement('div');
  title.className = 'my-title';
  const typeLabels = r.tags
    .filter(c => (tagInfo[c] || {}).category !== 'accessibility')
    .map(c => (tagInfo[c] || {}).label || c);
  title.textContent = r.title || typeLabels.join(', ') || '제보';
  body.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'my-meta';
  meta.textContent = formatDate(r.created_at);
  // 2026-10-01: GET /api/reports/mine 응답에 view_count가 추가됨
  if (r.view_count > 0) meta.textContent += ' · ' + r.view_count + '회 조회됨';
  body.appendChild(meta);

  card.appendChild(body);

  const hideBtn = document.createElement('button');
  hideBtn.className = 'my-hide-btn';
  hideBtn.type = 'button';
  if (hidden) {
    hideBtn.textContent = '다시 보이기';
    hideBtn.setAttribute('aria-label', '이 제보를 내 목록에 다시 보이기');
    hideBtn.addEventListener('click', () => {
      unhideReportLocally(r.id);
      renderMyReports();
    });
  } else {
    hideBtn.textContent = '숨기기';
    hideBtn.setAttribute('aria-label', '이 제보를 내 목록에서 숨기기');
    hideBtn.addEventListener('click', () => {
      if (!confirm('이 제보를 내 목록에서 숨길까요? 실제로 삭제되진 않고, 이 목록에서만 안 보이게 됩니다.')) return;
      hideReportLocally(r.id);
      renderMyReports();
    });
  }
  card.appendChild(hideBtn);

  return card;
}

function renderMyReports() {
  const list = document.getElementById('mypageList');
  const msg = document.getElementById('mypageMsg');
  const hiddenIds = getHiddenReportIds();
  const visible = myReportsAll.filter(r => !hiddenIds.includes(r.id));
  const hiddenReports = myReportsAll.filter(r => hiddenIds.includes(r.id));

  list.textContent = '';
  if (visible.length === 0) {
    msg.textContent = myReportsAll.length === 0
      ? '아직 등록한 제보가 없어요. 제보하기 버튼으로 첫 제보를 남겨 보세요.'
      : '숨긴 제보만 있어요.';
  } else {
    msg.textContent = '';
    visible.forEach(r => list.appendChild(reportCard(r)));
  }

  // 숨긴 제보 보기 토글
  const toggle = document.getElementById('mypageHiddenToggle');
  const hiddenList = document.getElementById('mypageHiddenList');
  if (hiddenReports.length === 0) {
    toggle.hidden = true;
    myShowHidden = false;
    hiddenList.textContent = '';
  } else {
    toggle.hidden = false;
    toggle.textContent = myShowHidden ? '숨긴 제보 그만 보기' : '숨긴 제보 보기 (' + hiddenReports.length + '건)';
    hiddenList.textContent = '';
    if (myShowHidden) hiddenReports.forEach(r => hiddenList.appendChild(reportCard(r, true)));
  }
}

async function openMypage() {
  mypageSheet.hidden = false;
  const user = getUser();
  document.getElementById('mypageNickname').textContent = user ? user.nickname + '님' : '';
  document.getElementById('mypagePoints').innerHTML = ((user || {}).points ?? 0) + '<span>P</span>';

  const list = document.getElementById('mypageList');
  const msg = document.getElementById('mypageMsg');
  list.textContent = '';
  msg.textContent = '불러오는 중…';
  msg.className = 'field-msg';

  try {
    // 태그 이름 표시를 위해 태그 정보가 없으면 먼저 받습니다
    if (!allTags.length) setTagInfo(await fetchTags());
    myReportsAll = await fetchMyReports();

    // 최신 포인트로 갱신 (제보 승인 후 다시 로그인하지 않아도 반영되도록)
    try {
      const { user } = await fetchMe();
      saveSession(getToken(), user);
      document.getElementById('mypagePoints').innerHTML = user.points + '<span>P</span>';
    } catch (e) { /* 실패해도 목록은 보여줍니다 */ }

    renderMyReports();
  } catch (err) {
    msg.textContent = errorMessage(err);
    msg.className = 'field-msg err';
  }
}

function closeMypage() {
  mypageSheet.hidden = true;
}

document.getElementById('mypageBtn').addEventListener('click', openMypage);
document.getElementById('mypageClose').addEventListener('click', closeMypage);
document.getElementById('mypageHiddenToggle').addEventListener('click', () => {
  myShowHidden = !myShowHidden;
  renderMyReports();
});
document.getElementById('mypageLogoutBtn').addEventListener('click', () => {
  logout();
  closeMypage();
});
mypageSheet.addEventListener('click', e => { if (e.target === mypageSheet) closeMypage(); });
// 포인트 내역(pointSheet, js/points.js)이 위에 열려 있으면 Esc는 그 창만 닫습니다
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !mypageSheet.hidden && document.getElementById('pointSheet').hidden) closeMypage();
});
