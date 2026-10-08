// 글씨 크게 보기: 저장된 설정을 가장 먼저 적용합니다 (<head>에서 다른 화면이 그려지기 전에 실행해서
// "작게 보이다가 커지는" 깜빡임을 막습니다). 실제 토글 버튼 동작은 js/textsize.js에 있습니다.
try {
  if (localStorage.getItem('wg_text_lg') === '1') {
    document.documentElement.classList.add('text-lg');
  }
} catch (e) { /* localStorage를 못 쓰는 환경(프라이버시 모드 등)이어도 조용히 무시 */ }
