// 글씨 크게 보기 토글 (barrier-free: 로그인 없이, 지도 버튼으로 바로 켜고 끔. 2026-10-08 추가)
// 선택 메뉴 없이 누르면 바로 토글되는 방식 — 어르신 등 사용자가 결정을 한 번만 하면 되게.
// 저장된 값은 js/textsize-init.js가 다음 방문 때도 가장 먼저 적용합니다.
// 2026-10-08: 처음엔 상단바의 "Aa" 아이콘 버튼이었는데, (1) 글자만 봐선 무슨 뜻인지 알기 어렵고
// (2) 상단바가 좁아져 부제목이 더 잘리는 문제가 있어서, 다른 지도 버튼처럼 "글씨 크게" 글자 버튼으로 바꿈.

const TEXT_LG_KEY = 'wg_text_lg';
const textSizeBtn = document.getElementById('textSizeBtn');

function applyTextSize(large) {
  document.documentElement.classList.toggle('text-lg', large);
  textSizeBtn.setAttribute('aria-pressed', large ? 'true' : 'false');
  textSizeBtn.classList.toggle('active', large);
  textSizeBtn.textContent = large ? '글씨 보통' : '글씨 크게';
  // 글씨가 커지면 상단바 높이가 바뀌어서 검색줄 위치도 다시 맞춰야 합니다 (js/layout.js)
  if (typeof layoutTopUI === 'function') layoutTopUI();
}

// textsize-init.js가 이미 적용해 둔 상태에 버튼 표시만 맞춥니다 (다시 토글하지 않음)
applyTextSize(document.documentElement.classList.contains('text-lg'));

textSizeBtn.addEventListener('click', () => {
  const large = !document.documentElement.classList.contains('text-lg');
  applyTextSize(large);
  try { localStorage.setItem(TEXT_LG_KEY, large ? '1' : '0'); } catch (e) { /* 저장 안 돼도 이번 화면에선 그대로 적용됨 */ }
});
