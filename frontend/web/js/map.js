// 지도, 마커, 팝업, 현재 위치

let tagInfo = {};   // code -> { label, category }

const map = L.map('map', { zoomControl: false }).setView(DEFAULT_CENTER, 16);
L.control.zoom({ position: 'topright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);

function setTagInfo(tags) {
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
      photos.appendChild(img);
    });
    box.appendChild(photos);
  }

  const tags = document.createElement('div');
  tags.className = 'tags';
  r.tags.forEach(code => {
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
  return box;
}

// 제보 목록을 마커로 그리기
function renderReports(reports) {
  markerLayer.clearLayers();
  reports.forEach(r => {
    const icon = L.divIcon({
      className: '',
      html: '<div class="pin" style="background:' + markerColor(r.tags) + '"></div>',
      iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14]
    });
    L.marker([r.latitude, r.longitude], { icon })
      .bindPopup(() => popupContent(r), { minWidth: 220 })
      .addTo(markerLayer);
  });
}

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
}
