// ===== 설정: 서버 주소는 여기 한 곳만 바꾸면 됩니다 =====
// 백엔드가 이 화면도 함께 보여주므로(같은 서버) 비워 두면 "지금 접속한 주소"를 그대로 씁니다.
// localhost로 열든 192.168.x.x로 열든 자동으로 맞습니다. 서버가 따로 있을 때만 주소를 적으세요. 예: 'http://192.168.0.12:3000'
const BASE_URL = '';

// 사진 주소 만들기: 서버가 돌려준 경로가 이미 완전한 주소(http로 시작)면 그대로 쓰고,
// 아니면(기존처럼 "/uploads/..." 같은 상대경로) BASE_URL을 붙입니다.
// 2026-10-08: 백엔드가 업로드 사진을 Vercel Blob(완전한 외부 URL)으로 옮기면서 필요해짐 — 상대경로 방식도 계속 지원.
function imageUrl(path) {
  if (!path) return path;
  return /^https?:\/\//.test(path) ? path : BASE_URL + path;
}

// 지도에 보여줄 제보의 검토 상태. 'approved'면 승인된 제보만 표시하고, ''(빈 문자열)이면 전체를 표시합니다.
const REPORT_STATUS = 'approved';

// 지도 처음 위치 (월계1동 대략 중심). 현재 위치를 못 받을 때 사용
const DEFAULT_CENTER = [37.6215, 127.0605];

// 태그 분류(category) → 마커 색. 우선순위: 물리적 장애 > 임시 장애물 > 여성 안심길
// 2026-10-08: 디자인팀이 핀+아이콘 마커로 바꾸면서 물리적 장애 색을 주황→빨강으로 변경(나머지는 그대로)
const COLOR = { physical: '#d32f2f', temp: '#fbc02d', safe: '#2e9e5b', other: '#78909c' };
