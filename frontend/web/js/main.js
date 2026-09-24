// 시작점: 화면을 띄우고 서버 데이터를 불러옵니다

<<<<<<< HEAD
function showToast(msg, ms) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.getElementById('app').appendChild(el);
  if (ms) setTimeout(() => el.remove(), ms);
=======
function hideToast() {
  const old = document.querySelector('.toast');
  if (old) old.remove();
}

// 안내 문구. ms를 주면 그 시간 뒤에 사라지고, action({label, onClick})을 주면 버튼(예: 다시 시도)이 붙습니다.
function showToast(msg, ms, action) {
  hideToast();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');

  const text = document.createElement('span');
  text.textContent = msg;
  el.appendChild(text);

  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-btn';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { hideToast(); action.onClick(); });
    el.appendChild(btn);
  }

  document.getElementById('app').appendChild(el);
  if (ms) setTimeout(() => { if (el.isConnected) el.remove(); }, ms);
  return el;
}

// 제보 목록과 태그를 서버에서 불러옵니다. 실패하면 "다시 시도" 버튼을 보여줍니다.
async function loadMapData() {
  const loading = showToast('제보를 불러오는 중이에요…');
  try {
    setTagInfo(await fetchTags());
    const reports = await fetchReports();
    renderReports(reports);
    // 그 사이 다른 안내(예: 로그인 만료)가 떠 있다면 지우지 않고 "불러오는 중"만 치웁니다
    if (loading.isConnected) loading.remove();
    if (reports.length === 0) showToast(REPORT_STATUS ? '승인된 제보가 아직 없어요.' : '아직 등록된 제보가 없어요.', 3000);
  } catch (e) {
    console.error(e);
    showToast(errorMessage(e), 0, { label: '다시 시도', onClick: loadMapData });
  }
>>>>>>> da8bee35ec134ce48e51ae8c11e4cc8ce2a51467
}

// 제보하기: 로그인이 안 되어 있으면 먼저 로그인 창을 띄웁니다
document.getElementById('reportBtn').addEventListener('click', () => {
  if (!isLoggedIn()) {
    openAuth('login', '제보하려면 로그인이 필요해요.', openReport);
    return;
  }
  openReport();
});

<<<<<<< HEAD
(async function init() {
  locateMe();
  restoreSession();
  try {
    setTagInfo(await fetchTags());
    const reports = await fetchReports();
    renderReports(reports);
    if (reports.length === 0) showToast('아직 등록된 제보가 없어요.', 3000);
  } catch (e) {
    console.error(e);
    showToast(errorMessage(e));
  }
=======
// 내 위치 버튼: 시작할 때 위치를 못 받았거나 권한을 거부한 경우 다시 시도할 수 있습니다
document.getElementById('locateBtn').addEventListener('click', () => {
  locateMe(msg => showToast(msg, 5000));
});

// 지도 그림(타일)이 안 뜨면 한 번만 안내합니다 (안내 후 15초 동안은 다시 안내하지 않음)
let tileWarned = false;
baseLayer.on('tileerror', () => {
  if (tileWarned) return;
  tileWarned = true;
  showToast('지도 그림을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.', 5000);
  setTimeout(() => { tileWarned = false; }, 15000);
});

(function init() {
  locateMe();          // 시작할 때 실패해도 안내 없이 기본 위치로 시작 (내 위치 버튼으로 재시도)
  restoreSession();
  loadMapData();
>>>>>>> da8bee35ec134ce48e51ae8c11e4cc8ce2a51467
})();
