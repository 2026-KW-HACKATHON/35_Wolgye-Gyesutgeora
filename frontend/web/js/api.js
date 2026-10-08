// 서버 호출은 모두 이 파일에서 합니다. (제보 등록 API는 4단계에서 여기에 추가)

// 서버 오류를 담는 객체: status(HTTP 상태), code(서버 오류 코드, 없을 수 있음),
// data(서버가 보낸 전체 오류 내용. 예: OUT_OF_REGION의 distance_km)
class ApiError extends Error {
  constructor(status, code, message, data) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data || null;
  }
}

// 공통 요청 함수. 실패하면 ApiError를 던집니다.
async function apiRequest(path, options = {}) {
  let res;
  try {
    res = await fetch(BASE_URL + path, options);
  } catch (e) {
    throw new ApiError(0, 'NETWORK', '');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* 본문 없음 */ }
  if (!res.ok) throw new ApiError(res.status, data && data.code, (data && data.error) || '', data);
  return data;
}

// 로그인한 상태면 Authorization 헤더를 만들어 줍니다 (getToken은 auth.js)
function authHeader() {
  const token = getToken();
  return token ? { Authorization: 'Bearer ' + token } : {};
}

function postJson(path, body) {
  return apiRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// 오류 code별 안내 문구. 목록에 없으면 서버가 보낸 메시지를 씁니다.
const ERROR_MESSAGES = {
  NETWORK: '서버에 연결할 수 없어요. 인터넷 연결과 서버 상태를 확인해 주세요.',
  INVALID_USERNAME: '아이디는 영문·숫자·밑줄(_) 4~20자로 입력해 주세요.',
  INVALID_NICKNAME: '닉네임은 2~20자로 입력해 주세요.',
  USERNAME_TAKEN: '이미 사용 중인 아이디예요. 다른 아이디를 입력해 주세요.',
  NICKNAME_TAKEN: '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해 주세요.',
  ITEM_NOT_FOUND: '교환할 수 없는 상품이에요.',
  NO_ROUTE_FOUND: '출발지와 도착지 사이의 보행 경로를 찾지 못했어요. 위치를 다시 확인해 주세요.',
  ROUTING_UNAVAILABLE: '경로 찾기 서비스가 지금 설정 중이에요. 잠시 후 다시 시도해 주세요.',
  UPSTREAM_ERROR: '경로 찾기 서비스에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'
};

function errorMessage(err) {
  if (err.code === 'OUT_OF_REGION') {
    // 제보 등록과 경로 찾기(GET /api/route) 둘 다 이 코드를 쓰므로, 둘 다에 맞는 문구로 씁니다.
    const d = err.data || {};
    let text = '월계1동 서비스 지역 안에서만 이용할 수 있어요.';
    if (d.distance_km != null) text += ' 이 위치는 월계1동 중심에서 약 ' + d.distance_km + 'km 떨어져 있어요.';
    if (d.allowed_radius_km != null) text += ' (이용 가능 반경 ' + d.allowed_radius_km + 'km)';
    return text;
  }
  if (err.code === 'INSUFFICIENT_POINTS') {
    const d = err.data || {};
    return '포인트가 부족해요. (보유 ' + (d.points ?? 0) + 'P / 필요 ' + (d.required ?? '?') + 'P)';
  }
  if (err.code && ERROR_MESSAGES[err.code]) return ERROR_MESSAGES[err.code];
  if (err.status >= 500) return '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
  return err.message || '알 수 없는 오류가 발생했어요. 다시 시도해 주세요.';
}

// ----- 지도 -----

// 태그 목록: [{ id, code, label, category, icon }]
async function fetchTags() {
  return (await apiRequest('/api/tags')).tags;
}

// 지도용 제보 목록 (REPORT_STATUS에 따라 승인된 제보만 받거나 전체를 받음)
async function fetchReports() {
  const query = REPORT_STATUS ? '?status=' + encodeURIComponent(REPORT_STATUS) : '';
  return (await apiRequest('/api/reports' + query)).reports;
}

// 경로 근처의 승인된 제보를 경고로 돌려줍니다. 로그인 불필요.
// 2026-10-08: 백엔드가 TMAP 보행자 길찾기로 실제 보행로 폴리라인을 계산하도록 바뀌었습니다
// (이전엔 출발~도착 직선이었음). 프론트는 응답의 route 배열을 그대로 그리기만 하면 되므로
// js/route.js의 지도 표시 코드는 바뀔 필요가 없습니다.
// 응답: { route, route_distance_m, warnings: [{ report_id, title, distance_m, along_m, tags, accessibility_status }],
//         total_warnings, truncated }
// 실패: 403 OUT_OF_REGION(서비스 지역 밖) / 404 NO_ROUTE_FOUND(보행 경로를 못 찾음) /
//      503 ROUTING_UNAVAILABLE(서버에 TMAP 키 미설정) / 502 UPSTREAM_ERROR(TMAP 쪽 오류) — 전부 errorMessage()가 안내 문구를 만들어 줍니다.
//
// radius_m: 2026-10-08, 아직 직선 경로였을 때 생긴 "거의 모든 제보가 뜨는" 문제를 완화하려고
// 기본값(30m)보다 좁힌 15m를 씁니다. 지금은 실제 보행로 기준이라 이 값이 더 적합할 수도 있어서,
// 실제 써보시고 너무 적게/많이 뜨면 이 숫자만 조정하면 됩니다.
async function fetchRoute(fromLat, fromLng, toLat, toLng) {
  const q = 'from_lat=' + fromLat + '&from_lng=' + fromLng + '&to_lat=' + toLat + '&to_lng=' + toLng + '&radius_m=15';
  return apiRequest('/api/route?' + q);
}

// ----- 제보 등록 -----

// formData: latitude, longitude, tag_ids(쉼표 구분), images(1~3장), description(선택)
// 파일이 들어 있어서 Content-Type은 브라우저가 알아서 붙이도록 직접 지정하지 않습니다.
async function createReport(formData) {
  return (await apiRequest('/api/reports', {
    method: 'POST',
    headers: authHeader(),
    body: formData
  })).report;
}

// 내가 등록한 제보 목록 (로그인 필요): [{ id, title, description, accessibility_status, status, tags, images, created_at }]
async function fetchMyReports() {
  return (await apiRequest('/api/reports/mine', { headers: authHeader() })).reports;
}

// 내 포인트 지급·사용 내역 (2026-10-02 GET /api/points/history 연동됨): [{ type: 'earn'|'spend', amount, reason, reportTitle, itemName, date }] (최신순)
// 지급된 포인트는 회수하지 않기로 확정되어(2026-10-02), 포인트가 줄어드는 경우는 상점 교환(spend)뿐입니다.
// approval_cancelled·report_deleted는 그 기능이 잠깐 있었을 때 쌓인 과거 내역을 위해 라벨만 남겨둡니다.
const POINT_REASON_LABEL = {
  report_approved: '제보 승인',
  change_report_accepted: '정보 변경 신고 채택',
  store_redeem: '지역 상점 교환',
  approval_cancelled: '제보 승인 취소 (반려·중복 처리)',
  report_deleted: '제보 삭제'
};

async function fetchPointHistory() {
  const data = await apiRequest('/api/points/history', { headers: authHeader() });
  // 서버가 이미 최신순으로 주지만, 혹시 몰라 한 번 더 정렬합니다.
  return (data.history || [])
    .map(h => ({
      id: h.id,
      type: h.type === 'earn' ? 'earn' : h.type,
      amount: Math.abs(Number(h.amount) || 0),
      reason: POINT_REASON_LABEL[h.reason] || h.reason,
      reportTitle: h.report_title || '',
      itemName: h.item_name || '',
      date: h.created_at
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ----- 상점 -----

// 포인트로 지역 상점 혜택 교환 (2026-10-02 POST /api/store/redeem 연동됨, 실제 포인트가 차감됩니다).
// 상품 목록(STORE_ITEMS, js/store.js)은 기획안의 세 후보 방식 예시이고, 설문으로 하나가 정해지면 교체될 예정입니다.
// 응답: { user: { points, ... }, redemption: { item_id, item_name, cost, created_at } }
// 실패: 404 ITEM_NOT_FOUND(없는 상품) / 400 INSUFFICIENT_POINTS(포인트 부족, data.points·data.required) / 401(로그인 안 함)
async function redeemStoreItem(itemId) {
  return apiRequest('/api/store/redeem', {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_id: itemId })
  });
}

// 조회수 집계: 지도 팝업을 열 때 호출합니다 (2026-10-01 백엔드 연동). 로그인 없어도 되고(그때는 IP 기준),
// 로그인했으면 사용자 기준으로 하루(한국 시간) 1회만 반영됩니다. 승인된 제보만 집계합니다.
// 응답: { counted: boolean, view_count: number }
function recordView(reportId) {
  return apiRequest('/api/reports/' + reportId + '/view', { method: 'POST', headers: authHeader() });
}

// ----- 로그인·회원가입 -----

// 아이디·닉네임 중복 확인: { available, message }
function checkUsername(username) {
  return apiRequest('/api/auth/check-username?username=' + encodeURIComponent(username));
}

function checkNickname(nickname) {
  return apiRequest('/api/auth/check-nickname?nickname=' + encodeURIComponent(nickname));
}

// 가입·로그인 성공 시 { token, user } 반환
function registerUser(username, nickname, password) {
  return postJson('/api/auth/register', { username, nickname, password });
}

function loginUser(username, password) {
  return postJson('/api/auth/login', { username, password });
}

// 내 정보 (토큰 확인용): { user }
function fetchMe() {
  return apiRequest('/api/auth/me', { headers: authHeader() });
}
