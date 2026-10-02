// 지역 상점 (포인트 사용) — ⚠️ 뼈대만 먼저 만든 화면입니다.
//
// 2026-10-02: 기획팀의 "월계 한걸음 지역상점 포인트 제휴 기획안"을 받아 예시 상품을 그 문서 기준으로 맞췄습니다.
// 기획안은 세 가지 제휴 방식 후보(포인트=금액 할인 / 구간별 할인쿠폰 / 구간별 상품·서비스)를 상점 설문에 부치고,
// 그 결과로 하나를 고르기로 돼 있습니다(아직 미정). 그래서 지금은 세 후보를 한눈에 비교할 수 있도록
// 각 방식의 50P 구간 예시를 그대로 하나씩 보여줍니다. 설문 결과로 방식이 정해지면 이 배열을 그 방식 하나로
// (실제 제휴 상점 이름·혜택으로) 교체하면 됩니다. 기획안 지침대로, 실제 제휴 전까지는 "DEMO"로 표시합니다.
// - "교환하기"는 실제로 POST /api/store/redeem을 호출해 봅니다(js/api.js의 redeemStoreItem).
//   백엔드에 이 API가 생기기 전(404)에는 성공한 것처럼 속이지 않고 "화면만 준비됨"을 안내합니다.
//   (js/flag.js, js/route.js와 같은 screen-first 방식)

const storeSheet = document.getElementById('storeSheet');

// 기획안의 세 후보 방식 각각의 50P 구간 예시입니다(문서에 적힌 금액 그대로). 설문으로 방식이 정해지면
// 이 배열을 그 방식 하나(그리고 실제 제휴 상점 정보)로 교체하세요.
const STORE_ITEMS = [
  { id: 'method1_flat_discount', shop: '방식 1 예시 · 포인트만큼 금액 할인', name: '50원 할인권', cost: 50,
    desc: '포인트와 할인 금액이 1:1이라 이해하기 쉽지만, 금액이 작아 체감이 어려울 수 있어요. (설문 전 예시)' },
  { id: 'method2_tier_coupon', shop: '방식 2 예시 · 구간별 할인쿠폰', name: '5,000원 이상 구매 시 500원 할인', cost: 50,
    desc: '포인트를 모으는 목표가 생기고, 상점이 최소 구매금액을 정할 수 있어요. (설문 전 예시)' },
  { id: 'method3_tier_product', shop: '방식 3 예시 · 구간별 상품·서비스', name: '지정 메뉴 또는 상품 추가 혜택', cost: 50,
    desc: '상점이 업종에 맞는 혜택을 직접 고를 수 있어요. (설문 전 예시)' }
];

function setStoreMsg(text, kind) {
  const el = document.getElementById('storeMsg');
  el.textContent = text || '';
  el.className = 'field-msg' + (text ? ' ' + (kind || 'err') : '');
}

function storeItemRow(item, myPoints) {
  const row = document.createElement('div');
  row.className = 'store-item';

  const body = document.createElement('div');
  body.className = 'store-item-body';
  const shop = document.createElement('div');
  shop.className = 'store-item-shop';
  shop.textContent = item.shop;
  body.appendChild(shop);
  const name = document.createElement('div');
  name.className = 'store-item-name';
  name.textContent = item.name;
  body.appendChild(name);
  const desc = document.createElement('div');
  desc.className = 'store-item-desc';
  desc.textContent = item.desc;
  body.appendChild(desc);
  row.appendChild(body);

  const side = document.createElement('div');
  side.className = 'store-item-side';
  const cost = document.createElement('div');
  cost.className = 'store-item-cost';
  cost.textContent = item.cost + 'P';
  side.appendChild(cost);

  const enough = myPoints >= item.cost;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'check-btn store-redeem';
  btn.textContent = enough ? '교환하기' : '포인트 부족';
  btn.disabled = !enough;
  btn.addEventListener('click', () => redeemItem(item, row));
  side.appendChild(btn);

  row.appendChild(side);
  return row;
}

function renderStoreItems(myPoints) {
  const list = document.getElementById('storeList');
  list.textContent = '';
  STORE_ITEMS.forEach(item => list.appendChild(storeItemRow(item, myPoints)));
}

async function openStore() {
  if (!isLoggedIn()) {
    openAuth('login', '상점을 이용하려면 로그인이 필요해요.', openStore);
    return;
  }
  storeSheet.hidden = false;
  setStoreMsg('');
  let points = (getUser() || {}).points ?? 0;
  document.getElementById('storePoints').innerHTML = points + '<span>P</span>';
  renderStoreItems(points);

  // 최신 포인트로 갱신 (제보 승인 직후에도 정확한 값을 보여주기 위해)
  try {
    const { user } = await fetchMe();
    saveSession(getToken(), user);
    points = user.points;
    document.getElementById('storePoints').innerHTML = points + '<span>P</span>';
    renderStoreItems(points);
  } catch (e) { /* 실패해도 화면은 그대로 보여줍니다 */ }
}

function closeStore() {
  storeSheet.hidden = true;
}

async function redeemItem(item, row) {
  if (!confirm('"' + item.name + '"을(를) ' + item.cost + 'P로 교환할까요?')) return;

  const btn = row.querySelector('.store-redeem');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = '처리 중…';

  try {
    const res = await redeemStoreItem(item.id);
    if (res && res.user) {
      saveSession(getToken(), res.user);
      document.getElementById('storePoints').innerHTML = res.user.points + '<span>P</span>';
      renderStoreItems(res.user.points);
    }
    setStoreMsg('"' + item.name + '" 교환 완료! 상점에 보여주고 사용하세요.', 'ok');
  } catch (err) {
    if (err.status === 404) {
      // 백엔드에 이 API가 아직 없음: 실패를 숨기지 않고 화면만 준비된 상태임을 알려줍니다
      setStoreMsg('상점 기능은 아직 서버와 연결 전이에요. 백엔드 작업이 끝나면 화면 수정 없이 바로 쓸 수 있어요.');
      btn.disabled = false;
      btn.textContent = originalLabel;
    } else if (err.status === 401) {
      clearSession();
      openAuth('login', '로그인이 만료됐어요. 다시 로그인한 뒤 교환해 주세요.');
    } else {
      setStoreMsg(errorMessage(err));
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }
}

document.getElementById('storeOpenBtn').addEventListener('click', openStore);
document.getElementById('storeClose').addEventListener('click', closeStore);
storeSheet.addEventListener('click', e => { if (e.target === storeSheet) closeStore(); });
// 포인트 내역(pointSheet)이 이 창 아래에 열려 있으면 Esc는 이 창만 닫습니다
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !storeSheet.hidden) closeStore();
});
