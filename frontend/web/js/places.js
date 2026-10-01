// 장소 검색 (메인 검색란과 제보 위치 선택 화면이 함께 씁니다)
//
// 1) 월계 주요 장소(LOCAL_PLACES): 프론트에 내장한 목록이라 인터넷·서버 설정과 상관없이 바로 검색됩니다.
//    좌표는 OpenStreetMap 장소 검색(2026-09)으로 확인한 "대략적인" 값입니다.
// 2) 인터넷 장소 검색(searchOnlinePlaces): 목록에 없는 장소를 OpenStreetMap(Nominatim)에서 찾습니다.
//    2026-10-01 백엔드가 CSP(connect-src)에 https://nominatim.openstreetmap.org를 허용해서 이제 실제로 동작합니다.
//    (혹시 네트워크 문제 등으로 실패해도 실패를 숨기지 않고 안내만 합니다 — 코드는 그대로 둠)

const LOCAL_PLACES = [
  { name: '광운대학교',       alias: ['광운대', '광대', 'kwangwoon'], lat: 37.6208,  lng: 127.0578,  area: '월계1동' },
  { name: '광운대역',         alias: [],                              lat: 37.6237,  lng: 127.06182, area: '월계1동' },
  { name: '월계1동 주민센터', alias: ['월계1동주민센터'],              lat: 37.61993, lng: 127.06292, area: '월계1동' },
  { name: '월계역',           alias: [],                              lat: 37.63411, lng: 127.05892, area: '월계3동 인근' },
  { name: '월계2동 주민센터', alias: ['월계2동주민센터'],              lat: 37.63249, lng: 127.0507,  area: '월계2동' },
  { name: '월계초등학교',     alias: [],                              lat: 37.62758, lng: 127.05086, area: '월계동' },
  { name: '월계중학교',       alias: [],                              lat: 37.63027, lng: 127.05188, area: '월계동' },
  { name: '월계고등학교',     alias: [],                              lat: 37.63166, lng: 127.04871, area: '월계동' },
  { name: '초안산',           alias: [],                              lat: 37.63878, lng: 127.04681, area: '노원구' },
  { name: '월계1동 (동 중심)', alias: ['월계1동', '월계동', '월계'],     lat: 37.62278, lng: 127.05719, area: '노원구' }
];

const normPlace = s => String(s || '').replace(/\s+/g, '').toLowerCase();

// 검색어와 맞는 내장 장소 찾기. 띄어쓰기는 무시하고, 이름·별칭이 검색어를 포함하거나 검색어가 이름을 포함하면 맞는 것으로 봅니다.
function findLocalPlaces(q) {
  const nq = normPlace(q);
  if (nq.length < 2) return [];
  const hits = LOCAL_PLACES.filter(p => {
    const names = [p.name].concat(p.alias).map(normPlace);
    return names.some(n => n.includes(nq) || (n.length >= 3 && nq.includes(n)));
  });
  // 이름이 검색어와 똑같은 것을 앞으로
  hits.sort((a, b) => (normPlace(b.name) === nq) - (normPlace(a.name) === nq));
  return hits;
}

// 인터넷 장소 검색: [{ name, sub, lat, lng }]. 실패하면 오류를 던집니다.
async function searchOnlinePlaces(q) {
  // 월계 일대(viewbox)를 우선해서 찾고, 한국 안의 결과만 받습니다
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&accept-language=ko&countrycodes=kr&limit=5'
    + '&viewbox=126.95,37.70,127.15,37.55&bounded=0&q=' + encodeURIComponent(q);
  // 서버가 Referrer-Policy: no-referrer를 붙이므로, 이 요청에만 출처를 보냅니다 (지도 그림 때와 같은 이유)
  const res = await fetch(url, { referrerPolicy: 'origin' });
  if (!res.ok) throw new Error('status ' + res.status);
  const list = await res.json();
  return list.map(p => {
    const parts = p.display_name.split(',').map(s => s.trim());
    return { name: p.name || parts[0], sub: parts.slice(1, 4).join(', '), lat: Number(p.lat), lng: Number(p.lon) };
  });
}

// ----- 결과 상자에 그리기 (검색란·위치 선택 화면 공통) -----
// 클래스 이름(search-heading, search-item, search-note)은 style.css의 검색란 스타일을 그대로 씁니다.

function placeNote(text, isErr) {
  const n = document.createElement('div');
  n.className = 'search-note' + (isErr ? ' err' : '');
  n.textContent = text;
  return n;
}

function placeHeading(text) {
  const h = document.createElement('div');
  h.className = 'search-heading';
  h.textContent = text;
  return h;
}

function placeButton(title, sub, onClick, extraClass) {
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
  return b;
}

// 인터넷 검색을 실행해서 결과(또는 실패 안내)를 box에 그립니다
async function runOnlineSearch(box, q, onPick) {
  box.textContent = '';
  box.appendChild(placeNote('장소를 찾는 중이에요…'));
  try {
    const list = await searchOnlinePlaces(q);
    if (!box.isConnected) return;   // 그 사이 검색어가 바뀌어 이 상자가 지워졌다면 결과를 버립니다
    box.textContent = '';
    if (list.length === 0) {
      box.appendChild(placeNote('찾는 장소가 없어요. 다른 이름으로 검색해 보세요.'));
      return;
    }
    box.appendChild(placeHeading('인터넷 검색 결과 ' + list.length + '곳'));
    list.forEach(p => box.appendChild(placeButton(p.name, p.sub, () => onPick(p))));
  } catch (e) {
    if (!box.isConnected) return;
    box.textContent = '';
    box.appendChild(placeNote('인터넷 장소 검색을 쓸 수 없어요. 인터넷 연결을 확인해 주세요. (서버 보안 설정이 외부 접속을 막고 있으면 백엔드에서 허용해야 해요)', true));
  }
}

// container에 장소 결과를 덧붙입니다: 내장 장소 → "인터넷에서 더 찾기" 줄. 장소를 고르면 onPick({name, lat, lng})
function appendPlaceResults(container, q, onPick) {
  const local = findLocalPlaces(q);
  if (local.length > 0) {
    container.appendChild(placeHeading('월계 주요 장소 ' + local.length + '곳'));
    local.slice(0, 6).forEach(p => container.appendChild(placeButton(p.name, p.area, () => onPick(p))));
  }
  const box = document.createElement('div');
  container.appendChild(box);
  box.appendChild(placeButton('🌐 "' + q + '" 인터넷에서 더 찾기', '', () => runOnlineSearch(box, q, onPick), 'place'));
}
