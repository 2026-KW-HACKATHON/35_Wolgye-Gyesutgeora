// 보행환경 필터 창: 통행 상태와 불편 유형으로 지도에 보이는 제보를 줄입니다.
// 서버에 다시 요청하지 않고, 이미 받은 제보(allReports)를 화면에서 걸러 냅니다. (규칙은 map.js의 matchesFilter)

const filterSheet = document.getElementById('filterSheet');
const filterBtn = document.getElementById('filterBtn');

// 고르고 해제하는 버튼 하나를 만듭니다. set은 filterState의 통행 상태 또는 유형 묶음입니다.
function makeFilterChip(label, set, code) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'tag-chip';
  chip.textContent = label;
  const sync = () => {
    chip.classList.toggle('on', set.has(code));
    chip.setAttribute('aria-pressed', set.has(code));
  };
  sync();
  chip.addEventListener('click', () => {
    if (set.has(code)) set.delete(code); else set.add(code);
    sync();
    renderReports();      // 지도에 바로 반영
    updateFilterUi();
  });
  return chip;
}

function renderFilterPicker() {
  // 통행 상태
  const statusTagList = allTags.filter(t => t.category === STATUS_CATEGORY);
  document.getElementById('filterStatusSection').hidden = statusTagList.length === 0;
  const sBox = document.getElementById('filterStatus');
  sBox.textContent = '';
  statusTagList.forEach(t => sBox.appendChild(makeFilterChip(t.label, filterState.statuses, t.code)));

  // 불편 유형 (제보 창과 같은 분류 제목)
  const tBox = document.getElementById('filterTypes');
  tBox.textContent = '';
  const groups = {};
  allTags.filter(t => t.category !== STATUS_CATEGORY).forEach(t => {
    const key = CATEGORY_LABELS[t.category] || '기타';
    (groups[key] = groups[key] || []).push(t);
  });
  Object.keys(groups).forEach(title => {
    const h = document.createElement('div');
    h.className = 'tag-group-title';
    h.textContent = title;
    tBox.appendChild(h);
    const wrap = document.createElement('div');
    wrap.className = 'tag-group';
    groups[title].forEach(t => wrap.appendChild(makeFilterChip(t.label, filterState.tagCodes, t.code)));
    tBox.appendChild(wrap);
  });
}

// 필터 버튼 글자, 결과 건수, 하단 버튼 글자를 지금 상태에 맞춥니다
function updateFilterUi() {
  const n = filterCount();
  filterBtn.textContent = n > 0 ? '필터 ' + n : '필터';
  filterBtn.classList.toggle('active', n > 0);

  const shown = visibleReports().length;
  const total = allReports.length;
  document.getElementById('filterResult').textContent =
    n === 0 ? '조건을 고르지 않아 전체 ' + total + '건이 보여요.'
            : '조건에 맞는 제보 ' + shown + '건 (전체 ' + total + '건 중)';
  document.getElementById('filterDone').textContent = '지도에서 ' + shown + '건 보기';
}

async function openFilter() {
  setFilterMsg('');
  filterSheet.hidden = false;
  // 시작할 때 태그를 못 받았다면 다시 시도
  if (!allTags.length) {
    try { setTagInfo(await fetchTags()); }
    catch (err) { setFilterMsg(errorMessage(err)); }
  }
  renderFilterPicker();
  updateFilterUi();
}

function closeFilter() {
  filterSheet.hidden = true;
  if (filterCount() > 0 && visibleReports().length === 0) {
    showToast('조건에 맞는 제보가 없어요. 필터를 바꿔 보세요.', 4000);
  }
}

function setFilterMsg(text) {
  const el = document.getElementById('filterMsg');
  el.textContent = text || '';
  el.className = 'field-msg' + (text ? ' err' : '');
}

function resetFilter() {
  filterState.statuses.clear();
  filterState.tagCodes.clear();
  renderReports();
  renderFilterPicker();
  updateFilterUi();
}

filterBtn.addEventListener('click', openFilter);
document.getElementById('filterClose').addEventListener('click', closeFilter);
document.getElementById('filterDone').addEventListener('click', closeFilter);
document.getElementById('filterReset').addEventListener('click', resetFilter);
filterSheet.addEventListener('click', e => { if (e.target === filterSheet) closeFilter(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !filterSheet.hidden) closeFilter();
});

updateFilterUi();
