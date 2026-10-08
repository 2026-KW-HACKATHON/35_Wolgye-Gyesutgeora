// 지도, 마커, 팝업, 현재 위치

let tagInfo = {};   // code -> { label, category }
let allTags = [];   // 서버에서 받은 태그 전체 (제보 폼의 선택지)
const markersById = {};   // 제보 id -> 지도 마커
const reportsById = {};   // 제보 id -> 제보 데이터 (상세 시트에 다시 쓰려고 보관)

const map = L.map('map', { zoomControl: false }).setView(DEFAULT_CENTER, 16);
L.control.zoom({ position: 'topright' }).addTo(map);
// 서버 보안 설정(CSP)이 *.tile.openstreetmap.org만 허용하므로 {s}(a, b, c)가 붙은 주소를 씁니다
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

// 서버가 "출처를 보내지 않음(no-referrer)" 헤더를 붙이는데, OpenStreetMap은 출처가 없는 요청에
// "Access blocked" 그림을 돌려줍니다. 그래서 지도 그림 요청에만 접속 주소(origin)를 보냅니다.
const TILE_OPTIONS = { maxZoom: 19, subdomains: 'abc', referrerPolicy: 'origin' };

const baseLayer = L.tileLayer(TILE_URL, {
  ...TILE_OPTIONS,
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

// 마커 분류: 태그 분류로 결정 (2026-10-08 디자인팀 제공, 핀+아이콘 마커로 교체)
function markerCategory(codes) {
  const tags = Array.isArray(codes) ? codes : [];
  const categories = tags.map(code => (tagInfo[code] || {}).category);

  if (categories.includes('physical')) return 'physical';
  if (categories.includes('temp')) return 'temp';
  if (tags.includes('safety_path')) return 'safe';
  return 'other';
}

const CATEGORY_MARKER_ICONS = {
  physical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20h5v-5h5v-5h5V5h3"/></svg>',
  temp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 3 20h18L12 3Z"/><path d="M10 10h4M8 15h8"/></svg>',
  safe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 20 5v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
  other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 10v7"/><path d="M12 7h.01"/><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"/></svg>'
};

const CATEGORY_MARKER_LABELS = {
  physical: '물리적 장애',
  temp: '임시 장애물',
  safe: '여성 안심길',
  other: '기타'
};

// 서버에서 받은 글자를 화면에 넣을 때는 항상 textContent로 (악성 문자 방지)
// 팝업 내용을 자연스러운 한 문장으로 엮어서 음성으로 읽기 좋게 만듭니다 (js/tts.js가 실제로 읽어요)
function popupSpeechText(r) {
  const parts = [];
  if (r.accessibility_status) parts.push('통행 상태, ' + ((tagInfo[r.accessibility_status] || {}).label || r.accessibility_status));
  const typeLabels = r.tags
    .filter(c => !(r.accessibility_status && (tagInfo[c] || {}).category === 'accessibility'))
    .map(c => (tagInfo[c] || {}).label || c);
  if (typeLabels.length) parts.push('불편 유형, ' + typeLabels.join(', '));
  if (r.description) parts.push('설명, ' + r.description);
  return parts.join('. ');
}

// 제보 상세 시트 (마커를 누르면 열림, 기존엔 Leaflet 팝업이었는데 마커 위치에 따라
// 상단바·검색창과 겹쳐서 2026-10-08에 다른 화면과 같은 "아래에서 올라오는 시트"로 바꿨습니다)
const reportDetailSheet = document.getElementById('reportDetailSheet');
let openReportId = null;   // 지금 열려 있는 제보 id (조회수 갱신이 늦게 와도 엉뚱한 시트를 안 건드리게)

function openReportSheet(r) {
  openReportId = r.id;
  const body = document.getElementById('reportDetailBody');
  body.textContent = '';
  body.appendChild(popupContent(r));
  reportDetailSheet.hidden = false;

  // 시트를 열 때마다 조회수 집계를 시도합니다. 실패해도(네트워크 등) 시트 자체는 그대로 보여주면 되므로 조용히 무시합니다.
  recordView(r.id)
    .then(res => {
      if (openReportId === r.id && res && res.view_count != null && res.view_count !== r.view_count) {
        r.view_count = res.view_count;
        body.textContent = '';
        body.appendChild(popupContent(r));
      }
    })
    .catch(() => {});
}

function closeReportSheet() {
  reportDetailSheet.hidden = true;
  openReportId = null;
  ttsStop();   // 닫은 뒤에도 계속 읽으면 어색해서
  const card = reportDetailSheet.querySelector('.sheet');
  card.style.transition = '';
  card.style.transform = '';
  card.style.opacity = '';
}

document.getElementById('reportDetailClose').addEventListener('click', closeReportSheet);
reportDetailSheet.addEventListener('click', e => { if (e.target === reportDetailSheet) closeReportSheet(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !reportDetailSheet.hidden) closeReportSheet();
});

// 옆으로 밀면 닫히게 합니다 (2026-10-08 추가, 스마트폰에서 더 자연스럽게 닫을 수 있도록. ✕ 버튼·바깥
// 클릭·Esc 키는 이것과 별개로 이미 모든 환경에서 됩니다). 컴퓨터는 손가락 스와이프가 없으니, 마우스로
// 눌러서 끄는 동작도 똑같이 지원합니다. 사진을 눌러 크게 보는 동작과 안 헷갈리게, 위아래보다 옆으로
// 더 많이 움직였을 때만 반응하고, 사진·버튼 위에서 마우스를 누르기 시작한 경우는 끌기로 치지 않습니다.
(function enableSwipeToClose() {
  const card = reportDetailSheet.querySelector('.sheet');
  let startX = 0, startY = 0, dx = 0, dragging = false, locked = null;

  function startDrag(x, y) {
    startX = x; startY = y;
    dx = 0; dragging = true; locked = null;
    card.style.transition = 'none';
  }

  // 가로로 끌고 있는 중이면 true를 돌려줍니다 (호출부가 기본 동작을 막을지 판단할 때 씀)
  function moveDrag(x, y) {
    if (!dragging) return false;
    const diffX = x - startX, diffY = y - startY;
    if (locked === null) {
      if (Math.abs(diffX) < 8 && Math.abs(diffY) < 8) return false;   // 방향이 뚜렷해질 때까지 기다림
      locked = Math.abs(diffX) > Math.abs(diffY) ? 'x' : 'y';
    }
    if (locked !== 'x') return false;   // 세로로 더 많이 움직였으면 스크롤로 보고 그대로 둠
    dx = diffX;
    card.style.transform = 'translateX(' + dx + 'px)';
    card.style.opacity = String(Math.max(1 - Math.abs(dx) / 300, 0.3));
    return true;
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    if (locked === 'x' && Math.abs(dx) > 90) {
      closeReportSheet();
      return;
    }
    card.style.transition = 'transform .2s, opacity .2s';
    card.style.transform = '';
    card.style.opacity = '';
  }

  // 손가락(스마트폰) — 사진·버튼(닫기 ✕ 포함) 위에서 시작한 터치는 끌기로 보지 않습니다.
  // (안 그러면 ✕ 버튼을 누를 때도 끌기가 시작돼서 탭이 씹히는 기종이 있었습니다)
  card.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || e.target.closest('img, button, a')) return;
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  });
  card.addEventListener('touchmove', e => {
    if (moveDrag(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault();
  });
  card.addEventListener('touchend', endDrag);
  card.addEventListener('touchcancel', endDrag);

  // 마우스(컴퓨터)
  card.addEventListener('mousedown', e => {
    if (e.target.closest('img, button, a')) return;   // 사진·버튼 클릭은 그대로 동작하게 둠
    startDrag(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', e => moveDrag(e.clientX, e.clientY));
  window.addEventListener('mouseup', endDrag);
})();

// 사진 크게 보기 (2026-10-08 추가) — 제보 상세 시트의 사진을 누르면 화면 전체로 확대해서 보여줍니다.
const photoLightbox = document.getElementById('photoLightbox');
const photoLightboxImg = document.getElementById('photoLightboxImg');

function openLightbox(src) {
  photoLightboxImg.src = src;
  photoLightbox.hidden = false;
}

function closeLightbox() {
  photoLightbox.hidden = true;
  photoLightboxImg.src = '';   // 닫고 나서도 큰 사진을 계속 메모리에 들고 있지 않게
}

document.getElementById('photoLightboxClose').addEventListener('click', closeLightbox);
photoLightbox.addEventListener('click', e => { if (e.target !== photoLightboxImg) closeLightbox(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !photoLightbox.hidden) closeLightbox();
});

function popupContent(r) {
  const box = document.createElement('div');
  box.className = 'popup';

  if (r.images && r.images.length) {
    const photos = document.createElement('div');
    photos.className = 'photos';
    r.images.forEach(path => {
      const src = imageUrl(path);
      const img = document.createElement('img');
      img.src = src;
      img.alt = '제보 사진 (눌러서 크게 보기)';
      // 사진을 못 불러오면 빈 칸 대신 안내 글자를 보여줍니다
      img.addEventListener('error', () => {
        const fail = document.createElement('span');
        fail.className = 'popup-imgfail';
        fail.textContent = '사진을 불러오지 못했어요';
        img.replaceWith(fail);
      });
      img.addEventListener('click', () => openLightbox(src));
      photos.appendChild(img);
    });
    box.appendChild(photos);
  }

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
  // 조회수는 사람 수가 아니라 "사용자·일" 단위 조회 횟수라서(같은 사람이 하루에 여러 번 열어도 1회),
  // 백엔드 문서 권장대로 "N회 조회됨"으로 표시합니다. 0회면 굳이 보여주지 않습니다.
  if (r.view_count > 0) meta.textContent += ' · ' + r.view_count + '회 조회됨';
  box.appendChild(meta);

  // 음성으로 듣기 (barrier-free: 시각적으로 읽기 어려운 분들을 위한 기능, js/tts.js)
  // 이 브라우저가 음성 읽기를 지원하지 않으면 makeTtsButton이 null을 돌려주고, 그때는 버튼을 안 만듭니다.
  const ttsBtn = makeTtsButton(popupSpeechText(r));
  if (ttsBtn) box.appendChild(ttsBtn);

  // 제보 신고 (openFlag는 js/flag.js. 원래 "잘못된 정보 신고"·"현장 상황이 바뀌었어요" 버튼 2개였는데
  // 사용자가 복잡하다고 해서 2026-09-30에 하나로 합침 — 신고 사유는 그 창 안에서 고릅니다)
  const flagBtn = document.createElement('button');
  flagBtn.type = 'button';
  flagBtn.className = 'popup-flag';
  flagBtn.textContent = '제보 신고';
  // 제보 신고 창을 열 때 제보 상세 창이 안 닫히면 그 뒤에 깔려 버려서(2026-10-08 버그), 먼저 닫고 엽니다
  flagBtn.addEventListener('click', () => { closeReportSheet(); openFlag(r.id); });
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
  Object.keys(reportsById).forEach(id => delete reportsById[id]);
  visibleReports().forEach(r => {
    const category = markerCategory(r.tags);
    const icon = L.divIcon({
      className: 'category-marker-leaflet',
      html: '<div class="category-map-icon ' + category + '">' +
            '<div class="category-map-icon__tile">' +
            '<span class="category-map-icon__graphic" aria-hidden="true">' +
            CATEGORY_MARKER_ICONS[category] +
            '</span></div></div>',
      iconSize: [40, 44],
      iconAnchor: [20, 44]
    });
    const marker = L.marker([r.latitude, r.longitude], {
      icon,
      title: CATEGORY_MARKER_LABELS[category]
    })
      .on('click', () => openReportSheet(r))
      .addTo(markerLayer);
    markersById[r.id] = marker;
    reportsById[r.id] = r;
  });
}

// 지도에서 해당 제보로 이동해 상세 시트를 엽니다 (목록에 없으면 아무 일도 안 함)
function focusReport(id) {
  const marker = markersById[id];
  const r = reportsById[id];
  if (!marker || !r) return;
  map.setView(marker.getLatLng(), 18);
  openReportSheet(r);
}

// 현재 위치 표시 (파란 점은 하나만 유지). 실패하면 onError(안내 문구)를 부르고 지도는 그대로 둡니다.
let meMarker = null;

// onSuccess: 위치를 찾은 뒤 호출 (예: "확인 중…" 안내를 치우는 용도). 둘 다 선택.
function locateMe(onError, onSuccess) {
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
    if (onSuccess) onSuccess();
  }, err => {
    if (!onError) return;
    onError(err.code === 1
      ? '위치 권한이 꺼져 있어요. 지도는 그대로 쓸 수 있고, 주소창의 자물쇠 아이콘에서 위치를 허용하면 내 위치를 볼 수 있어요.'
      : '현재 위치를 확인하지 못했어요. 잠시 후 "내 위치" 버튼을 다시 눌러 주세요.');
  }, { enableHighAccuracy: true, timeout: 8000 });
}
