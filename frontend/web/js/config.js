// ===== 설정: 서버 주소는 여기 한 곳만 바꾸면 됩니다 =====
const BASE_URL = 'http://localhost:3000';

// 지도 처음 위치 (월계1동 대략 중심). 현재 위치를 못 받을 때 사용
const DEFAULT_CENTER = [37.6215, 127.0605];

// 태그 분류(category) → 마커 색. 우선순위: 물리적 장애 > 임시 장애물 > 여성 안심길
const COLOR = { physical: '#f57c00', temp: '#fbc02d', safe: '#2e9e5b', other: '#78909c' };
