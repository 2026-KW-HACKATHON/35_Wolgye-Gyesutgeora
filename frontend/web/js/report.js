// 제보 등록 창 (사진, 현재 위치, 태그, 설명) + 제보 완료 화면

const MAX_PHOTOS = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;                  // 서버 제한과 같음 (10MB)
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];   // 서버 허용 확장자

// 태그 분류(category) → 제목. 서버에 새 분류가 생기면 여기에 추가하세요. 없으면 "기타"로 묶입니다.
// (통행 상태 분류 'accessibility'는 아래에서 따로, 하나만 고르는 버튼으로 보여줍니다)
const CATEGORY_LABELS = {
  physical: '물리적 장애',
  temp: '임시 장애물',
  safety: '안전'
};
const STATUS_CATEGORY = 'accessibility';   // 통행 상태 태그의 분류 (code: passable | inconvenient | impassable)

const reportSheet = document.getElementById('reportSheet');
const reportForm = document.getElementById('reportForm');
const reportDone = document.getElementById('reportDone');
const photoInput = document.getElementById('photoInput');

let photos = [];                 // [{ file, url }] 미리보기용 주소 포함
let position = null;             // { lat, lng }
let selectedTags = new Set();    // 선택한 태그 id (통행 상태 제외)
let selectedStatus = null;       // 선택한 통행 상태 태그 { id, code, label }
let reportFinished = false;      // 제보 완료 화면을 보고 있는지
let lastReport = null;           // 방금 등록한 제보

function setReportMsg(id, text, kind) {
  const el = document.getElementById(id);
  el.textContent = text || '';
  el.className = 'field-msg' + (kind ? ' ' + kind : '');
}

function clearReportMsgs() {
  ['photoMsg', 'locMsg', 'statusMsg', 'tagMsg', 'descMsg', 'reportFormMsg'].forEach(id => setReportMsg(id, ''));
}

// ----- 사진 -----

function fileExt(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}

// 미리보기용 작은 그림(data: 주소)을 만듭니다. 서버 보안 설정(CSP)이 blob: 주소를 막기 때문에
// 사진 원본을 바로 쓰지 않고, 작게 줄인 그림으로 바꿔서 보여줍니다. (전송은 원본 파일 그대로)
async function makeThumb(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 240 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  if (bmp.close) bmp.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}

function addFiles(fileList) {
  const problems = [];
  Array.from(fileList).forEach(file => {
    if (photos.length >= MAX_PHOTOS) {
      problems.push('사진은 최대 ' + MAX_PHOTOS + '장까지 올릴 수 있어요.');
    } else if (!ALLOWED_EXT.includes(fileExt(file.name))) {
      problems.push('사진 파일(jpg, png, webp, heic)만 올릴 수 있어요.');
    } else if (file.size > MAX_FILE_BYTES) {
      problems.push('사진 한 장은 10MB 이하여야 해요.');
    } else {
      const p = { file, url: '', state: 'loading' };   // state: loading | ok | failed
      photos.push(p);
      makeThumb(file)
        .then(url => { p.url = url; p.state = 'ok'; })
        .catch(() => { p.state = 'failed'; })   // 브라우저가 못 여는 형식(예: heic)
        .then(() => { if (photos.includes(p)) renderPhotos(); });
    }
  });
  renderPhotos();
  setReportMsg('photoMsg', problems.length ? problems[0] : '', problems.length ? 'err' : '');
}

function removePhoto(index) {
  photos.splice(index, 1);
  renderPhotos();
  setReportMsg('photoMsg', '');
}

function renderPhotos() {
  const grid = document.getElementById('photoGrid');
  grid.textContent = '';
  photos.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'photo-item';

    if (p.state === 'ok') {
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = '선택한 사진 ' + (i + 1);
      item.appendChild(img);
    } else {
      // 준비 중이거나, 브라우저가 못 보여주는 형식(예: heic)이면 안내 글자로 대신합니다
      const t = document.createElement('span');
      t.className = 'photo-fallback';
      t.textContent = p.state === 'failed' ? '미리보기 없음' : '불러오는 중…';
      item.appendChild(t);
    }

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'photo-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', '사진 ' + (i + 1) + ' 삭제');
    del.addEventListener('click', () => removePhoto(i));
    item.appendChild(del);

    grid.appendChild(item);
  });
  document.getElementById('photoAdd').hidden = photos.length >= MAX_PHOTOS;
  document.getElementById('photoCount').textContent = photos.length + '/' + MAX_PHOTOS;
}

// ----- 현재 위치 (GPS) -----

function setLocation(kind, text) {
  const box = document.getElementById('locBox');
  box.className = 'loc-box ' + kind;
  document.getElementById('locText').textContent = text;
  if (kind !== 'ok') {
    document.getElementById('miniMap').hidden = true;
    document.getElementById('locAddress').hidden = true;
  }
}

// 위치 확인용 작은 지도: 현재 위치 점과 GPS 오차 범위(원)를 보여줍니다. 조작은 막아 둡니다.
let miniMap = null, miniDot = null, miniCircle = null;

function showMiniMap(lat, lng, accuracy) {
  const el = document.getElementById('miniMap');
  el.hidden = false;
  const ll = [lat, lng];
  if (!miniMap) {
    miniMap = L.map(el, {
      zoomControl: false, attributionControl: false,
      dragging: false, touchZoom: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false
    });
    L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(miniMap);
    miniDot = L.marker(ll, {
      icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      interactive: false, keyboard: false
    }).addTo(miniMap);
    miniCircle = L.circle(ll, { radius: accuracy || 0, color: '#1a73e8', weight: 1, fillOpacity: 0.12 }).addTo(miniMap);
  }
  miniDot.setLatLng(ll);
  miniCircle.setLatLng(ll).setRadius(accuracy || 0);
  miniMap.invalidateSize();   // 숨겨져 있다가 나타난 지도의 크기를 다시 계산
  miniMap.setView(ll, 17);
}

// 좌표 → 한국어 주소(대략). OpenStreetMap의 Nominatim 서비스를 사용하며, 실패해도 제보에는 영향이 없습니다.
let addressRequestId = 0;

async function showAddress(lat, lng) {
  const el = document.getElementById('locAddress');
  el.hidden = true;
  const myId = ++addressRequestId;
  try {
    const res = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=ko&lat='
      + lat + '&lon=' + lng);
    if (!res.ok) return;
    const a = (await res.json()).address || {};
    if (myId !== addressRequestId) return;   // 그 사이 위치를 다시 확인했다면 이전 결과는 버림
    const text = [a.city, a.borough || a.city_district, a.suburb || a.neighbourhood, a.road, a.house_number]
      .filter(Boolean).join(' ');
    if (!text) return;
    el.textContent = '대략적인 주소: ' + text;
    el.hidden = false;
  } catch (e) { /* 주소를 못 가져와도 지도로 확인할 수 있어서 조용히 넘어감 */ }
}

function requestLocation() {
  position = null;
  addressRequestId++;
  setReportMsg('locMsg', '');
  if (!navigator.geolocation) {
    setLocation('err', '이 브라우저에서는 위치를 확인할 수 없어요.');
    return;
  }
  setLocation('loading', '현재 위치를 확인하고 있어요…');
  navigator.geolocation.getCurrentPosition(pos => {
    position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    setLocation('ok', '현재 위치를 확인했어요');
    showMiniMap(position.lat, position.lng, pos.coords.accuracy);
    showAddress(position.lat, position.lng);
  }, err => {
    setLocation('err', err.code === 1
      ? '위치 권한이 꺼져 있어요. 주소창의 자물쇠 아이콘에서 위치를 허용한 뒤 "다시 확인"을 눌러 주세요.'
      : '현재 위치를 확인하지 못했어요. "다시 확인"을 눌러 주세요.');
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

// ----- 통행 상태 (하나만 선택) -----

function statusTags() {
  return allTags.filter(t => t.category === STATUS_CATEGORY);
}

function renderStatusPicker() {
  const list = statusTags();
  // 서버에 통행 상태 태그가 없으면(예전 버전) 이 항목은 숨기고 필수로 요구하지 않습니다
  document.getElementById('statusSection').hidden = list.length === 0;
  const box = document.getElementById('statusPicker');
  box.textContent = '';
  list.forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'status-btn';
    btn.dataset.code = t.code;
    btn.textContent = t.label;
    btn.setAttribute('role', 'radio');
    const on = !!selectedStatus && selectedStatus.id === t.id;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', on);
    btn.addEventListener('click', () => {
      selectedStatus = t;
      box.querySelectorAll('.status-btn').forEach(b => {
        const mine = b === btn;
        b.classList.toggle('on', mine);
        b.setAttribute('aria-checked', mine);
      });
      setReportMsg('statusMsg', '');
    });
    box.appendChild(btn);
  });
}

// ----- 태그 -----

function renderTagPicker() {
  const box = document.getElementById('tagPicker');
  box.textContent = '';
  const groups = {};
  allTags.filter(t => t.category !== STATUS_CATEGORY).forEach(t => {
    const key = CATEGORY_LABELS[t.category] || '기타';
    (groups[key] = groups[key] || []).push(t);
  });
  Object.keys(groups).forEach(title => {
    const h = document.createElement('div');
    h.className = 'tag-group-title';
    h.textContent = title;
    box.appendChild(h);

    const wrap = document.createElement('div');
    wrap.className = 'tag-group';
    groups[title].forEach(t => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tag-chip';
      chip.textContent = t.label;
      chip.setAttribute('aria-pressed', selectedTags.has(t.id));
      chip.classList.toggle('on', selectedTags.has(t.id));
      chip.addEventListener('click', () => {
        if (selectedTags.has(t.id)) selectedTags.delete(t.id); else selectedTags.add(t.id);
        chip.classList.toggle('on', selectedTags.has(t.id));
        chip.setAttribute('aria-pressed', selectedTags.has(t.id));
        setReportMsg('tagMsg', '');
      });
      wrap.appendChild(chip);
    });
    box.appendChild(wrap);
  });
}

// ----- 창 열고 닫기 -----

function hasDraft() {
  return photos.length > 0 || selectedTags.size > 0 || !!selectedStatus
    || reportForm.elements.description.value.trim() !== '';
}

async function openReport() {
  photos = [];
  selectedTags = new Set();
  selectedStatus = null;
  lastReport = null;
  reportFinished = false;
  reportForm.reset();
  clearReportMsgs();
  reportForm.hidden = false;
  reportDone.hidden = true;
  renderPhotos();
  reportSheet.hidden = false;
  requestLocation();

  // 시작할 때 태그를 못 받았다면 다시 시도
  if (!allTags.length) {
    try { setTagInfo(await fetchTags()); }
    catch (err) { setReportMsg('tagMsg', errorMessage(err), 'err'); }
  }
  renderStatusPicker();
  renderTagPicker();
}

function closeReport(force) {
  if (!force && !reportFinished && hasDraft() && !confirm('작성 중인 내용이 사라져요. 닫을까요?')) return;
  reportSheet.hidden = true;
  photos = [];
}

// ----- 등록 -----

function showDone(report) {
  reportFinished = true;
  lastReport = report;
  reportForm.hidden = true;
  reportDone.hidden = false;
  reportSheet.querySelector('.sheet').scrollTop = 0;

  const labels = (report.tags || []).map(c => (tagInfo[c] || {}).label || c);
  document.getElementById('doneSummary').textContent =
    labels.join(', ') + ' · 사진 ' + ((report.images || []).length) + '장';
}

async function submitReport() {
  clearReportMsgs();
  let bad = false;
  if (photos.length === 0) { setReportMsg('photoMsg', '사진을 1장 이상 올려 주세요.', 'err'); bad = true; }
  if (!position) { setReportMsg('locMsg', '현재 위치를 확인한 뒤에 등록할 수 있어요.', 'err'); bad = true; }
  if (statusTags().length > 0 && !selectedStatus) { setReportMsg('statusMsg', '통행 상태를 선택해 주세요.', 'err'); bad = true; }
  if (selectedTags.size === 0) { setReportMsg('tagMsg', '어떤 불편인지 1개 이상 선택해 주세요.', 'err'); bad = true; }
  if (bad) return;

  const fd = new FormData();
  fd.append('latitude', position.lat);
  fd.append('longitude', position.lng);
  // 통행 상태는 전용 칸(accessibility_status)과 태그 양쪽에 모두 기록합니다 (백엔드 샘플 데이터와 같은 방식)
  const tagIds = Array.from(selectedTags);
  if (selectedStatus) {
    tagIds.push(selectedStatus.id);
    fd.append('accessibility_status', selectedStatus.code);
  }
  fd.append('tag_ids', tagIds.join(','));
  const desc = reportForm.elements.description.value.trim();
  if (desc) fd.append('description', desc);
  photos.forEach(p => fd.append('images', p.file));

  await withBusy(document.getElementById('reportSubmit'), async () => {
    try {
      const report = await createReport(fd);
      showDone(report);
      // 지도에 새 제보가 바로 보이도록 목록을 다시 불러옵니다 (실패해도 등록은 성공한 상태)
      try { renderReports(await fetchReports()); } catch (e) { /* 무시 */ }
    } catch (err) {
      if (err.status === 401) {
        // 로그인이 만료됨: 작성 내용은 그대로 두고 다시 로그인하게 합니다
        clearSession();
        openAuth('login', '로그인이 만료됐어요. 다시 로그인한 뒤 등록 버튼을 눌러 주세요.');
        return;
      }
      setReportMsg('reportFormMsg', errorMessage(err), 'err');
    }
  });
}

// ----- 이벤트 연결 -----

document.getElementById('reportClose').addEventListener('click', () => closeReport(false));
reportSheet.addEventListener('click', e => { if (e.target === reportSheet) closeReport(false); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !reportSheet.hidden && authSheet.hidden) closeReport(false);
});

document.getElementById('photoAdd').addEventListener('click', () => photoInput.click());
photoInput.addEventListener('change', () => {
  addFiles(photoInput.files);
  photoInput.value = '';   // 같은 사진을 다시 고를 수 있게 비움
});

document.getElementById('locRetry').addEventListener('click', requestLocation);

reportForm.addEventListener('submit', e => {
  e.preventDefault();
  submitReport();
});

document.getElementById('doneMapBtn').addEventListener('click', () => {
  const id = lastReport && lastReport.id;
  closeReport(true);
  if (id) focusReport(id);
});
