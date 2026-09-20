// 시작점: 화면을 띄우고 서버 데이터를 불러옵니다

function showToast(msg, ms) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.getElementById('app').appendChild(el);
  if (ms) setTimeout(() => el.remove(), ms);
}

// 제보하기: 로그인이 안 되어 있으면 먼저 로그인 창을 띄웁니다
document.getElementById('reportBtn').addEventListener('click', () => {
  if (!isLoggedIn()) {
    openAuth('login', '제보하려면 로그인이 필요해요.', openReport);
    return;
  }
  openReport();
});

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
})();
