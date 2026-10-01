// 제보 신고 창 (지도 팝업의 "제보 신고" 버튼에서 열림)
//
// 원래는 "잘못된 정보 신고"(POST .../flags)와 "현장 상황이 바뀌었어요"(POST .../change-report)를
// 버튼 2개, 창 2개로 나눠 만들었는데, 사용자 판단으로 하나로 합쳤습니다(2026-09-30).
// 이유: 어르신 등 사용자에게 "이게 신고인지 변경신고인지" 먼저 판단하게 하는 게 너무 복잡함.
// → 이제는 신고 사유 하나만 고르면 되고, 그 사유가 어느 종류인지(type: 'flag'|'change')에 따라
//   프론트가 알아서 맞는 API를 호출합니다. 두 API 모두 이미 서버에 연결돼 있습니다.

const flagSheet = document.getElementById('flagSheet');
const flagForm = document.getElementById('flagForm');
const flagDone = document.getElementById('flagDone');

// 제보 자체가 처음부터 잘못됐으면 'flag'(POST .../flags), 제보 이후 상황이 바뀌었으면 'change'(POST .../change-report).
// 사용자에게는 이 구분을 보여주지 않고, 고른 사유에 따라 알아서 맞는 곳으로 보냅니다.
const REPORT_ISSUE_REASONS = [
  { type: 'flag',   code: 'bad_photo',         label: '사진이 이상해요' },
  { type: 'flag',   code: 'wrong_info',        label: '제보 내용이 잘못됐어요' },
  { type: 'flag',   code: 'duplicate',         label: '이미 있는 제보예요' },
  { type: 'change', code: 'obstacle_removed',  label: '장애물이 치워졌어요' },
  { type: 'change', code: 'construction_done', label: '공사가 끝났어요' },
  { type: 'change', code: 'now_passable',      label: '이제 지나갈 수 있어요' },
  { type: 'change', code: 'now_impassable',    label: '이제 지나갈 수 없어요' },
  { type: 'flag',   code: 'etc',               label: '기타' }
];

let flagReportId = null;
let flagReason = null;   // REPORT_ISSUE_REASONS의 code 값

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
  REPORT_ISSUE_REASONS.forEach(reason => {
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
  const reasonInfo = REPORT_ISSUE_REASONS.find(r => r.code === flagReason);

  const description = flagForm.elements.description.value.trim();
  await withBusy(document.getElementById('flagSubmit'), async () => {
    try {
      const path = reasonInfo.type === 'change'
        ? '/api/reports/' + flagReportId + '/change-report'
        : '/api/reports/' + flagReportId + '/flags';
      await apiRequest(path, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reasonInfo.code, description: description || undefined })
      });
      const doneText = reasonInfo.type === 'change'
        ? '알려주셔서 고마워요. 확인 후 반영할게요.'
        : '신고해 주셔서 고마워요. 검토 후 조치할게요.';
      showFlagDone(doneText, false);
    } catch (err) {
      if (err.status === 404) {
        // 혹시 서버에 이 기능이 아직 없다면(연결 전 환경 등), 실패를 숨기지 않고 알려줍니다
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
