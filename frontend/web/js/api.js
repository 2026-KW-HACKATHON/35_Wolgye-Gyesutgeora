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
  NICKNAME_TAKEN: '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해 주세요.'
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

// 경로(직선) 근처의 승인된 제보를 경고로 돌려줍니다 (2026-10-01 백엔드 연동됨). 로그인 불필요.
// 응답: { route, route_distance_m, warnings: [{ report_id, title, distance_m, along_m, tags, accessibility_status }],
//         total_warnings, truncated }
// 경로의 점이 서비스 지역 밖이면 403 OUT_OF_REGION (errorMessage()가 안내 문구를 만들어 줍니다).
async function fetchRoute(fromLat, fromLng, toLat, toLng) {
  const q = 'from_lat=' + fromLat + '&from_lng=' + fromLng + '&to_lat=' + toLat + '&to_lng=' + toLng;
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

// 내 포인트 지급·회수 내역 (2026-10-01 GET /api/points/history 연동됨): [{ type: 'earn'|'revoke', amount, reason, reportTitle, date }] (최신순)
const POINT_REASON_LABEL = {
  report_approved: '제보 승인',
  change_report_accepted: '정보 변경 신고 채택',
  approval_cancelled: '제보 승인 취소 (반려·중복 처리)',
  report_deleted: '제보 삭제'
};

async function fetchPointHistory() {
  const data = await apiRequest('/api/points/history', { headers: authHeader() });
  // 서버가 이미 최신순으로 주지만, 혹시 몰라 한 번 더 정렬합니다.
  return (data.history || [])
    .map(h => ({
      type: h.type === 'revoke' ? 'revoke' : 'earn',
      amount: Math.abs(Number(h.amount) || 0),
      reason: POINT_REASON_LABEL[h.reason] || h.reason,
      reportTitle: h.report_title || '',
      date: h.created_at
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ----- 상점 -----

// 포인트로 지역 상점 혜택 교환 (⚠️ 백엔드 API 준비 전 — 아직 이 주소가 없어서 404가 나며,
// 호출한 쪽(js/store.js)이 그 경우를 "화면만 준비됨"으로 안내합니다. js/flag.js, js/route.js와 같은 방식입니다.
// 상품 목록 자체도 아직 팀이 정하지 않아서, 지금은 프론트에 예시 상품(STORE_ITEMS, js/store.js)만 있습니다.)
// 기대하는 응답: { user: { points, ... } }  (교환 뒤 최신 포인트를 그대로 돌려주면 화면에 바로 반영됩니다)
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
