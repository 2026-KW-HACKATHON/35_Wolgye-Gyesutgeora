// 지도, 마커, 팝업, 현재 위치

let tagInfo = {};   // code -> { label, category }
let allTags = [];   // 서버에서 받은 태그 전체 (제보 폼의 선택지)
const markersById = {};   // 제보 id -> 지도 마커

const map = L.map('map', { zoomControl: false }).setView(DEFAULT_CENTER, 16);
L.control.zoom({ position: 'topright' }).addTo(map);
<<<<<<< HEAD
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
=======
// 서버 보안 설정(CSP)이 *.tile.openstreetmap.org만 허용하므로 {s}(a, b, c)가 붙은 주소를 씁니다
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

// 서버가 "출처를 보내지 않음(no-referrer)" 헤더를 붙이는데, OpenStreetMap은 출처가 없는 요청에
// "Access blocked" 그림을 돌려줍니다. 그래서 지도 그림 요청에만 접속 주소(origin)를 보냅니다.
const TILE_OPTIONS = { maxZoom: 19, subdomains: 'abc', referrerPolicy: 'origin' };

const baseLayer = L.tileLayer(TILE_URL, {
  ...TILE_OPTIONS,
>>>>>>> da8bee35ec134ce48e51ae8c11e4cc8ce2a51467
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);

function setTagInfo(tags) {
  allTags = tags;
  tagInfo = {};
  tags.forEach(t => { tagInfo[t.code] = { label: t.label, category: t.category }; });
}

// 등록일: 2026.09.20 형식
function formatDate(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
}

// 마커 색: 태그 분류로 결정
function markerColor(codes) {
  const cats = codes.map(c => (tagInfo[c] || {}).category);
  if (cats.includes('physical')) return COLOR.physical;
  if (cats.includes('temp')) return COLOR.temp;
  if (codes.includes('safety_path')) return COLOR.safe;
  return COLOR.other;
}

// 서버에서 받은 글자를 화면에 넣을 때는 항상 textContent로 (악성 문자 방지)
function popupContent(r) {
  const box = document.createElement('div');
  box.className = 'popup';

  if (r.images && r.images.length) {
    const photos = document.createElement('div');
    photos.className = 'photos';
    r.images.forEach(path => {
      const img = document.createElement('img');
      img.src = BASE_URL + path;
      img.alt = '제보 사진';
<<<<<<< HEAD
=======
      // 사진을 못 불러오면 빈 칸 대신 안내 글자를 보여줍니다
      img.addEventListener('error', () => {
        const fail = document.createElement('span');
        fail.className = 'popup-imgfail';
        fail.textContent = '사진을 불러오지 못했어요';
        img.replaceWith(fail);
      });
>>>>>>> da8bee35ec134ce48e51ae8c11e4cc8ce2a51467
      photos.appendChild(img);
    });
    box.appendChild(photos);
  }

<<<<<<< HEAD
  const tags = document.createElement('div');
  tags.className = 'tags';
  r.tags.forEach(code => {
=======
  // 통행 상태(통행 가능/불편/불가)를 색이 있는 표시로 먼저 보여줍니다
  if (r.accessibility_status) {
    const s = document.createElement('div');
    s.className = 'status-badge ' + r.accessibility_status;
    s.textContent = '통행 상태: ' + ((tagInfo[r.accessibility_status] || {}).label || r.accessibility_status);
    box.appendChild(s);
  }

  const tags = document.createElement('div');
  tags.className = 'tags';
  r.tags.forEach(code => {
    // 통행 상태 태그는 위의 표시와 겹치므로 태그 목록에서는 뺍니다
    if (r.accessibility_status && (tagInfo[code] || {}).category === 'accessibility') return;
>>>>>>> da8bee35ec134ce48e51ae8c11e4cc8ce2a51467
    const t = document.createElement('span');
    t.className = 'tag';
    t.textContent = (tagInfo[code] || {}).label || code;
    tags.appendChild(t);
  });
  box.appendChild(tags);

  if (r.description) {
    const d = document.createElement('div');
    d.className = 'desc';
    d.textContent = r.description;
    box.appendChild(d);
  }

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = formatDate(r.created_at) + ' · ' + r.reporter_nickname;
  box.appendChild(meta);
<<<<<<< HEAD
  return box;
}

// 제보 목록을 마커로 그리기
function renderReports(reports) {
  markerLayer.clearLayers();
  Object.keys(markersById).forEach(id => delete markersById[id]);
  reports.forEach(r => {
=======

  // 잘못된 정보 신고 (openFlag는 js/flag.js)
  const flagBtn = document.createElement('button');
  flagBtn.type = 'button';
  flagBtn.className = 'popup-flag';
  flagBtn.textContent = '잘못된 정보 신고';
  flagBtn.addEventListener('click', () => openFlag(r.id));
  box.appendChild(flagBtn);
  return box;
}

// ----- 필터 -----
// 같은 항목 안에서는 "하나라도 맞으면(OR)", 항목이 다르면 "둘 다 맞아야(AND)" 보여줍니다.
// 아무것도 고르지 않은 항목은 제한하지 않습니다. (필터 화면은 js/filter.js)
let allReports = [];   // 서버에서 받은 승인된 제보 전체
const filterState = {
  statuses: new Set(),   // 통행 상태 code (passable | inconvenient | impassable)
  tagCodes: new Set()    // 불편 유형 태그 code (stairs 등)
};

function matchesFilter(r) {
  if (filterState.statuses.size && !filterState.statuses.has(r.accessibility_status)) return false;
  if (filterState.tagCodes.size && !r.tags.some(c => filterState.tagCodes.has(c))) return false;
  return true;
}

function visibleReports() {
  return allReports.filter(matchesFilter);
}

// 고른 조건의 개수 (필터 버튼에 표시)
function filterCount() {
  return filterState.statuses.size + filterState.tagCodes.size;
}

// 제보 목록을 마커로 그리기. 인자를 주면 목록을 새로 받은 것이고, 인자가 없으면 필터만 다시 적용합니다.
function renderReports(reports) {
  if (reports) allReports = reports;
  markerLayer.clearLayers();
  Object.keys(markersById).forEach(id => delete markersById[id]);
  visibleReports().forEach(r => {
>>>>>>> da8bee35ec134ce48e51ae8c11e4cc8ce2a51467
    const icon = L.divIcon({
      className: '',
      html: '<div class="pin" style="background:' + markerColor(r.tags) + '"></div>',
      iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14]
    });
    markersById[r.id] = L.marker([r.latitude, r.longitude], { icon })
      .bindPopup(() => popupContent(r), { minWidth: 220 })
      .addTo(markerLayer);
  });
}

// 지도에서 해당 제보로 이동해 팝업을 엽니다 (목록에 없으면 아무 일도 안 함)
function focusReport(id) {
  const marker = markersById[id];
  if (!marker) return;
  map.setView(marker.getLatLng(), 18);
  marker.openPopup();
}

<<<<<<< HEAD
// 현재 위치 표시
function locateMe() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const ll = [pos.coords.latitude, pos.coords.longitude];
    L.marker(ll, {
      icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      interactive: false, keyboard: false
    }).addTo(map);
    map.setView(ll, 16);
  }, () => { /* 거부/실패 시 기본 위치 유지 */ }, { enableHighAccuracy: true, timeout: 8000 });
=======
// 현재 위치 표시 (파란 점은 하나만 유지). 실패하면 onError(안내 문구)를 부르고 지도는 그대로 둡니다.
let meMarker = null;

function locateMe(onError) {
  if (!navigator.geolocation) {
    if (onError) onError('이 브라우저에서는 위치를 확인할 수 없어요. 지도는 그대로 쓸 수 있어요.');
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    const ll = [pos.coords.latitude, pos.coords.longitude];
    if (meMarker) {
      meMarker.setLatLng(ll);
    } else {
      meMarker = L.marker(ll, {
        icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
        interactive: false, keyboard: false
      }).addTo(map);
    }
    map.setView(ll, 16);
  }, err => {
    if (!onError) return;
    onError(err.code === 1
      ? '위치 권한이 꺼져 있어요. 지도는 그대로 쓸 수 있고, 주소창의 자물쇠 아이콘에서 위치를 허용하면 내 위치를 볼 수 있어요.'
      : '현재 위치를 확인하지 못했어요. 잠시 후 "내 위치" 버튼을 다시 눌러 주세요.');
  }, { enableHighAccuracy: true, timeout: 8000 });
>>>>>>> da8bee35ec134ce48e51ae8c11e4cc8ce2a51467
}
