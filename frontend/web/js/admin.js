// 관리자 페이지: 제보 검토(승인/반려). 주민용 화면(index.html)과는 별도 로그인 세션을 씁니다.
// (같은 브라우저에서 주민 계정으로 로그인해 둔 상태를 이 페이지가 덮어쓰지 않도록 저장 키를 분리)

const ADMIN_TOKEN_KEY = 'wg_admin_token';
const ADMIN_USER_KEY = 'wg_admin_user';

function getAdminToken() { try { return localStorage.getItem(ADMIN_TOKEN_KEY); } catch (e) { return null; } }
function getAdminUser() { try { return JSON.parse(localStorage.getItem(ADMIN_USER_KEY)); } catch (e) { return null; } }
function adminAuthHeader() { const t = getAdminToken(); return t ? { Authorization: 'Bearer ' + t } : {}; }

function saveAdminSession(token, user) {
  try { localStorage.setItem(ADMIN_TOKEN_KEY, token); localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user)); } catch (e) {}
}
function clearAdminSession() {
  try { localStorage.removeItem(ADMIN_TOKEN_KEY); localStorage.removeItem(ADMIN_USER_KEY); } catch (e) {}
}

const loginView = document.getElementById('adminLogin');
const mainView = document.getElementById('adminMain');
const loginForm = document.getElementById('adminLoginForm');

function setLoginMsg(text) {
  const el = document.getElementById('adminLoginMsg');
  el.textContent = text || '';
  el.className = 'field-msg' + (text ? ' err' : '');
}

function setListMsg(text, kind) {
  const el = document.getElementById('adminMsg');
  el.textContent = text || '';
  el.className = 'field-msg' + (text ? ' ' + (kind || 'err') : '');
}

function showMain(user) {
  loginView.hidden = true;
  mainView.hidden = false;
  document.getElementById('adminName').textContent = user.nickname + ' (관리자)';
}

function showLogin() {
  loginView.hidden = false;
  mainView.hidden = true;
  loginForm.reset();
}

// 토큰이 만료·무효화됐을 때(401) 공통 처리: 에러 문구만 목록 위에 띄우고 로그인된 것처럼 보이게 두지 않고,
// 세션을 지우고 로그인 화면으로 바로 돌려보냅니다. 401이 아니면 false를 돌려줘서 호출한 쪽이 평소대로 처리하게 합니다.
function handleAuthExpiry(err) {
  if (err.status !== 401) return false;
  clearAdminSession();
  showLogin();
  setLoginMsg('로그인이 만료됐어요. 다시 로그인해 주세요.');
  return true;
}

async function withBusy(button, task) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = '처리 중…';
  try { return await task(); }
  finally { button.disabled = false; button.textContent = label; }
}

// ----- 로그인 -----

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  setLoginMsg('');
  const username = loginForm.elements.username.value.trim().toLowerCase();
  const password = loginForm.elements.password.value;
  if (!username || !password) { setLoginMsg('아이디와 비밀번호를 입력해 주세요.'); return; }

  await withBusy(loginForm.querySelector('.primary'), async () => {
    try {
      const { token, user } = await loginUser(username, password);
      if (user.role !== 'admin') {
        setLoginMsg('관리자 권한이 있는 계정이 아니에요.');
        return;
      }
      saveAdminSession(token, user);
      showMain(user);
      loadReports();
      refreshModBadge();
    } catch (err) {
      setLoginMsg(errorMessage(err));
    }
  });
});

document.getElementById('adminLogoutBtn').addEventListener('click', () => {
  clearAdminSession();
  showLogin();
});

// ----- 목록 -----

let currentStatus = 'pending';
let tagLabel = {};   // code -> label (팝업/목록 표시용)
let adminTags = [];  // 태그 전체([{id, code, label, category}]) — 제보 수정 창에서 씀
let currentReports = [];   // 지금 탭에서 서버로부터 받아온 전체 목록 (검색은 이 목록 안에서 클라이언트가 걸러냄)
let reportSearchQuery = '';

function formatDate(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

const REVIEW_LABEL = { pending: '검토 중', approved: '승인됨', rejected: '반려됨', duplicate: '중복 제보' };

function reportRow(r) {
  const row = document.createElement('div');
  row.className = 'admin-row';
  row.dataset.reportId = r.id;   // 신고 관리 탭에서 "이 제보 검토하러 가기"로 찾아올 때 씀

  const photos = document.createElement('div');
  photos.className = 'admin-photos';
  if (r.images && r.images.length) {
    r.images.forEach(path => {
      const img = document.createElement('img');
      img.src = BASE_URL + path;
      img.alt = '제보 사진';
      img.addEventListener('error', () => img.remove());
      photos.appendChild(img);
    });
  } else {
    const span = document.createElement('span');
    span.className = 'admin-nophoto';
    span.textContent = '사진 없음';
    photos.appendChild(span);
  }
  row.appendChild(photos);

  const body = document.createElement('div');
  body.className = 'admin-row-body';

  const top = document.createElement('div');
  top.className = 'admin-row-top';
  const review = document.createElement('span');
  review.className = 'review-badge ' + (r.status === 'approved' ? 'approved' : r.status === 'pending' ? 'pending' : 'rejected');
  review.textContent = REVIEW_LABEL[r.status] || r.status;
  top.appendChild(review);
  if (r.accessibility_status) {
    const s = document.createElement('span');
    s.className = 'status-badge ' + r.accessibility_status;
    s.textContent = tagLabel[r.accessibility_status] || r.accessibility_status;
    top.appendChild(s);
  }
  body.appendChild(top);

  const title = document.createElement('div');
  title.className = 'my-title';
  const typeLabels = r.tags.filter(c => c !== r.accessibility_status).map(c => tagLabel[c] || c);
  title.textContent = r.title || typeLabels.join(', ') || '제보';
  body.appendChild(title);

  if (r.description) {
    const desc = document.createElement('div');
    desc.className = 'admin-desc';
    desc.textContent = r.description;
    body.appendChild(desc);
  }

  const meta = document.createElement('div');
  meta.className = 'my-meta';
  meta.textContent = formatDate(r.created_at) + ' · ' + r.reporter_nickname + ' · 위도 ' + r.latitude + ', 경도 ' + r.longitude;
  body.appendChild(meta);

  row.appendChild(body);

  // 검토 중인 것만이 아니라, 이미 승인/반려된 것도 실수를 바로잡을 수 있도록 바꿀 수 있게 합니다.
  // (지금 상태와 같은 버튼만 숨깁니다. pending으로 되돌리는 것은 서버가 허용하지 않아 제공하지 않습니다.)
  const actions = document.createElement('div');
  actions.className = 'admin-actions';
  if (r.status !== 'approved') {
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'admin-approve';
    approve.textContent = r.status === 'pending' ? '승인' : '승인으로 변경';
    approve.addEventListener('click', () => changeStatus(r, 'approved', row));
    actions.appendChild(approve);
  }
  if (r.status !== 'rejected') {
    const reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'admin-reject';
    reject.textContent = r.status === 'pending' ? '반려' : '반려로 변경';
    reject.addEventListener('click', () => changeStatus(r, 'rejected', row));
    actions.appendChild(reject);
  }
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'admin-delete';
  edit.textContent = '수정';
  edit.addEventListener('click', () => { panel.hidden = !panel.hidden; });
  actions.appendChild(edit);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'admin-delete';
  del.textContent = '삭제';
  del.addEventListener('click', () => deleteReport(r, row));
  actions.appendChild(del);
  row.appendChild(actions);

  const panel = buildEditPanel(r);
  row.appendChild(panel);

  return row;
}

// 제보 수정 창 (제목·설명·통행 상태·태그). PATCH /api/reports/:id 로 저장합니다. 평소엔 숨겨져 있다가
// "수정" 버튼으로 펼칩니다. 검수 상태(승인·반려)·좌표·사진은 이 API로 바꾸지 않습니다(다른 API 영역).
function buildEditPanel(r) {
  const panel = document.createElement('div');
  panel.className = 'admin-edit-panel';
  panel.hidden = true;

  const titleLabel = document.createElement('div');
  titleLabel.className = 'section-title';
  titleLabel.textContent = '제목';
  panel.appendChild(titleLabel);
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'admin-edit-input';
  titleInput.maxLength = 200;
  titleInput.value = r.title || '';
  panel.appendChild(titleInput);

  const descLabel = document.createElement('div');
  descLabel.className = 'section-title';
  descLabel.textContent = '설명';
  panel.appendChild(descLabel);
  const descInput = document.createElement('textarea');
  descInput.rows = 2;
  descInput.value = r.description || '';
  panel.appendChild(descInput);

  const statusLabel = document.createElement('div');
  statusLabel.className = 'section-title';
  statusLabel.textContent = '통행 상태';
  panel.appendChild(statusLabel);
  const statusBox = document.createElement('div');
  statusBox.className = 'status-picker';
  let selectedStatusCode = r.accessibility_status || null;
  adminTags.filter(t => t.category === 'accessibility').forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'status-btn';
    btn.dataset.code = t.code;
    btn.textContent = t.label;
    btn.classList.toggle('on', selectedStatusCode === t.code);
    btn.addEventListener('click', () => {
      selectedStatusCode = t.code;
      statusBox.querySelectorAll('.status-btn').forEach(b => b.classList.toggle('on', b === btn));
    });
    statusBox.appendChild(btn);
  });
  panel.appendChild(statusBox);

  const tagLabelTitle = document.createElement('div');
  tagLabelTitle.className = 'section-title';
  tagLabelTitle.textContent = '불편 유형';
  panel.appendChild(tagLabelTitle);
  const tagBox = document.createElement('div');
  tagBox.className = 'tag-group';
  const selectedTagIds = new Set(
    adminTags.filter(t => t.category !== 'accessibility' && r.tags.includes(t.code)).map(t => t.id)
  );
  adminTags.filter(t => t.category !== 'accessibility').forEach(t => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag-chip';
    chip.textContent = t.label;
    chip.classList.toggle('on', selectedTagIds.has(t.id));
    chip.addEventListener('click', () => {
      if (selectedTagIds.has(t.id)) selectedTagIds.delete(t.id); else selectedTagIds.add(t.id);
      chip.classList.toggle('on');
    });
    tagBox.appendChild(chip);
  });
  panel.appendChild(tagBox);

  const msg = document.createElement('div');
  msg.className = 'field-msg';
  panel.appendChild(msg);

  const btnRow = document.createElement('div');
  btnRow.className = 'admin-edit-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'admin-approve';
  saveBtn.textContent = '저장';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'admin-delete';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', () => { panel.hidden = true; });

  saveBtn.addEventListener('click', async () => {
    msg.textContent = '';
    const tagIds = Array.from(selectedTagIds);
    if (selectedStatusCode) {
      const statusTagObj = adminTags.find(t => t.category === 'accessibility' && t.code === selectedStatusCode);
      if (statusTagObj) tagIds.push(statusTagObj.id);
    }
    if (tagIds.length === 0) {
      msg.textContent = '태그를 1개 이상 선택해 주세요.';
      msg.className = 'field-msg err';
      return;
    }
    const body = { title: titleInput.value.trim(), description: descInput.value.trim(), tag_ids: tagIds };
    if (selectedStatusCode) body.accessibility_status = selectedStatusCode;

    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    try {
      const res = await apiRequest('/api/reports/' + r.id, {
        method: 'PATCH',
        headers: { ...adminAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      currentReports = currentReports.map(x => x.id === res.report.id ? res.report : x);
      renderReportList(['수정했어요.', 'ok']);
    } catch (err) {
      if (handleAuthExpiry(err)) return;
      msg.textContent = errorMessage(err);
      msg.className = 'field-msg err';
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);
  panel.appendChild(btnRow);

  return panel;
}

// 제보 하나를 검색용 글자 하나로 합칩니다 (소문자) — 주민용 검색(js/search.js)과 같은 방식
function reportHaystack(r) {
  const parts = [r.title, r.description, r.reporter_nickname];
  if (r.accessibility_status) parts.push(tagLabel[r.accessibility_status] || r.accessibility_status);
  r.tags.forEach(c => parts.push(tagLabel[c] || c));
  return parts.filter(Boolean).join(' ').toLowerCase();
}

// 띄어쓰기로 나눈 검색어가 "모두" 들어 있어야 일치
function matchesReportSearch(r, q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const h = reportHaystack(r);
  return terms.every(t => h.includes(t));
}

// currentReports(서버에서 받아온 지금 탭의 전체 목록)를 검색어로 걸러 화면에 다시 그립니다.
// 새로 서버에 요청하지 않으므로, 승인/반려/삭제 뒤에도 이 함수만 다시 부르면 됩니다.
function renderReportList(msgOverride) {
  const list = document.getElementById('adminList');
  list.textContent = '';
  const filtered = currentReports.filter(r => matchesReportSearch(r, reportSearchQuery));
  if (msgOverride) {
    setListMsg(msgOverride[0], msgOverride[1]);
  } else if (currentReports.length === 0) {
    setListMsg('해당하는 제보가 없어요.', 'ok');
  } else if (filtered.length === 0) {
    setListMsg('검색 결과가 없어요.', 'ok');
  } else {
    setListMsg('');
  }
  filtered.forEach(r => list.appendChild(reportRow(r)));
}

// 제보를 완전히 삭제합니다 (사진 파일까지, 되돌릴 수 없음)
async function deleteReport(report, row) {
  const label = report.title || (report.tags || []).map(c => tagLabel[c] || c).join(', ') || '이 제보';
  if (!confirm('"' + label + '"를 정말 삭제할까요?\n사진까지 함께 지워지고, 되돌릴 수 없어요.')) return;

  const buttons = row.querySelectorAll('.admin-actions button');
  buttons.forEach(b => b.disabled = true);
  try {
    const res = await apiRequest('/api/reports/' + report.id, { method: 'DELETE', headers: adminAuthHeader() });
    currentReports = currentReports.filter(r => r.id !== report.id);
    const pointsMsg = res.points_revoked ? (' (포인트 ' + res.points_revoked + '점 회수)') : '';
    renderReportList(['삭제했어요.' + pointsMsg, 'ok']);
  } catch (err) {
    if (handleAuthExpiry(err)) return;
    buttons.forEach(b => b.disabled = false);
    setListMsg(errorMessage(err));
  }
}

async function loadReports() {
  setListMsg('불러오는 중…', '');
  document.getElementById('adminList').textContent = '';
  try {
    if (!Object.keys(tagLabel).length) {
      const tags = await fetchTags();
      adminTags = tags;
      tags.forEach(t => { tagLabel[t.code] = t.label; });
    }
    const query = currentStatus ? '?status=' + currentStatus : '';
    // 2026-10-01: 백엔드가 비로그인 요청에는 approved 외 상태를 403으로 막기 시작해서, 관리자 토큰을 항상 보냅니다.
    const data = await apiRequest('/api/reports' + query, { headers: adminAuthHeader() });
    currentReports = data.reports;
    renderReportList();
  } catch (err) {
    if (handleAuthExpiry(err)) return;
    setListMsg(errorMessage(err));
  }
}

async function changeStatus(report, status, row) {
  // 2026-10-01: 서버가 한때 승인 취소(반려·중복 처리) 시 포인트를 자동 회수하도록 바뀌었는데, 팀 결정(포인트 회수 기능은
  // 만들지 않기로 함)과 반대라 백엔드에 되돌려 달라고 요청한 상태입니다. 처리 방식이 아직 확정이 아니라
  // 특정 동작을 단정하지 않는 중립적인 문구로 둡니다. (실제로 회수되면 성공 메시지에 포인트 N점 회수로 표시됨)
  if (report.status === 'approved' && status !== 'approved') {
    if (!confirm('이미 승인되어 포인트가 지급된 제보예요. 계속할까요?')) return;
  }
  const buttons = row.querySelectorAll('.admin-actions button');
  buttons.forEach(b => b.disabled = true);
  try {
    const res = await apiRequest('/api/reports/' + report.id + '/status', {
      method: 'PATCH',
      headers: { ...adminAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    // 목록에서 걸러지는 탭이면 목록에서 빼고, 아니면 내용을 갱신
    if (currentStatus && currentStatus !== status) {
      currentReports = currentReports.filter(r => r.id !== report.id);
    } else {
      currentReports = currentReports.map(r => r.id === res.report.id ? res.report : r);
    }
    const pointsMsg = res.points_awarded ? (' (포인트 ' + res.points_awarded + '점 지급)')
      : res.points_revoked ? (' (포인트 ' + res.points_revoked + '점 회수)') : '';
    renderReportList([(status === 'approved' ? '승인했어요.' : '반려했어요.') + pointsMsg, 'ok']);
  } catch (err) {
    if (handleAuthExpiry(err)) return;
    buttons.forEach(b => b.disabled = false);
    setListMsg(errorMessage(err));
  }
}

document.getElementById('adminSearch').addEventListener('input', e => {
  reportSearchQuery = e.target.value;
  document.getElementById('adminSearchClear').hidden = reportSearchQuery === '';
  renderReportList();
});
document.getElementById('adminSearchClear').addEventListener('click', () => {
  const input = document.getElementById('adminSearch');
  input.value = '';
  reportSearchQuery = '';
  document.getElementById('adminSearchClear').hidden = true;
  renderReportList();
  input.focus();
});

document.getElementById('adminTabs').addEventListener('click', e => {
  const btn = e.target.closest('.admin-tab');
  if (!btn) return;
  document.querySelectorAll('#adminTabs .admin-tab').forEach(b => b.classList.toggle('active', b === btn));
  currentStatus = btn.dataset.status;
  loadReports();
});

// apiRequest는 authHeader()(주민 로그인 토큰)를 자동으로 붙이지 않으므로, 이 파일의 모든 요청에
// adminAuthHeader()를 직접 붙입니다. (2026-10-01: 목록 조회도 비로그인이면 approved 외 상태가 403이라 필요해짐)

// ----- 큰 섹션 전환: 제보 검토 / 신고 관리 -----

function switchSection(section) {
  document.querySelectorAll('#adminSectionTabs .admin-tab').forEach(b => b.classList.toggle('active', b.dataset.section === section));
  document.getElementById('reportsView').hidden = section !== 'reports';
  document.getElementById('moderationView').hidden = section !== 'moderation';
  document.getElementById('usersView').hidden = section !== 'users';
  if (section === 'moderation' && !modLoadedOnce) { modLoadedOnce = true; renderModStatusTabs(); loadModeration(); }
  if (section === 'users' && !usersLoadedOnce) { usersLoadedOnce = true; loadUsers(); }
}

document.getElementById('adminSectionTabs').addEventListener('click', e => {
  const btn = e.target.closest('.admin-tab');
  if (!btn) return;
  switchSection(btn.dataset.section);
});

// 신고 카드의 "이 제보 검토하러 가기"에서 호출: 제보 검토 탭(전체)으로 이동해 해당 제보를 찾아 강조합니다
async function goToReport(reportId) {
  switchSection('reports');
  currentStatus = '';
  document.querySelectorAll('#adminTabs .admin-tab').forEach(b => b.classList.toggle('active', b.dataset.status === ''));
  await loadReports();
  const row = document.querySelector('#adminList .admin-row[data-report-id="' + reportId + '"]');
  if (!row) { setListMsg('그 제보를 찾을 수 없어요. 이미 삭제됐을 수 있어요.'); return; }
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.add('admin-row-highlight');
  setTimeout(() => row.classList.remove('admin-row-highlight'), 2500);
}

// ----- 신고 관리: 잘못된 정보 신고 / 정보 변경 신고 -----

const FLAG_REASON_LABEL = { bad_photo: '부적절한 사진', wrong_info: '실제와 다른 정보', duplicate: '중복된 제보', etc: '기타' };
const CHANGE_REASON_LABEL = {
  obstacle_removed: '장애물 제거됨', construction_done: '공사 종료', now_passable: '통행 가능해짐',
  now_impassable: '통행 불가로 변경됨', info_different: '그 외 상황이 달라짐', etc: '기타'
};
const FLAG_STATUS_TABS = [['open', '대기 중'], ['resolved', '처리 완료'], ['dismissed', '기각됨'], ['', '전체']];
const CHANGE_STATUS_TABS = [['open', '대기 중'], ['accepted', '반영됨'], ['dismissed', '기각됨'], ['', '전체']];
const MOD_REVIEW_LABEL = { open: '대기 중', resolved: '처리 완료', dismissed: '기각됨', accepted: '반영됨' };

let currentModType = 'flags';    // 'flags' | 'change'
let currentModStatus = 'open';
let modLoadedOnce = false;

function renderModStatusTabs() {
  const tabs = currentModType === 'flags' ? FLAG_STATUS_TABS : CHANGE_STATUS_TABS;
  const box = document.getElementById('modStatusTabs');
  box.textContent = '';
  tabs.forEach(([value, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'admin-tab' + (value === currentModStatus ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => {
      currentModStatus = value;
      document.querySelectorAll('#modStatusTabs .admin-tab').forEach(x => x.classList.toggle('active', x === b));
      loadModeration();
    });
    box.appendChild(b);
  });
}

document.getElementById('modTypeTabs').addEventListener('click', e => {
  const btn = e.target.closest('.admin-tab');
  if (!btn) return;
  document.querySelectorAll('#modTypeTabs .admin-tab').forEach(b => b.classList.toggle('active', b === btn));
  currentModType = btn.dataset.type;
  currentModStatus = 'open';
  renderModStatusTabs();
  loadModeration();
});

function setModMsg(text, kind) {
  const el = document.getElementById('modMsg');
  el.textContent = text || '';
  el.className = 'field-msg' + (text ? ' ' + (kind || 'err') : '');
}

// 작은 사진 한 장 (제보 대표 사진). 없으면 "사진 없음".
function modThumb(url) {
  const box = document.createElement('div');
  box.className = 'admin-photos';
  if (url) {
    const img = document.createElement('img');
    img.src = BASE_URL + url;
    img.alt = '제보 사진';
    img.addEventListener('error', () => img.remove());
    box.appendChild(img);
  } else {
    const span = document.createElement('span');
    span.className = 'admin-nophoto';
    span.textContent = '사진 없음';
    box.appendChild(span);
  }
  return box;
}

function flagRow(f) {
  const row = document.createElement('div');
  row.className = 'admin-row';
  row.appendChild(modThumb(f.report_image));

  const body = document.createElement('div');
  body.className = 'admin-row-body';

  const top = document.createElement('div');
  top.className = 'admin-row-top';
  const badge = document.createElement('span');
  badge.className = 'review-badge ' + (f.status === 'resolved' ? 'approved' : f.status === 'open' ? 'pending' : 'rejected');
  badge.textContent = MOD_REVIEW_LABEL[f.status] || f.status;
  top.appendChild(badge);
  const reportBadge = document.createElement('span');
  reportBadge.className = 'review-badge ' + (f.report_status === 'approved' ? 'approved' : f.report_status === 'pending' ? 'pending' : 'rejected');
  reportBadge.textContent = '제보: ' + (REVIEW_LABEL[f.report_status] || f.report_status);
  top.appendChild(reportBadge);
  body.appendChild(top);

  const title = document.createElement('div');
  title.className = 'my-title';
  title.textContent = FLAG_REASON_LABEL[f.reason] || f.reason;
  body.appendChild(title);

  if (f.description) {
    const desc = document.createElement('div');
    desc.className = 'admin-desc';
    desc.textContent = f.description;
    body.appendChild(desc);
  }

  const meta = document.createElement('div');
  meta.className = 'my-meta';
  meta.textContent = '신고자 ' + f.flagger_nickname + ' · 제보 "' + (f.report_title || '제목 없음') + '"(' + f.report_owner_nickname + ') · ' + formatDate(f.created_at);
  body.appendChild(meta);
  row.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'admin-actions';
  if (f.status === 'open') {
    const resolve = document.createElement('button');
    resolve.type = 'button';
    resolve.className = 'admin-approve';
    resolve.textContent = '처리 완료';
    resolve.addEventListener('click', () => updateFlag(f, 'resolved', row));
    actions.appendChild(resolve);

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'admin-reject';
    dismiss.textContent = '기각';
    dismiss.addEventListener('click', () => updateFlag(f, 'dismissed', row));
    actions.appendChild(dismiss);
  }
  row.appendChild(actions);

  const hint = document.createElement('div');
  hint.className = 'mod-hint';
  const hintText = document.createElement('span');
  hintText.textContent = '신고 처리만으로는 지도에서 안 사라져요. 제보를 반려·삭제하려면 →';
  hint.appendChild(hintText);
  const jump = document.createElement('button');
  jump.type = 'button';
  jump.className = 'mod-jump';
  jump.textContent = '이 제보 검토하러 가기';
  jump.addEventListener('click', () => goToReport(f.report_id));
  hint.appendChild(jump);
  row.appendChild(hint);

  return row;
}

async function updateFlag(f, status, row) {
  const buttons = row.querySelectorAll('.admin-actions button');
  buttons.forEach(b => b.disabled = true);
  try {
    const res = await apiRequest('/api/admin/flags/' + f.id, {
      method: 'PATCH',
      headers: { ...adminAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (currentModStatus && currentModStatus !== status) {
      row.remove();
      if (!document.getElementById('modList').children.length) setModMsg('해당하는 신고가 없어요.', 'ok');
    } else {
      row.replaceWith(flagRow({ ...f, status: res.flag.status }));
    }
    setModMsg(status === 'resolved' ? '처리 완료로 표시했어요.' : '기각했어요.', 'ok');
    refreshModBadge();
  } catch (err) {
    if (handleAuthExpiry(err)) return;
    buttons.forEach(b => b.disabled = false);
    setModMsg(errorMessage(err));
  }
}

function changeRow(c) {
  const row = document.createElement('div');
  row.className = 'admin-row';
  row.appendChild(modThumb(c.report_image));

  const body = document.createElement('div');
  body.className = 'admin-row-body';

  const top = document.createElement('div');
  top.className = 'admin-row-top';
  const badge = document.createElement('span');
  badge.className = 'review-badge ' + (c.status === 'accepted' ? 'approved' : c.status === 'open' ? 'pending' : 'rejected');
  badge.textContent = MOD_REVIEW_LABEL[c.status] || c.status;
  top.appendChild(badge);
  if (c.report_accessibility_status) {
    const s = document.createElement('span');
    s.className = 'status-badge ' + c.report_accessibility_status;
    s.textContent = '현재: ' + (tagLabel[c.report_accessibility_status] || c.report_accessibility_status);
    top.appendChild(s);
  }
  body.appendChild(top);

  const title = document.createElement('div');
  title.className = 'my-title';
  title.textContent = CHANGE_REASON_LABEL[c.reason] || c.reason;
  body.appendChild(title);

  if (c.description) {
    const desc = document.createElement('div');
    desc.className = 'admin-desc';
    desc.textContent = c.description;
    body.appendChild(desc);
  }

  const meta = document.createElement('div');
  meta.className = 'my-meta';
  meta.textContent = '신고자 ' + c.reporter_nickname + ' · 제보 "' + (c.report_title || '제목 없음') + '" · ' + formatDate(c.created_at);
  body.appendChild(meta);
  row.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'admin-actions';
  if (c.status === 'open') {
    const select = document.createElement('select');
    select.className = 'mod-select';
    [['', '통행 상태 변경 없음'], ['passable', '→ 통행 가능'], ['inconvenient', '→ 통행 불편'], ['impassable', '→ 통행 불가']]
      .forEach(([v, label]) => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = label;
        select.appendChild(opt);
      });
    // 신고 사유와 맞는 통행 상태를 미리 골라 둡니다 (그대로 두거나 바꿀 수 있음)
    if (c.reason === 'now_passable' || c.reason === 'obstacle_removed' || c.reason === 'construction_done') select.value = 'passable';
    if (c.reason === 'now_impassable') select.value = 'impassable';
    actions.appendChild(select);

    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'admin-approve';
    accept.textContent = '반영하기';
    accept.addEventListener('click', () => reviewChange(c, 'accept', row, select.value || undefined));
    actions.appendChild(accept);

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'admin-reject';
    dismiss.textContent = '기각';
    dismiss.addEventListener('click', () => reviewChange(c, 'dismiss', row));
    actions.appendChild(dismiss);
  }
  row.appendChild(actions);

  return row;
}

async function reviewChange(c, action, row, accessibilityStatus) {
  const buttons = row.querySelectorAll('.admin-actions button, .admin-actions select');
  buttons.forEach(b => b.disabled = true);
  try {
    const body = { action };
    if (action === 'accept' && accessibilityStatus) body.accessibility_status = accessibilityStatus;
    const res = await apiRequest('/api/admin/change-reports/' + c.id, {
      method: 'PATCH',
      headers: { ...adminAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (currentModStatus && currentModStatus !== res.change_report.status) {
      row.remove();
      if (!document.getElementById('modList').children.length) setModMsg('해당하는 신고가 없어요.', 'ok');
    } else {
      row.replaceWith(changeRow({ ...c, status: res.change_report.status }));
    }
    setModMsg(action === 'accept' ? '반영했어요.' : '기각했어요.', 'ok');
    refreshModBadge();
  } catch (err) {
    if (handleAuthExpiry(err)) return;
    buttons.forEach(b => b.disabled = false);
    setModMsg(errorMessage(err));
  }
}

async function loadModeration() {
  setModMsg('불러오는 중…', '');
  const list = document.getElementById('modList');
  list.textContent = '';
  try {
    if (!Object.keys(tagLabel).length) {
      const tags = await fetchTags();
      tags.forEach(t => { tagLabel[t.code] = t.label; });
    }
    const query = currentModStatus ? '?status=' + currentModStatus : '';
    if (currentModType === 'flags') {
      const data = await apiRequest('/api/admin/flags' + query, { headers: adminAuthHeader() });
      setModMsg('');
      if (data.flags.length === 0) { setModMsg('해당하는 신고가 없어요.', 'ok'); return; }
      data.flags.forEach(f => list.appendChild(flagRow(f)));
    } else {
      const data = await apiRequest('/api/admin/change-reports' + query, { headers: adminAuthHeader() });
      setModMsg('');
      if (data.change_reports.length === 0) { setModMsg('해당하는 신고가 없어요.', 'ok'); return; }
      data.change_reports.forEach(c => list.appendChild(changeRow(c)));
    }
  } catch (err) {
    if (handleAuthExpiry(err)) return;
    setModMsg(errorMessage(err));
  }
}

// 신고 관리 탭에 대기 중(open) 신고 개수를 배지로 보여줍니다. (잘못된 정보 신고 + 정보 변경 신고 합계)
// 배지가 실패해도 페이지 동작에는 지장이 없어서, 실패하면 조용히 숨깁니다.
async function refreshModBadge() {
  const badge = document.getElementById('modBadge');
  try {
    const [flagsRes, changeRes] = await Promise.all([
      apiRequest('/api/admin/flags?status=open', { headers: adminAuthHeader() }),
      apiRequest('/api/admin/change-reports?status=open', { headers: adminAuthHeader() })
    ]);
    const count = flagsRes.flags.length + changeRes.change_reports.length;
    badge.textContent = String(count);
    badge.hidden = count === 0;
  } catch (e) {
    badge.hidden = true;
  }
}

// ----- 회원 관리 (조회 전용. GET /api/admin/users) -----

let usersLoadedOnce = false;
let userPage = 1;
let userRole = '';
let userQuery = '';
let userSearchTimer = null;

function setUserMsg(text, kind) {
  const el = document.getElementById('userMsg');
  el.textContent = text || '';
  el.className = 'field-msg' + (text ? ' ' + (kind || 'err') : '');
}

const ROLE_LABEL = { user: '일반회원', admin: '관리자' };

function userRow(u) {
  const row = document.createElement('div');
  row.className = 'admin-row';

  const body = document.createElement('div');
  body.className = 'admin-row-body';

  const top = document.createElement('div');
  top.className = 'admin-row-top';
  const roleBadge = document.createElement('span');
  roleBadge.className = 'review-badge ' + (u.role === 'admin' ? 'approved' : 'pending');
  roleBadge.textContent = ROLE_LABEL[u.role] || u.role;
  top.appendChild(roleBadge);
  if (!u.is_active) {
    const inactive = document.createElement('span');
    inactive.className = 'review-badge rejected';
    inactive.textContent = '비활성';
    top.appendChild(inactive);
  }
  body.appendChild(top);

  const title = document.createElement('div');
  title.className = 'my-title';
  title.textContent = u.nickname + ' (' + u.username + ')';
  body.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'my-meta';
  meta.textContent = '포인트 ' + u.points + 'P · 제보 ' + u.report_count + '건 · 가입 ' + formatDate(u.created_at);
  body.appendChild(meta);

  row.appendChild(body);
  return row;
}

function renderUserPagination(p) {
  const box = document.getElementById('userPagination');
  box.textContent = '';
  if (!p || p.total_pages <= 1) return;

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'check-btn';
  prev.textContent = '‹ 이전';
  prev.disabled = p.page <= 1;
  prev.addEventListener('click', () => { userPage = p.page - 1; loadUsers(); });
  box.appendChild(prev);

  const info = document.createElement('span');
  info.className = 'user-page-info';
  info.textContent = p.page + ' / ' + p.total_pages + ' 페이지 (전체 ' + p.total + '명)';
  box.appendChild(info);

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'check-btn';
  next.textContent = '다음 ›';
  next.disabled = p.page >= p.total_pages;
  next.addEventListener('click', () => { userPage = p.page + 1; loadUsers(); });
  box.appendChild(next);
}

async function loadUsers() {
  setUserMsg('불러오는 중…', '');
  const list = document.getElementById('userList');
  list.textContent = '';
  try {
    const params = new URLSearchParams();
    if (userRole) params.set('role', userRole);
    if (userQuery) params.set('q', userQuery);
    params.set('page', String(userPage));
    const data = await apiRequest('/api/admin/users?' + params.toString(), { headers: adminAuthHeader() });
    if (data.users.length === 0) {
      setUserMsg('해당하는 회원이 없어요.', 'ok');
    } else {
      setUserMsg('');
      data.users.forEach(u => list.appendChild(userRow(u)));
    }
    renderUserPagination(data.pagination);
  } catch (err) {
    if (handleAuthExpiry(err)) return;
    setUserMsg(errorMessage(err));
  }
}

document.getElementById('userRoleTabs').addEventListener('click', e => {
  const btn = e.target.closest('.admin-tab');
  if (!btn) return;
  document.querySelectorAll('#userRoleTabs .admin-tab').forEach(b => b.classList.toggle('active', b === btn));
  userRole = btn.dataset.role;
  userPage = 1;
  loadUsers();
});

document.getElementById('userSearch').addEventListener('input', e => {
  userQuery = e.target.value.trim();
  document.getElementById('userSearchClear').hidden = userQuery === '';
  userPage = 1;
  // 검색어를 입력하는 동안은 매 글자마다 요청하지 않고, 입력이 잠깐 멈추면 한 번만 요청합니다.
  clearTimeout(userSearchTimer);
  userSearchTimer = setTimeout(loadUsers, 300);
});
document.getElementById('userSearchClear').addEventListener('click', () => {
  const input = document.getElementById('userSearch');
  input.value = '';
  userQuery = '';
  userPage = 1;
  document.getElementById('userSearchClear').hidden = true;
  loadUsers();
  input.focus();
});

// ----- 시작 -----

(function init() {
  const user = getAdminUser();
  if (getAdminToken() && user && user.role === 'admin') {
    showMain(user);
    loadReports();
    refreshModBadge();
  } else {
    showLogin();
  }
})();
