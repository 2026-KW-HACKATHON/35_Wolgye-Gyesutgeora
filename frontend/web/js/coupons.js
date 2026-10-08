// 내 쿠폰함 — 지역 상점에서 교환한 혜택을 보여주는 화면 (2026-10-02 추가)
//
// 전용 API는 없습니다. 교환 내역은 GET /api/points/history에 type:'spend'로 이미 쌓이고 있어서,
// 그중 상점 교환 항목만 걸러 "쿠폰"처럼 보여줍니다. 서버가 "사용 완료" 여부를 따로 관리하지 않으므로
// (교환 = 그 자리에서 바로 혜택을 쓰는 것으로 간주) 모든 교환 내역을 그대로 보여줍니다.
// 상품명·교환 방식은 아직 설문 전이라 확정되지 않았지만, 이 화면 자체는 방식이 바뀌어도 그대로 씁니다.
//
// 2026-10-02 수정: barrier-free 서비스 특성상 어르신 등 사용자가 쉽게 찾을 수 있도록, 입구를 마이페이지
// 최상단(포인트 내역 보기 바로 아래)에도 추가했습니다 — 원래 있던 지역 상점 화면 안의 입구까지 2곳입니다.

const couponSheet = document.getElementById('couponSheet');

function setCouponMsg(text) {
  const el = document.getElementById('couponMsg');
  el.textContent = text || '';
  el.className = 'field-msg' + (text ? ' err' : '');
}

// 내역 id 앞부분을 상점 직원이 눈으로 확인할 수 있는 제시용 코드로 보여줍니다.
// 서버가 검증하는 코드는 아니고(해당 API가 없음), 같은 쿠폰인지 구분하는 용도입니다.
function couponCode(id) {
  return (id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
}

// 쿠폰을 QR로도 보여줍니다 (2026-10-08 추가, 사용자 요청).
// 서버 쪽 쿠폰 검증 API가 없어서 지금은 스캔 결과를 아무도 확인하지 않지만, 화면으로 코드를 읽기 어려운
// 분들을 위해 QR도 함께 보여주면 상점에서 바코드 리더기로 찍어 코드만 확인하는 용도로 쓸 수 있습니다.
// 내역 id 전체를 그대로 인코딩합니다(화면에 보이는 짧은 코드보다 안 겹침).
function couponQrImgTag(id) {
  if (typeof qrcode !== 'function') return '';
  try {
    const qr = qrcode(0, 'M');
    qr.addData(id || '');
    qr.make();
    return qr.createImgTag(4, 2);
  } catch (e) { return ''; }
}

function couponRow(e) {
  const card = document.createElement('div');
  card.className = 'coupon-item';

  const top = document.createElement('div');
  top.className = 'coupon-item-top';
  const name = document.createElement('div');
  name.className = 'coupon-item-name';
  name.textContent = e.itemName || '지역 상점 교환';
  top.appendChild(name);
  const cost = document.createElement('div');
  cost.className = 'coupon-item-cost';
  cost.textContent = e.amount + 'P 사용';
  top.appendChild(cost);
  card.appendChild(top);

  const date = document.createElement('div');
  date.className = 'coupon-item-date';
  date.textContent = formatDate(e.date);
  card.appendChild(date);

  // 코드·QR은 전부 접어 두고, 버튼 하나로 한꺼번에 펼칩니다 (쿠폰이 여러 개면 다 펼쳐져 지저분해 보인다는 의견, 2026-10-08)
  const detailBtn = document.createElement('button');
  detailBtn.className = 'check-btn coupon-qr-btn';
  detailBtn.type = 'button';
  detailBtn.textContent = '제시 코드·QR 보기';
  card.appendChild(detailBtn);

  const detailWrap = document.createElement('div');
  detailWrap.className = 'coupon-item-detail';
  detailWrap.hidden = true;
  const code = document.createElement('div');
  code.className = 'coupon-item-code';
  code.textContent = '제시 코드 ' + couponCode(e.id);
  detailWrap.appendChild(code);
  const qrWrap = document.createElement('div');
  qrWrap.className = 'coupon-item-qr';
  detailWrap.appendChild(qrWrap);
  card.appendChild(detailWrap);

  detailBtn.addEventListener('click', () => {
    const willShow = detailWrap.hidden;
    if (willShow && !qrWrap.innerHTML) qrWrap.innerHTML = couponQrImgTag(e.id);
    detailWrap.hidden = !willShow;
    detailBtn.textContent = willShow ? '접기' : '제시 코드·QR 보기';
  });

  return card;
}

function fillCouponList(entries) {
  const list = document.getElementById('couponList');
  list.textContent = '';
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'point-empty';
    empty.textContent = '아직 교환한 쿠폰이 없어요. 지역 상점에서 포인트로 교환해 보세요.';
    list.appendChild(empty);
    return;
  }
  entries.forEach(e => list.appendChild(couponRow(e)));
}

async function openCoupons() {
  if (!isLoggedIn()) {
    openAuth('login', '쿠폰함을 보려면 로그인이 필요해요.', openCoupons);
    return;
  }
  couponSheet.hidden = false;
  setCouponMsg('');
  document.getElementById('couponList').textContent = '불러오는 중…';

  try {
    const entries = await fetchPointHistory();
    const coupons = entries.filter(e => e.type === 'spend');
    fillCouponList(coupons);
  } catch (err) {
    document.getElementById('couponList').textContent = '';
    setCouponMsg(errorMessage(err));
  }
}

function closeCoupons() {
  couponSheet.hidden = true;
}

// 마이페이지(바로 한 단계)와 지역 상점(교환 직후) 양쪽에서 들어올 수 있게 입구를 두 곳에 둡니다.
document.getElementById('couponOpenBtn').addEventListener('click', openCoupons);
document.getElementById('couponOpenBtnMypage').addEventListener('click', openCoupons);
document.getElementById('couponClose').addEventListener('click', closeCoupons);
couponSheet.addEventListener('click', e => { if (e.target === couponSheet) closeCoupons(); });
// 지역 상점(storeSheet)이 이 창 아래에 열려 있으면 Esc는 이 창만 닫습니다
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !couponSheet.hidden) closeCoupons();
});
