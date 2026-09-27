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

function reportCard(r) {
  const card = document.createElement('div');
  card.className = 'my-card';

  const thumb = document.createElement('div');
  thumb.className = 'my-thumb';
  if (r.images && r.images[0]) {
    const img = document.createElement('img');
    img.src = BASE_URL + r.images[0];
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
  body.appendChild(meta);

  card.appendChild(body);
  return card;
}

async function openMypage() {
  mypageSheet.hidden = false;
  document.getElementById('mypagePoints').innerHTML = ((getUser() || {}).points ?? 0) + '<span>P</span>';

  const list = document.getElementById('mypageList');
  const msg = document.getElementById('mypageMsg');
  list.textContent = '';
  msg.textContent = '불러오는 중…';
  msg.className = 'field-msg';

  try {
    // 태그 이름 표시를 위해 태그 정보가 없으면 먼저 받습니다
    if (!allTags.length) setTagInfo(await fetchTags());
    const reports = await fetchMyReports();

    // 최신 포인트로 갱신 (제보 승인 후 다시 로그인하지 않아도 반영되도록)
    try {
      const { user } = await fetchMe();
      saveSession(getToken(), user);
      document.getElementById('mypagePoints').innerHTML = user.points + '<span>P</span>';
    } catch (e) { /* 실패해도 목록은 보여줍니다 */ }

    msg.textContent = '';
    if (reports.length === 0) {
      msg.textContent = '아직 등록한 제보가 없어요. 제보하기 버튼으로 첫 제보를 남겨 보세요.';
    } else {
      reports.forEach(r => list.appendChild(reportCard(r)));
    }
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
mypageSheet.addEventListener('click', e => { if (e.target === mypageSheet) closeMypage(); });
// 포인트 내역(pointSheet, js/points.js)이 위에 열려 있으면 Esc는 그 창만 닫습니다
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !mypageSheet.hidden && document.getElementById('pointSheet').hidden) closeMypage();
});
