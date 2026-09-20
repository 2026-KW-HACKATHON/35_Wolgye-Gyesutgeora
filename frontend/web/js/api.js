// 서버 호출은 모두 이 파일에서 합니다. (제보 등록 API는 4단계에서 여기에 추가)

// 서버 오류를 담는 객체: status(HTTP 상태), code(서버 오류 코드, 없을 수 있음)
class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
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
  if (!res.ok) throw new ApiError(res.status, data && data.code, (data && data.error) || '');
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
  if (err.code && ERROR_MESSAGES[err.code]) return ERROR_MESSAGES[err.code];
  if (err.status >= 500) return '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
  return err.message || '알 수 없는 오류가 발생했어요. 다시 시도해 주세요.';
}

// ----- 지도 -----

// 태그 목록: [{ id, code, label, category, icon }]
async function fetchTags() {
  return (await apiRequest('/api/tags')).tags;
}

// 지도용 제보 목록
async function fetchReports() {
  return (await apiRequest('/api/reports')).reports;
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
