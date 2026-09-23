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

function formatDate(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

const REVIEW_LABEL = { pending: '검토 중', approved: '승인됨', rejected: '반려됨', duplicate: '중복 제보' };

function reportRow(r) {
  const row = document.createElement('div');
  row.className = 'admin-row';

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
  row.appendChild(actions);

  return row;
}

async function loadReports() {
  setListMsg('불러오는 중…', '');
  const list = document.getElementById('adminList');
  list.textContent = '';
  try {
    if (!Object.keys(tagLabel).length) {
      const tags = await fetchTags();
      tags.forEach(t => { tagLabel[t.code] = t.label; });
    }
    const query = currentStatus ? '?status=' + currentStatus : '';
    const data = await apiRequest('/api/reports' + query);
    const reports = data.reports;
    setListMsg('');
    if (reports.length === 0) {
      setListMsg('해당하는 제보가 없어요.', 'ok');
      return;
    }
    reports.forEach(r => list.appendChild(reportRow(r)));
  } catch (err) {
    setListMsg(errorMessage(err));
  }
}

async function changeStatus(report, status, row) {
  // 이미 승인(포인트 지급)됐던 제보를 반려로 바꿔도, 지급된 포인트는 자동으로 회수되지 않습니다.
  if (report.status === 'approved' && status === 'rejected') {
    if (!confirm('이미 승인되어 포인트가 지급된 제보예요. 반려로 바꿔도 지급된 포인트는 자동으로 회수되지 않아요. 계속할까요?')) return;
  }
  const buttons = row.querySelectorAll('.admin-actions button');
  buttons.forEach(b => b.disabled = true);
  try {
    const res = await apiRequest('/api/reports/' + report.id + '/status', {
      method: 'PATCH',
      headers: { ...adminAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    // 목록에서 걸러지는 탭이면 사라지고, 아니면 배지만 갱신
    if (currentStatus && currentStatus !== status) {
      row.remove();
      if (!document.getElementById('adminList').children.length) setListMsg('해당하는 제보가 없어요.', 'ok');
    } else {
      row.replaceWith(reportRow(res.report));
    }
    const pointsMsg = res.points_awarded ? (' (포인트 ' + res.points_awarded + '점 지급)') : '';
    setListMsg((status === 'approved' ? '승인했어요.' : '반려했어요.') + pointsMsg, 'ok');
  } catch (err) {
    buttons.forEach(b => b.disabled = false);
    setListMsg(errorMessage(err));
  }
}

document.getElementById('adminTabs').addEventListener('click', e => {
  const btn = e.target.closest('.admin-tab');
  if (!btn) return;
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b === btn));
  currentStatus = btn.dataset.status;
  loadReports();
});

// apiRequest는 authHeader()(주민 로그인 토큰)를 자동으로 붙이지 않으므로,
// 목록 조회(인증 불필요)는 그대로 두고 상태 변경(changeStatus)에서만 관리자 토큰을 직접 붙입니다.

// ----- 시작 -----

(function init() {
  const user = getAdminUser();
  if (getAdminToken() && user && user.role === 'admin') {
    showMain(user);
    loadReports();
  } else {
    showLogin();
  }
})();
