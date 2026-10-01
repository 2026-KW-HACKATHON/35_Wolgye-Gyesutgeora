// 지역 상점 (포인트 사용) — ⚠️ 뼈대만 먼저 만든 화면입니다.
//
// - 상품 목록(STORE_ITEMS)은 아직 팀이 정하지 않은 "예시"입니다. 실제 제휴 상점·혜택이 정해지면
//   이 배열만 바꾸면 화면은 그대로 쓸 수 있습니다.
// - "교환하기"는 실제로 POST /api/store/redeem을 호출해 봅니다(js/api.js의 redeemStoreItem).
//   백엔드에 이 API가 생기기 전(404)에는 성공한 것처럼 속이지 않고 "화면만 준비됨"을 안내합니다.
//   (js/flag.js, js/route.js와 같은 screen-first 방식)

const storeSheet = document.getElementById('storeSheet');

// 예시 상품입니다. 실제 상점·혜택이 정해지면 이 배열만 바꾸면 됩니다.
const STORE_ITEMS = [
  { id: 'sample_cafe', shop: '동네 카페 (예시)', name: '아메리카노 500원 할인권', cost: 50,
    desc: '예시 혜택이에요. 실제 제휴 상점이 정해지면 바뀔 예정입니다.' },
  { id: 'sample_bakery', shop: '동네 빵집 (예시)', name: '전 품목 1,000원 할인권', cost: 30,
    desc: '예시 혜택이에요. 실제 제휴 상점이 정해지면 바뀔 예정입니다.' },
  { id: 'sample_mart', shop: '동네 마트 (예시)', name: '음료 1개 교환권', cost: 20,
    desc: '예시 혜택이에요. 실제 제휴 상점이 정해지면 바뀔 예정입니다.' }
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
