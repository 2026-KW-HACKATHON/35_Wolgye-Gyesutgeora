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

document.getElementById('reportBtn').addEventListener('click', () => {
  showToast('제보 기능은 다음 단계에서 연결됩니다.', 2500);
});

(async function init() {
  locateMe();
  try {
    setTagInfo(await fetchTags());
    const reports = await fetchReports();
    renderReports(reports);
    if (reports.length === 0) showToast('아직 등록된 제보가 없어요.', 3000);
  } catch (e) {
    console.error(e);
    showToast('서버에 연결할 수 없어요. 백엔드가 켜져 있는지 확인해 주세요.');
  }
})();
