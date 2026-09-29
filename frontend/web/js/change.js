// 정보 변경 신고 창 (지도 팝업의 "상황이 바뀌었어요" 버튼에서 열림)
//
// "잘못된 정보 신고"(js/flag.js)와 달리, 제보 자체는 맞았지만 그 뒤 상황이 바뀐 경우입니다
// (예: 공사가 끝났다, 이제 지나갈 수 있다). 백엔드 API는 이미 있습니다.
// - 제출하면 POST /api/reports/:id/change-report 를 호출합니다.
// - 신고는 바로 반영되지 않고, 관리자가 검토해서 반영합니다(admin.html의 "신고 관리" 탭).

const changeSheet = document.getElementById('changeSheet');
const changeForm = document.getElementById('changeForm');
const changeDone = document.getElementById('changeDone');

const CHANGE_REASONS = [
  { code: 'obstacle_removed', label: '장애물 제거됨' },
  { code: 'construction_done', label: '공사 종료' },
  { code: 'now_passable', label: '통행 가능해짐' },
  { code: 'now_impassable', label: '통행 불가로 변경됨' },
  { code: 'info_different', label: '정보가 다름' },
  { code: 'etc', label: '기타' }
];

let changeReportId = null;
let changeReason = null;

function setChangeMsg(id, text, kind) {
  const el = document.getElementById(id);
  el.textContent = text || '';
  el.className = 'field-msg' + (kind ? ' ' + kind : '');
}

function clearChangeMsgs() {
  setChangeMsg('changeReasonMsg', '');
  setChangeMsg('changeFormMsg', '');
}

function renderChangeReasonPicker() {
  const box = document.getElementById('changeReasonPicker');
  box.textContent = '';
  CHANGE_REASONS.forEach(reason => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag-chip';
    chip.textContent = reason.label;
    chip.setAttribute('aria-pressed', changeReason === reason.code);
    chip.classList.toggle('on', changeReason === reason.code);
    chip.addEventListener('click', () => {
      changeReason = reason.code;
      box.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      setChangeMsg('changeReasonMsg', '');
    });
    box.appendChild(chip);
  });
}

function openChangeReport(reportId) {
  if (!isLoggedIn()) {
    openAuth('login', '신고하려면 로그인이 필요해요.', () => openChangeReport(reportId));
    return;
  }
  changeReportId = reportId;
  changeReason = null;
  changeForm.reset();
  clearChangeMsgs();
  changeForm.hidden = false;
  changeDone.hidden = true;
  renderChangeReasonPicker();
  changeSheet.hidden = false;
}

function closeChangeReport() {
  changeSheet.hidden = true;
}

function showChangeDone(text, notSaved) {
  changeForm.hidden = true;
  changeDone.hidden = false;
  document.getElementById('changeDoneText').textContent = text;
  const icon = document.getElementById('changeDoneIcon');
  icon.textContent = notSaved ? '!' : '✓';
  icon.classList.toggle('warn', !!notSaved);
}

async function submitChangeReport() {
  clearChangeMsgs();
  if (!changeReason) { setChangeMsg('changeReasonMsg', '바뀐 내용을 선택해 주세요.', 'err'); return; }

  const description = changeForm.elements.description.value.trim();
  await withBusy(document.getElementById('changeSubmit'), async () => {
    try {
      await apiRequest('/api/reports/' + changeReportId + '/change-report', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: changeReason, description: description || undefined })
      });
      showChangeDone('알려주셔서 고마워요. 확인 후 반영할게요.', false);
    } catch (err) {
      if (err.status === 404) {
        // 혹시 서버에 이 기능이 아직 없다면(연결 전 환경 등), 실패를 숨기지 않고 알려줍니다
        showChangeDone('신고 화면은 준비됐지만, 아직 서버에 저장하는 기능은 없어요. 백엔드 연동 후 실제로 접수될 예정이에요.', true);
      } else if (err.status === 401) {
        clearSession();
        openAuth('login', '로그인이 만료됐어요. 다시 로그인한 뒤 신고해 주세요.');
      } else {
        setChangeMsg('changeFormMsg', errorMessage(err), 'err');
      }
    }
  });
}

document.getElementById('changeClose').addEventListener('click', closeChangeReport);
document.getElementById('changeDoneClose').addEventListener('click', closeChangeReport);
changeSheet.addEventListener('click', e => { if (e.target === changeSheet) closeChangeReport(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !changeSheet.hidden) closeChangeReport();
});
changeForm.addEventListener('submit', e => { e.preventDefault(); submitChangeReport(); });
