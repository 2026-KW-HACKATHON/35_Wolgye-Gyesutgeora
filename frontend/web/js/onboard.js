// 처음 접속한 사용자에게 서비스 소개를 한 번 보여줍니다 (2026-10-08 추가).
// 다른 개발자 피드백: "설명 없이 웹에 접속했을 때 어떤 웹인지 인지하기 힘들다"는 의견을 반영함.
// 로그인 여부와 상관없이 뜨고, 한 번 닫으면 이 기기에서는 다시 안 뜹니다(localStorage).

const ONBOARD_KEY = 'wg_onboarded';
const onboardSheet = document.getElementById('onboardSheet');

function closeOnboard() {
  onboardSheet.hidden = true;
  try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) { /* 저장 안 돼도 이번 화면만 다시 안 뜨면 충분 */ }
}

function maybeShowOnboard() {
  // 주소 끝에 ?onboard=1을 붙이면 이미 한 번 봤어도 강제로 다시 띄웁니다 (디자인 확인·수정용, 2026-10-08)
  const forced = new URLSearchParams(location.search).get('onboard') === '1';
  let seen = false;
  try { seen = localStorage.getItem(ONBOARD_KEY) === '1'; } catch (e) { /* 프라이빗 모드 등 — 매번 보여줘도 무방 */ }
  if (forced || !seen) onboardSheet.hidden = false;
}

document.getElementById('onboardClose').addEventListener('click', closeOnboard);
onboardSheet.addEventListener('click', e => { if (e.target === onboardSheet) closeOnboard(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !onboardSheet.hidden) closeOnboard(); });

// "지도 둘러보기": 그냥 닫고 바로 뒤에 보이는 지도를 보게 둡니다
document.getElementById('onboardBrowse').addEventListener('click', closeOnboard);

// "제보하러 가기": 닫은 뒤 기존 "제보하기" 버튼과 똑같이 동작합니다 (로그인 안 했으면 로그인부터)
document.getElementById('onboardReport').addEventListener('click', () => {
  closeOnboard();
  document.getElementById('reportBtn').click();
});
