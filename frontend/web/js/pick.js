// 지도에서 점 하나를 직접 고르는 화면. 제보 위치 선택(report.js)과 경로 찾기의 출발·도착 선택(route.js)이
// 함께 씁니다. 전체 화면 지도 가운데에 핀이 고정되어 있고, 사용자가 지도를 움직여 핀이 원하는 곳을 가리키게 합니다.
// 위쪽 "장소로 찾기"에 장소 이름을 검색하면 지도가 그 근처로 이동합니다. (장소 검색 코드는 js/places.js)
// (작은 지도를 손가락으로 움직이면 아래 창 스크롤과 부딪혀서, 전체 화면 방식으로 만들었습니다)
//
// 사용법: openPick(onConfirm, { hint, title }) — "이 위치로 정하기"를 누르면 onConfirm(lat, lng)를 부릅니다.
// hint/title을 안 주면 제보용 기본 문구를 씁니다.

const pickSheet = document.getElementById('pickSheet');
const pickHint = document.getElementById('pickHint');
const pickTitleEl = document.querySelector('#pickSheet .pick-title');
const DEFAULT_PICK_HINT = '지도를 움직여서 빨간 핀이 원하는 곳을 가리키게 해 주세요.';
let pickMap = null;
let pickOnConfirm = null;   // 지금 열려 있는 선택 화면이 끝나면 부를 콜백
let pickHintText = DEFAULT_PICK_HINT;   // "내 위치로" 등으로 바뀌었다가 되돌아갈 기본 문구

const pickSearchInput = document.getElementById('pickSearchInput');
const pickResults = document.getElementById('pickResults');

function clearPickResults() {
  pickResults.hidden = true;
  pickResults.textContent = '';
}

// 장소를 고르면 지도가 그곳으로 이동합니다. 핀을 정확한 곳에 맞추는 것은 사용자가 이어서 합니다.
function pickPlace(p) {
  clearPickResults();
  pickSearchInput.value = p.name;
  pickSearchInput.blur();
  pickMap.setView([p.lat, p.lng], 17);
  pickHintText = '"' + p.name + '" 근처로 이동했어요. 지도를 움직여 핀을 정확한 곳에 맞춘 뒤 "이 위치로 정하기"를 눌러 주세요.';
  pickHint.textContent = pickHintText;
}

function renderPickResults(q) {
  pickResults.textContent = '';
  appendPlaceResults(pickResults, q, pickPlace);   // 월계 주요 장소 + 인터넷에서 더 찾기 (js/places.js)
  pickResults.hidden = false;
}

pickSearchInput.addEventListener('input', () => {
  const q = pickSearchInput.value.trim();
  if (q === '') { clearPickResults(); return; }
  renderPickResults(q);
});
pickSearchInput.addEventListener('focus', () => {
  const q = pickSearchInput.value.trim();
  if (q !== '') renderPickResults(q);
});
// Enter: 내장 장소가 있으면 첫 번째로 이동, 없으면 인터넷 검색 시도
pickSearchInput.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const q = pickSearchInput.value.trim();
  if (q === '') return;
  const places = findLocalPlaces(q);
  if (places.length > 0) { pickPlace(places[0]); return; }
  renderPickResults(q);
  const onlineRow = pickResults.querySelector('.search-item.place');
  if (onlineRow) onlineRow.click();
});
// 결과 상자 바깥(지도 등)을 누르면 목록을 닫습니다
// (눌린 버튼이 그 사이 화면에서 지워질 수 있어서, contains(e.target) 대신 클릭 당시의 경로(composedPath)로 판단합니다)
document.addEventListener('click', e => {
  if (!e.composedPath().includes(document.getElementById('pickSearch'))) clearPickResults();
});

function openPick(onConfirm, opts) {
  pickOnConfirm = onConfirm;
  pickHintText = (opts && opts.hint) || DEFAULT_PICK_HINT;
  pickTitleEl.textContent = (opts && opts.title) || '위치 선택';

  pickSheet.hidden = false;   // 보이게 한 뒤에 지도를 만들어야 크기가 맞습니다
  pickHint.textContent = pickHintText;
  pickSearchInput.value = '';
  clearPickResults();

  // 시작 위치: 이미 정한 위치 > 메인 지도가 지금 보고 있는 곳 > 월계1동 기본 위치
  let start = DEFAULT_CENTER;
  if (position) start = [position.lat, position.lng];
  else { const c = map.getCenter(); start = [c.lat, c.lng]; }

  if (!pickMap) {
    pickMap = L.map('pickMap', { zoomControl: false }).setView(start, 17);
    L.control.zoom({ position: 'topright' }).addTo(pickMap);
    L.tileLayer(TILE_URL, { ...TILE_OPTIONS, attribution: '&copy; OpenStreetMap' }).addTo(pickMap);
  } else {
    pickMap.setView(start, 17);
  }
  pickMap.invalidateSize();
}

function closePick() {
  pickSheet.hidden = true;
}

function confirmPick() {
  const c = pickMap.getCenter();   // 화면 가운데 = 핀이 가리키는 곳
  const cb = pickOnConfirm;
  closePick();
  if (cb) cb(c.lat, c.lng);
}

// 선택 화면 안에서 지도를 내 위치로 옮기기
function pickGoMyLocation() {
  if (!navigator.geolocation) { pickHint.textContent = '이 브라우저에서는 내 위치를 확인할 수 없어요. 지도를 직접 움직여 주세요.'; return; }
  pickHint.textContent = '내 위치를 확인하고 있어요…';
  navigator.geolocation.getCurrentPosition(pos => {
    pickMap.setView([pos.coords.latitude, pos.coords.longitude], 17);
    pickHint.textContent = pickHintText;
  }, () => {
    pickHint.textContent = '내 위치를 확인하지 못했어요. 지도를 직접 움직여 주세요.';
  }, { enableHighAccuracy: true, timeout: 8000 });
}

document.getElementById('pickOpen').addEventListener('click', () => {
  openPick(setManualPosition, { hint: '지도를 움직여서 빨간 핀이 제보할 곳을 가리키게 해 주세요.', title: '제보할 위치 선택' });
});
document.getElementById('pickCancel').addEventListener('click', closePick);
document.getElementById('pickConfirm').addEventListener('click', confirmPick);
document.getElementById('pickLocate').addEventListener('click', pickGoMyLocation);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || pickSheet.hidden) return;
  if (!pickResults.hidden) clearPickResults(); else closePick();   // 결과 목록이 열려 있으면 그것부터 닫습니다
});
