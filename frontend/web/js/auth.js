// 로그인 상태 저장, 상단 로그인 표시, 로그인·회원가입 창

const TOKEN_KEY = 'wg_token';
const USER_KEY = 'wg_user';

// ----- 로그인 상태 (브라우저에 저장, 새로고침해도 유지) -----
// 저장소를 못 쓰는 환경(시크릿 모드 등)에서도 오류 없이 동작하도록 try/catch로 감쌉니다.

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}

function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
}

function isLoggedIn() {
  return !!getToken();
}

function saveSession(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (e) { /* 저장 실패 시 이번 화면에서만 로그인 유지 안 됨 */ }
  updateAuthBar();
}

function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (e) { /* 무시 */ }
  updateAuthBar();
}

// ----- 상단 바: 로그인 전엔 "로그인" 버튼, 로그인 후엔 동그란 프로필 버튼 하나로 (네이버지도 참고, 2026-10-08) -----
// 닉네임·로그아웃은 이제 상단바가 아니라 프로필 버튼을 눌러 들어가는 마이페이지 안에 있습니다.

function updateAuthBar() {
  const user = getUser();
  const loggedIn = isLoggedIn();
  const mypageBtn = document.getElementById('mypageBtn');
  document.getElementById('authBtn').hidden = loggedIn;
  mypageBtn.hidden = !loggedIn;
  if (loggedIn && user) {
    const nickname = user.nickname || '';
    // 이모지(👤)는 CSS color로 하얀색을 줄 수 없어서(이모지는 고유색 고정) SVG 아이콘으로 교체
    // width/height/fill을 svg 태그에 직접 넣어서(스타일시트 캐시가 안 맞아도) 항상 흰 사람 아이콘이 보이게 함
    mypageBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#FAFAFA" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.69-8 6v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-3.31-3.58-6-8-6Z"/></svg>';
    mypageBtn.setAttribute('aria-label', '마이페이지 (' + nickname + '님)');
  }
  // 로그인 상태가 바뀌면 상단바 버튼 구성이 바뀌어서, 검색줄 위치도 다시 맞춰야 합니다 (js/layout.js)
  if (typeof layoutTopUI === 'function') layoutTopUI();
}

// ----- 로그인·회원가입 창 -----

let onAuthSuccess = null;   // 로그인 성공 후 이어서 할 일 (예: 제보하기)

const authSheet = document.getElementById('authSheet');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

const USERNAME_RE = /^[a-z0-9_]{4,20}$/;

// 입력칸 아래 안내 문구. kind: 'ok' | 'err' | ''
function setMsg(id, text, kind) {
  const el = document.getElementById(id);
  el.textContent = text || '';
  el.className = 'field-msg' + (kind ? ' ' + kind : '');
}

function clearAllMsgs() {
  document.querySelectorAll('#authSheet .field-msg').forEach(el => {
    el.textContent = '';
    el.className = 'field-msg';
  });
}

function switchTab(tab) {
  const isLogin = tab === 'login';
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabRegister').classList.toggle('active', !isLogin);
  document.getElementById('tabLogin').setAttribute('aria-selected', isLogin);
  document.getElementById('tabRegister').setAttribute('aria-selected', !isLogin);
  clearAllMsgs();
}

// note: 창 위에 보여줄 안내 (예: "제보하려면 로그인이 필요해요.")
function openAuth(tab, note, callback) {
  onAuthSuccess = callback || null;
  document.getElementById('authNote').textContent = note || '';
  switchTab(tab || 'login');
  authSheet.hidden = false;
  const first = (tab === 'register' ? registerForm : loginForm).querySelector('input');
  if (first) first.focus();
}

function closeAuth() {
  authSheet.hidden = true;
  onAuthSuccess = null;
  loginForm.reset();
  registerForm.reset();
  clearAllMsgs();
}

// 요청 중에는 버튼을 잠가서 두 번 눌리는 것을 막습니다
async function withBusy(button, task) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = '잠시만요…';
  try { return await task(); }
  finally { button.disabled = false; button.textContent = label; }
}

function finishAuth(data, welcome) {
  saveSession(data.token, data.user);
  const next = onAuthSuccess;
  closeAuth();
  showToast(welcome(data.user), 2500);
  if (next) next();
}

// 아이디·닉네임 형식을 서버 규칙과 똑같이 미리 검사
function readUsername(form) { return form.elements.username.value.trim().toLowerCase(); }
function readNickname(form) { return form.elements.nickname.value.trim(); }

function usernameProblem(v) {
  return USERNAME_RE.test(v) ? '' : ERROR_MESSAGES.INVALID_USERNAME;
}

function nicknameProblem(v) {
  return v.length >= 2 && v.length <= 20 ? '' : ERROR_MESSAGES.INVALID_NICKNAME;
}

// 서버 오류를 알맞은 입력칸 아래에 표시
function showRegisterError(err) {
  const text = errorMessage(err);
  if (err.code === 'USERNAME_TAKEN' || err.code === 'INVALID_USERNAME') setMsg('regUsernameMsg', text, 'err');
  else if (err.code === 'NICKNAME_TAKEN' || err.code === 'INVALID_NICKNAME') setMsg('regNicknameMsg', text, 'err');
  else setMsg('regFormMsg', text, 'err');
}

// 중복 확인 버튼
async function runCheck(button, kind) {
  const isUser = kind === 'username';
  const value = isUser ? readUsername(registerForm) : readNickname(registerForm);
  const msgId = isUser ? 'regUsernameMsg' : 'regNicknameMsg';
  const problem = isUser ? usernameProblem(value) : nicknameProblem(value);
  if (problem) { setMsg(msgId, problem, 'err'); return; }
  await withBusy(button, async () => {
    try {
      const r = await (isUser ? checkUsername(value) : checkNickname(value));
      setMsg(msgId, r.message, r.available ? 'ok' : 'err');
    } catch (err) {
      setMsg(msgId, errorMessage(err), 'err');
    }
  });
}

document.getElementById('tabLogin').addEventListener('click', () => switchTab('login'));
document.getElementById('tabRegister').addEventListener('click', () => switchTab('register'));
document.getElementById('authClose').addEventListener('click', closeAuth);
// 어두운 바깥 영역을 누르면 닫기
authSheet.addEventListener('click', e => { if (e.target === authSheet) closeAuth(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !authSheet.hidden) closeAuth(); });

// 가입 창에서 값을 고치면 이전 중복 확인 결과는 지웁니다
registerForm.elements.username.addEventListener('input', () => setMsg('regUsernameMsg', ''));
registerForm.elements.nickname.addEventListener('input', () => setMsg('regNicknameMsg', ''));

// 비밀번호 확인: 입력하는 즉시 일치 여부를 보여줍니다 (서버로는 보내지 않는 화면 전용 값)
function updatePasswordMatch() {
  const pw = registerForm.elements.password.value;
  const pw2 = registerForm.elements.password2.value;
  if (!pw2) { setMsg('regPassword2Msg', ''); return; }
  if (pw === pw2) setMsg('regPassword2Msg', '비밀번호가 일치해요.', 'ok');
  else setMsg('regPassword2Msg', '비밀번호가 서로 달라요.', 'err');
}
registerForm.elements.password.addEventListener('input', () => {
  setMsg('regPasswordMsg', '');
  updatePasswordMatch();
});
registerForm.elements.password2.addEventListener('input', updatePasswordMatch);

document.getElementById('checkUsernameBtn').addEventListener('click', e => runCheck(e.currentTarget, 'username'));
document.getElementById('checkNicknameBtn').addEventListener('click', e => runCheck(e.currentTarget, 'nickname'));

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  clearAllMsgs();
  const username = readUsername(loginForm);
  const password = loginForm.elements.password.value;
  if (!username || !password) {
    setMsg('loginFormMsg', '아이디와 비밀번호를 입력해 주세요.', 'err');
    return;
  }
  await withBusy(loginForm.querySelector('.primary'), async () => {
    try {
      finishAuth(await loginUser(username, password), u => u.nickname + '님, 환영해요!');
    } catch (err) {
      setMsg('loginFormMsg', errorMessage(err), 'err');
    }
  });
});

registerForm.addEventListener('submit', async e => {
  e.preventDefault();
  clearAllMsgs();
  const username = readUsername(registerForm);
  const nickname = readNickname(registerForm);
  const password = registerForm.elements.password.value;

  const uProblem = usernameProblem(username);
  const nProblem = nicknameProblem(nickname);
  if (uProblem) setMsg('regUsernameMsg', uProblem, 'err');
  if (nProblem) setMsg('regNicknameMsg', nProblem, 'err');
  const pwShort = password.length < 8;
  const pwMismatch = password !== registerForm.elements.password2.value;
  if (pwShort) setMsg('regPasswordMsg', '비밀번호는 8자 이상이어야 해요.', 'err');
  if (pwMismatch) setMsg('regPassword2Msg', '비밀번호가 서로 달라요.', 'err');
  if (uProblem || nProblem || pwShort || pwMismatch) return;

  await withBusy(registerForm.querySelector('.primary'), async () => {
    try {
      finishAuth(await registerUser(username, nickname, password), u => u.nickname + '님, 가입을 환영해요!');
    } catch (err) {
      showRegisterError(err);
    }
  });
});

// 상단 바 버튼: 로그인 창 열기 (로그인 상태에선 이 버튼이 숨고 프로필 버튼이 대신 보임)
document.getElementById('authBtn').addEventListener('click', () => openAuth('login'));

// 로그아웃은 마이페이지 안으로 옮김 (js/mypage.js에서 버튼을 씀)
function logout() {
  clearSession();
  showToast('로그아웃했어요.', 2000);
}

// 시작할 때 저장된 토큰이 아직 유효한지 확인 (만료됐으면 로그아웃 처리)
async function restoreSession() {
  updateAuthBar();
  if (!isLoggedIn()) return;
  try {
    const { user } = await fetchMe();
    saveSession(getToken(), user);
  } catch (err) {
    if (err.status === 401 || err.status === 404) {
      clearSession();
      showToast('로그인이 만료됐어요. 다시 로그인해 주세요.', 3000);
    }
    // 서버 연결 실패 등은 로그인 상태를 그대로 둡니다
  }
}
