// 검색란
// 1) 제보 검색: 지금 지도에 보이는 제보(제목·설명·제보자·태그·통행 상태)에서 찾습니다. 입력하는 즉시 결과가 나옵니다.
//    (필터가 걸려 있으면 필터를 통과한 제보만 찾습니다 — 지도에 보이는 마커와 같은 범위)
// 2) 장소 검색: 월계 주요 장소는 내장 목록에서 바로 찾고, 그 밖의 장소는 "인터넷에서 더 찾기"를 눌렀을 때만
//    OpenStreetMap 검색을 부릅니다. (장소 검색 코드는 js/places.js — 제보 위치 선택 화면과 함께 씁니다)

const searchWrap = document.getElementById('searchWrap');
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const searchClear = document.getElementById('searchClear');

const MAX_REPORT_RESULTS = 8;
let searchPin = null;      // 장소 검색으로 찍은 표시 (하나만 유지)

// ----- 제보 검색 -----

function labelOf(code) {
  return (tagInfo[code] || {}).label || code;
}

// 제보 하나를 검색용 글자 하나로 합칩니다 (소문자)
function reportHaystack(r) {
  const parts = [r.title, r.description, r.reporter_nickname];
  if (r.accessibility_status) parts.push(labelOf(r.accessibility_status));
  r.tags.forEach(c => parts.push(labelOf(c)));
  return parts.filter(Boolean).join(' ').toLowerCase();
}

// 띄어쓰기로 나눈 검색어가 "모두" 들어 있는 제보만 (예: "계단 통행" → 둘 다 있는 제보)
function searchReports(q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return visibleReports().filter(r => {
    const h = reportHaystack(r);
    return terms.every(t => h.includes(t));
  });
}

// ----- 결과 목록 그리기 -----

function clearResults() {
  searchResults.hidden = true;
  searchResults.textContent = '';
}

function addNote(text, isErr) {
  const n = document.createElement('div');
  n.className = 'search-note' + (isErr ? ' err' : '');
  n.textContent = text;
  searchResults.appendChild(n);
}

function addHeading(text) {
  const h = document.createElement('div');
  h.className = 'search-heading';
  h.textContent = text;
  searchResults.appendChild(h);
}

function addItem(title, sub, onClick, extraClass) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'search-item' + (extraClass ? ' ' + extraClass : '');
  const t = document.createElement('div');
  t.className = 'search-item-title';
  t.textContent = title;
  b.appendChild(t);
  if (sub) {
    const s = document.createElement('div');
    s.className = 'search-item-sub';
    s.textContent = sub;
    b.appendChild(s);
  }
  b.addEventListener('click', onClick);
  searchResults.appendChild(b);
}

function reportTitle(r) {
  const types = r.tags.filter(c => c !== r.accessibility_status).map(labelOf);
  return r.title || types.join(', ') || '제보';
}

function selectReport(r) {
  clearResults();
  searchInput.blur();
  focusReport(r.id);   // 지도를 그 마커로 옮기고 팝업을 엽니다 (map.js)
}

function renderResults(q) {
  searchResults.textContent = '';
  const found = searchReports(q);

  if (found.length === 0) {
    addNote('일치하는 제보가 없어요.');
  } else {
    addHeading('제보 ' + found.length + '건');
    found.slice(0, MAX_REPORT_RESULTS).forEach(r => {
      const sub = r.tags.map(labelOf).join(', ') + ' · ' + formatDate(r.created_at);
      addItem(reportTitle(r), sub, () => selectReport(r));
    });
    if (found.length > MAX_REPORT_RESULTS) addNote('그 밖에 ' + (found.length - MAX_REPORT_RESULTS) + '건이 더 있어요. 검색어를 더 넣어 보세요.');
  }

  // 장소: 월계 주요 장소(바로) + 인터넷 검색(눌렀을 때만). 장소를 고르면 지도가 그곳으로 이동합니다
  appendPlaceResults(searchResults, q, p => goToPlace(p.lat, p.lng, p.name));
  searchResults.hidden = false;
}

// ----- 장소 검색 -----

function goToPlace(lat, lon, label) {
  clearResults();
  searchInput.blur();
  map.setView([lat, lon], 17);
  if (searchPin) searchPin.remove();
  const pop = document.createElement('div');
  pop.textContent = label;
  searchPin = L.marker([lat, lon], {
    icon: L.divIcon({ className: '', html: '<div class="search-pin"></div>', iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12] })
  }).addTo(map).bindPopup(pop).openPopup();
}

// ----- 입력 이벤트 -----

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  searchClear.hidden = searchInput.value === '';
  if (q === '') { clearResults(); return; }
  renderResults(q);   // 결과 상자를 새로 그리므로, 진행 중이던 인터넷 검색 결과는 자동으로 버려집니다
});

searchInput.addEventListener('focus', () => {
  const q = searchInput.value.trim();
  if (q !== '') renderResults(q);
});

// Enter: 일치하는 제보 → 없으면 내장 장소 → 없으면 인터넷 장소 검색 순으로 첫 번째 결과로 이동
searchForm.addEventListener('submit', e => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (q === '') return;
  const found = searchReports(q);
  if (found.length > 0) { selectReport(found[0]); return; }
  const places = findLocalPlaces(q);
  if (places.length > 0) { goToPlace(places[0].lat, places[0].lng, places[0].name); return; }
  renderResults(q);
  const onlineRow = searchResults.querySelector('.search-item.place');
  if (onlineRow) onlineRow.click();   // 내장 목록에도 없으면 바로 인터넷 검색을 시도합니다
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.hidden = true;
  clearResults();
  if (searchPin) { searchPin.remove(); searchPin = null; }
  searchInput.focus();
});

// 검색란 바깥(지도 등)을 누르거나 Esc를 누르면 결과 목록을 닫습니다
// (눌린 버튼이 그 사이 화면에서 지워질 수 있어서, contains(e.target) 대신 클릭 당시의 경로(composedPath)로 판단합니다)
document.addEventListener('click', e => {
  if (!e.composedPath().includes(searchWrap)) clearResults();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !searchResults.hidden) clearResults();
});
