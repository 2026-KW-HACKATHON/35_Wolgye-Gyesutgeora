// 상단바 아래 UI(검색줄, 확대·축소 버튼, 경로 지우기 버튼)의 위치를 상단바의 실제 렌더링 높이에 맞춰 계산합니다.
// 예전엔 top 값을 숫자로 고정해 뒀는데, "글씨 크게"를 켜거나 닉네임이 길어지면 상단바 높이가 달라져서
// 검색창과 겹치는 문제가 계속 반복돼서(2026-10-08), 실제 높이를 재서 맞추는 방식으로 바꿨습니다.

function layoutTopUI() {
  const topbar = document.querySelector('.topbar');
  const searchWrap = document.getElementById('searchWrap');
  if (!topbar || !searchWrap) return;

  const gap = 10;
  const topbarBottom = topbar.offsetTop + topbar.offsetHeight;
  searchWrap.style.top = (topbarBottom + gap) + 'px';

  // 검색줄(+경로 버튼)까지 포함한 바로 아래 지점 — 확대·축소 버튼, 경로 지우기 버튼이 이 아래로 오게 함
  const searchBottom = searchWrap.offsetTop + searchWrap.offsetHeight;
  document.documentElement.style.setProperty('--below-search', (searchBottom + 8) + 'px');
}

layoutTopUI();
window.addEventListener('load', layoutTopUI);
window.addEventListener('resize', layoutTopUI);
// 구글 폰트가 늦게 로드되면 글자 크기가 바뀌면서 상단바 높이도 바뀔 수 있어서, 폰트 로드 완료 후 다시 계산
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(layoutTopUI).catch(() => {});
}
