// 접속할 때마다 서비스 소개를 보여줍니다 (2026-10-08 추가, 2026-10-08 "매번 뜨게" 변경).
// 다른 개발자 피드백: "설명 없이 웹에 접속했을 때 어떤 웹인지 인지하기 힘들다"는 의견을 반영함.
// 원래는 기기당 한 번만(localStorage) 띄웠는데, 오랜만에 다시 접속한 사용자는 그 사이 내용을 잊어버려
// 당황할 수 있다는 의견으로 매번 접속(새로고침 포함) 시 뜨도록 바꿨습니다. 로그인 여부와 상관없이 뜹니다.

const onboardSheet = document.getElementById('onboardSheet');

function closeOnboard() {
  onboardSheet.hidden = true;
}

function maybeShowOnboard() {
  onboardSheet.hidden = false;
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
