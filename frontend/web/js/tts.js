// 음성 읽어주기 (Web Speech API). 서버·API 키 없이 브라우저 내장 기능만 씁니다.
// 지원하지 않는 브라우저에서는 관련 버튼을 아예 숨겨서, 다른 기능에는 영향이 없습니다.

const ttsAvailable = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

let ttsVoice = null;   // 한국어 음성(고르면 더 자연스럽게 읽어요). 못 찾아도 lang 설정만으로 대부분 동작합니다.

// 음성 목록은 브라우저에 따라 비동기로 늦게 채워질 수 있어 한 번 더 시도합니다
function pickKoreanVoice() {
  const voices = window.speechSynthesis.getVoices();
  ttsVoice = voices.find(v => v.lang === 'ko-KR') || voices.find(v => v.lang && v.lang.startsWith('ko')) || null;
}
if (ttsAvailable) {
  pickKoreanVoice();
  window.speechSynthesis.addEventListener('voiceschanged', pickKoreanVoice);
}

// 지금 읽고 있는 버튼(있으면 하나만) — 다른 버튼을 누르면 이전 읽기는 멈추고 새로 시작합니다
let ttsActiveBtn = null;

function ttsSetBtnState(btn, speaking) {
  btn.classList.toggle('speaking', speaking);
  btn.textContent = speaking ? '⏸ 정지' : '🔊 듣기';
  btn.setAttribute('aria-pressed', speaking);
}

function ttsStop() {
  if (!ttsAvailable) return;
  window.speechSynthesis.cancel();
  if (ttsActiveBtn) { ttsSetBtnState(ttsActiveBtn, false); ttsActiveBtn = null; }
}

// text를 읽어 주는 버튼을 만듭니다. 이 브라우저가 음성을 지원하지 않으면 null을 돌려줘서, 호출한 쪽에서 버튼을 안 붙이면 됩니다.
function makeTtsButton(text, extraClass) {
  if (!ttsAvailable || !text || !text.trim()) return null;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tts-btn' + (extraClass ? ' ' + extraClass : '');
  ttsSetBtnState(btn, false);

  btn.addEventListener('click', () => {
    // 이미 이 버튼이 읽고 있었다면: 멈추기만 하고 끝
    if (ttsActiveBtn === btn) { ttsStop(); return; }

    ttsStop();   // 다른 곳에서 읽고 있었다면 먼저 멈춤
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    if (ttsVoice) utter.voice = ttsVoice;
    utter.rate = 0.95;
    utter.onend = () => { if (ttsActiveBtn === btn) { ttsSetBtnState(btn, false); ttsActiveBtn = null; } };
    utter.onerror = () => { if (ttsActiveBtn === btn) { ttsSetBtnState(btn, false); ttsActiveBtn = null; } };

    ttsActiveBtn = btn;
    ttsSetBtnState(btn, true);
    window.speechSynthesis.speak(utter);
  });

  return btn;
}
