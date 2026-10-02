-- 008_point_spend.sql
-- 포인트 사용(지역 상점 교환) 내역을 point_transactions에 함께 담기 위한 변경
--
-- 1) type에 'spend'를 추가한다.
--    'revoke'(승인 취소·삭제 시 회수)는 더 이상 새로 쌓이지 않지만,
--    과거에 쌓인 행이 남아 있을 수 있으므로 허용 목록에서 빼지 않는다.
-- 2) 교환한 상품을 남길 item_code / item_name 컬럼을 추가한다.
--    상품은 제보와 무관하므로 report_id·report_title을 돌려 쓰지 않고 별도 컬럼에 둔다.
--    상품 목록 자체는 서버 코드(src/controllers/storeController.js)의 상수로 관리한다.

ALTER TABLE point_transactions
  DROP CONSTRAINT IF EXISTS point_transactions_type_check;

ALTER TABLE point_transactions
  ADD CONSTRAINT point_transactions_type_check
  CHECK (type IN ('earn', 'revoke', 'spend'));

ALTER TABLE point_transactions
  ADD COLUMN IF NOT EXISTS item_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS item_name VARCHAR(100);
