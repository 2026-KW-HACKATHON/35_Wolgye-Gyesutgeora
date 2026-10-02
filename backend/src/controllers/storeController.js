const pool = require('../config/db');
const { recordTransaction } = require('../utils/points');

/**
 * 지역 상점 포인트 교환
 *
 * 상품 목록은 아직 기획팀·상점 협의가 끝나지 않아 DB 테이블 대신 아래 상수로 관리한다.
 * 프론트(frontend/web/js/store.js)가 쓰는 id·금액과 일치시켜 두었으므로,
 * 설문으로 제휴 방식이 정해지면 이 배열만 실제 상품으로 교체하면 된다.
 * (상품이 많아지거나 운영진이 직접 바꿔야 할 때 store_items 테이블로 옮기면 된다)
 *
 * - id   : 프론트가 보내는 item_id (문자열 코드)
 * - name : 내역에 남길 상품명
 * - cost : 차감할 포인트 (양수)
 */
const STORE_ITEMS = [
  {
    id: 'method1_flat_discount',
    shop: '방식 1 예시 · 포인트만큼 금액 할인',
    name: '50원 할인권',
    cost: 50,
    description: '포인트와 할인 금액이 1:1입니다. (설문 전 예시)',
  },
  {
    id: 'method2_tier_coupon',
    shop: '방식 2 예시 · 구간별 할인쿠폰',
    name: '5,000원 이상 구매 시 500원 할인',
    cost: 50,
    description: '상점이 최소 구매금액을 정할 수 있습니다. (설문 전 예시)',
  },
  {
    id: 'method3_tier_product',
    shop: '방식 3 예시 · 구간별 상품·서비스',
    name: '지정 메뉴 또는 상품 추가 혜택',
    cost: 50,
    description: '상점이 업종에 맞는 혜택을 직접 고를 수 있습니다. (설문 전 예시)',
  },
];

function findItem(itemId) {
  if (typeof itemId !== 'string') return null;
  return STORE_ITEMS.find(i => i.id === itemId.trim()) || null;
}

/**
 * POST /api/store/redeem 🔒
 * body: { item_id }
 *
 * 포인트가 충분하면 상품 가격만큼 차감하고 point_transactions에
 * type 'spend' / reason 'store_redeem'으로 기록한다.
 * 같은 상품을 여러 번 교환하는 것에는 제한을 두지 않는다.
 *
 * 사용자 행을 FOR UPDATE로 잠근 트랜잭션 안에서 처리하므로,
 * 버튼을 연속으로 눌러도 포인트가 중복 차감되지 않는다.
 *
 * 성공 200 → { user: {...}, redemption: { item_id, item_name, cost, created_at } }
 * 실패 400 INSUFFICIENT_POINTS (포인트 부족) / 404 ITEM_NOT_FOUND (없는 상품) / 401 (로그인 안 함)
 */
async function redeem(req, res) {
  const item = findItem(req.body?.item_id);
  if (!item) {
    return res.status(404).json({
      error: '교환할 수 있는 상품이 아닙니다.',
      code: 'ITEM_NOT_FOUND',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 행을 잠가 동시 요청에도 포인트가 한 번만 차감되게 한다
    const { rows } = await client.query(
      'SELECT id, username, nickname, role, points, created_at FROM users WHERE id = $1 FOR UPDATE',
      [req.user.id]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    const user = rows[0];

    if (user.points < item.cost) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `포인트가 부족합니다. (보유 ${user.points}P / 필요 ${item.cost}P)`,
        code: 'INSUFFICIENT_POINTS',
        points: user.points,
        required: item.cost,
      });
    }

    await client.query(
      'UPDATE users SET points = points - $1 WHERE id = $2',
      [item.cost, user.id]
    );
    await recordTransaction(client, {
      userId: user.id,
      itemCode: item.id,
      itemName: item.name,
      type: 'spend',
      amount: item.cost,
      reason: 'store_redeem',
    });

    await client.query('COMMIT');

    return res.json({
      user: { ...user, points: user.points - item.cost },
      redemption: {
        item_id: item.id,
        item_name: item.name,
        cost: item.cost,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(500).json({ error: '서버 오류' });
  } finally {
    client.release();
  }
}

module.exports = { redeem, STORE_ITEMS };
