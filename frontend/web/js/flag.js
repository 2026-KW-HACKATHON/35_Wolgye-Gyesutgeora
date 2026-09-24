// 잘못된 정보 신고 창 (지도 팝업의 "잘못된 정보 신고" 버튼에서 열림)
//
// 백엔드에 아직 저장 API가 없습니다. 그래서 이 창은 화면만 먼저 만들어 둔 상태입니다.
// - 제출하면 POST /api/reports/:id/flags 를 실제로 호출해 봅니다.
// - 백엔드에 이 API가 생기기 전(404)에는 "화면만 준비됨"을 솔직히 안내합니다. (성공했다고 속이지 않음)
// - 백엔드가 이 API를 만들면, 프론트를 더 고치지 않아도 그대로 정상 동작합니다.
// 백엔드 요청 사항: POST /api/reports/:id/flags, body { reason, description? }, 로그인 필요.

const flagSheet = document.getElementById('flagSheet');
const flagForm = document.getElementById('flagForm');
const flagDone = document.getElementById('flagDone');

const FLAG_REASONS = [
  { code: 'bad_photo', label: '부적절한 사진' },
  { code: 'wrong_info', label: '실제와 다른 정보' },
  { code: 'duplicate', label: '중복된 제보' },
  { code: 'etc', label: '기타' }
];

let flagReportId = null;
let flagReason = null;

function setFlagMsg(id, text, kind) {
  const el = document.getElementById(id);
  el.textContent = text || '';
  el.className = 'field-msg' + (kind ? ' ' + kind : '');
}

function clearFlagMsgs() {
  setFlagMsg('flagReasonMsg', '');
  setFlagMsg('flagFormMsg', '');
}

function renderReasonPicker() {
  const box = document.getElementById('flagReasonPicker');
  box.textContent = '';
  FLAG_REASONS.forEach(reason => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag-chip';
    chip.textContent = reason.label;
    chip.setAttribute('aria-pressed', flagReason === reason.code);
    chip.classList.toggle('on', flagReason === reason.code);
    chip.addEventListener('click', () => {
      flagReason = reason.code;
      box.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      setFlagMsg('flagReasonMsg', '');
    });
    box.appendChild(chip);
  });
}

function openFlag(reportId) {
  if (!isLoggedIn()) {
    openAuth('login', '신고하려면 로그인이 필요해요.', () => openFlag(reportId));
    return;
  }
  flagReportId = reportId;
  flagReason = null;
  flagForm.reset();
  clearFlagMsgs();
  flagForm.hidden = false;
  flagDone.hidden = true;
  renderReasonPicker();
  flagSheet.hidden = false;
}

function closeFlag() {
  flagSheet.hidden = true;
}

function showFlagDone(text, notSaved) {
  flagForm.hidden = true;
  flagDone.hidden = false;
  document.getElementById('flagDoneText').textContent = text;
  const icon = document.getElementById('flagDoneIcon');
  icon.textContent = notSaved ? '!' : '✓';
  icon.classList.toggle('warn', !!notSaved);
}

async function submitFlag() {
  clearFlagMsgs();
  if (!flagReason) { setFlagMsg('flagReasonMsg', '신고 사유를 선택해 주세요.', 'err'); return; }

  const description = flagForm.elements.description.value.trim();
  await withBusy(document.getElementById('flagSubmit'), async () => {
    try {
      await apiRequest('/api/reports/' + flagReportId + '/flags', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: flagReason, description: description || undefined })
      });
      showFlagDone('신고해 주셔서 고마워요. 검토 후 조치할게요.', false);
    } catch (err) {
      if (err.status === 404) {
        // 백엔드에 저장 API가 아직 없음: 실패를 숨기지 않고 화면만 준비된 상태임을 알려줍니다
        showFlagDone('신고 화면은 준비됐지만, 아직 서버에 저장하는 기능은 없어요. 백엔드 연동 후 실제로 접수될 예정이에요.', true);
      } else if (err.status === 401) {
        clearSession();
        openAuth('login', '로그인이 만료됐어요. 다시 로그인한 뒤 신고해 주세요.');
      } else {
        setFlagMsg('flagFormMsg', errorMessage(err), 'err');
      }
    }
  });
}

document.getElementById('flagClose').addEventListener('click', closeFlag);
document.getElementById('flagDoneClose').addEventListener('click', closeFlag);
flagSheet.addEventListener('click', e => { if (e.target === flagSheet) closeFlag(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !flagSheet.hidden) closeFlag();
});
flagForm.addEventListener('submit', e => { e.preventDefault(); submitFlag(); });
