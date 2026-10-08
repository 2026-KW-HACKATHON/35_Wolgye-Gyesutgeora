// 경로 찾기: 출발·도착을 정하면 서버가 실제 보행로를 계산해서 그 근처에 알려진 보행 불편 구간이
// 있는지 알려줍니다. 위치 선택은 js/pick.js의 전체 화면 지도를 그대로 재사용합니다.
//
// GET /api/route (2026-10-01 백엔드 연동, 2026-10-08 TMAP 보행자 길찾기로 실제 보행로 계산하도록 개선됨).

const routeSheet = document.getElementById('routeSheet');

let routeFrom = null;        // { lat, lng, label? }
let routeTo = null;
let lastRouteCoords = null;    // 마지막으로 받은 경로 좌표들 ("지도에서 보기"를 누르면 그릴 것)
let lastRouteWarnings = [];    // 마지막 결과의 주의 구간들 (지도에서 강조 표시할 때 씀)
let routeLine = null;          // 지도에 그려진 경로 선 (Leaflet polyline)
let routeEndMarkers = [];      // 지도에 그려진 출발·도착 표시

function routePointLabel(p) {
  return p ? (p.label || (p.lat.toFixed(5) + ', ' + p.lng.toFixed(5))) : '위치를 정해 주세요.';
}

function setRouteMsg(text, kind) {
  const el = document.getElementById('routeMsg');
  el.textContent = text || '';
  el.className = 'field-msg' + (text ? ' ' + (kind || 'err') : '');
}

function updateRouteUi() {
  document.getElementById('routeFromText').textContent = routePointLabel(routeFrom);
  document.getElementById('routeToText').textContent = routePointLabel(routeTo);
  document.getElementById('routeFromBox').classList.toggle('set', !!routeFrom);
  document.getElementById('routeToBox').classList.toggle('set', !!routeTo);
  document.getElementById('routeFind').disabled = !(routeFrom && routeTo);
}

function openRoute() {
  routeSheet.hidden = false;
  setRouteMsg('');
  document.getElementById('routeResult').hidden = true;
  updateRouteUi();
}

function closeRoute() {
  routeSheet.hidden = true;
}

// 현재 위치로 출발/도착 지정
function useCurrentLocation(which) {
  if (!navigator.geolocation) { setRouteMsg('이 브라우저에서는 현재 위치를 확인할 수 없어요.'); return; }
  setRouteMsg('현재 위치를 확인하고 있어요…', '');
  navigator.geolocation.getCurrentPosition(pos => {
    const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: '현재 위치' };
    if (which === 'from') routeFrom = p; else routeTo = p;
    setRouteMsg('');
    updateRouteUi();
  }, () => setRouteMsg('현재 위치를 확인하지 못했어요.'), { enableHighAccuracy: true, timeout: 8000 });
}

document.getElementById('routeFromHere').addEventListener('click', () => useCurrentLocation('from'));
document.getElementById('routeToHere').addEventListener('click', () => useCurrentLocation('to'));

// 지도에서 직접 선택 (js/pick.js의 전체 화면 지도를 재사용)
document.getElementById('routeFromPick').addEventListener('click', () => {
  openPick((lat, lng) => { routeFrom = { lat, lng }; updateRouteUi(); },
    { hint: '지도를 움직여서 빨간 핀이 출발 지점을 가리키게 해 주세요.', title: '출발 위치 선택' });
});
document.getElementById('routeToPick').addEventListener('click', () => {
  openPick((lat, lng) => { routeTo = { lat, lng }; updateRouteUi(); },
    { hint: '지도를 움직여서 빨간 핀이 도착 지점을 가리키게 해 주세요.', title: '도착 위치 선택' });
});

// ----- 경로 요청 -----

async function findRoute() {
  if (!routeFrom || !routeTo) return;
  setRouteMsg('경로를 찾는 중…', '');
  document.getElementById('routeResult').hidden = true;
  document.getElementById('routeFind').disabled = true;
  try {
    const data = await fetchRoute(routeFrom.lat, routeFrom.lng, routeTo.lat, routeTo.lng);
    setRouteMsg('');
    showRouteResult(data);
  } catch (err) {
    setRouteMsg(errorMessage(err));
  } finally {
    document.getElementById('routeFind').disabled = !(routeFrom && routeTo);
  }
}
document.getElementById('routeFind').addEventListener('click', findRoute);

function routeWarningRow(w) {
  const row = document.createElement('div');
  row.className = 'route-warning';
  if (w.title) {
    const title = document.createElement('div');
    title.className = 'route-warning-title';
    title.textContent = w.title;
    row.appendChild(title);
  }
  if (w.accessibility_status) {
    const s = document.createElement('span');
    s.className = 'status-badge ' + w.accessibility_status;
    s.textContent = (tagInfo[w.accessibility_status] || {}).label || w.accessibility_status;
    row.appendChild(s);
  }
  (w.tags || []).forEach(code => {
    if (code === w.accessibility_status) return;   // 통행 상태 태그는 위 배지와 겹치니 뺌
    const t = document.createElement('span');
    t.className = 'tag';
    t.textContent = (tagInfo[code] || {}).label || code;
    row.appendChild(t);
  });
  const dist = document.createElement('div');
  dist.className = 'route-warning-dist';
  dist.textContent = '경로에서 약 ' + Math.round(w.distance_m) + 'm';
  row.appendChild(dist);
  return row;
}

function showRouteResult(data) {
  lastRouteCoords = (data && data.route) || null;
  lastRouteWarnings = (data && data.warnings) || [];

  const summary = document.getElementById('routeSummary');
  const distText = data && data.route_distance_m != null ? '경로 길이 약 ' + Math.round(data.route_distance_m) + 'm' : '';
  const countText = data && data.total_warnings != null ? '주의 구간 ' + data.total_warnings + '건' : '';
  summary.textContent = [distText, countText].filter(Boolean).join(' · ');
  summary.hidden = !summary.textContent;

  const box = document.getElementById('routeWarnings');
  box.textContent = '';
  const warnings = (data && data.warnings) || [];
  if (warnings.length === 0) {
    const ok = document.createElement('div');
    ok.className = 'route-ok';
    ok.textContent = '이 경로 근처에서 알려진 보행 불편 구간을 찾지 못했어요.';
    box.appendChild(ok);
  } else {
    warnings.forEach(w => box.appendChild(routeWarningRow(w)));
    if (data && data.truncated) {
      const more = document.createElement('div');
      more.className = 'route-more';
      more.textContent = '그 외 ' + (data.total_warnings - warnings.length) + '건이 더 있어요. (가까운 ' + warnings.length + '건만 보여드려요)';
      box.appendChild(more);
    }
  }
  document.getElementById('routeResult').hidden = false;
}

// ----- 지도에 경로 그리기 / 지우기 -----

// 경로 표시 때문에 지도에서 숨겼던 제보 마커를 전부 다시 보여줍니다 (경로 지우기 / 다시 그리기 전에 씀)
function restoreHiddenReportMarkers() {
  Object.keys(markersById).forEach(id => {
    const marker = markersById[id];
    if (!markerLayer.hasLayer(marker)) markerLayer.addLayer(marker);
  });
}

function clearRoute() {
  if (routeLine) { routeLine.remove(); routeLine = null; }
  routeEndMarkers.forEach(m => m.remove());
  routeEndMarkers = [];
  document.getElementById('routeClearBtn').hidden = true;
  restoreHiddenReportMarkers();
}

function drawRouteOnMap() {
  if (!lastRouteCoords || lastRouteCoords.length === 0) return;
  clearRoute();
  routeLine = L.polyline(lastRouteCoords, { color: '#007EFF', weight: 5, opacity: 0.85 }).addTo(map);

  const dot = (ll, cls) => L.marker(ll, {
    icon: L.divIcon({ className: '', html: '<div class="' + cls + '"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
    interactive: false, keyboard: false
  }).addTo(map);
  routeEndMarkers.push(dot(lastRouteCoords[0], 'route-dot route-dot-start'));
  routeEndMarkers.push(dot(lastRouteCoords[lastRouteCoords.length - 1], 'route-dot route-dot-end'));

  // 이 경로의 주의 구간이 아닌 제보는 지도에서 완전히 숨겨서, 경로와 상관없는 제보와 섞여 보이지 않게 합니다
  // ("경로를 그려도 동네 전체 제보가 똑같이 다 보여서 무분별해 보인다"는 피드백 반영, 2026-10-08)
  const warnIds = new Set(lastRouteWarnings.map(w => w.report_id));
  Object.keys(markersById).forEach(id => {
    const marker = markersById[id];
    if (warnIds.has(id)) {
      if (!markerLayer.hasLayer(marker)) markerLayer.addLayer(marker);
    } else {
      markerLayer.removeLayer(marker);
    }
  });

  map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
  document.getElementById('routeClearBtn').hidden = false;
}

document.getElementById('routeShowOnMap').addEventListener('click', () => {
  drawRouteOnMap();
  closeRoute();
});
document.getElementById('routeClearBtn').addEventListener('click', clearRoute);

// ----- 열고 닫기 -----

document.getElementById('routeBtn').addEventListener('click', openRoute);
document.getElementById('routeClose').addEventListener('click', closeRoute);
routeSheet.addEventListener('click', e => { if (e.target === routeSheet) closeRoute(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !routeSheet.hidden) closeRoute(); });
