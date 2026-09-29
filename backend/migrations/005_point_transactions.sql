-- 005_point_transactions.sql
-- 포인트 내역 테이블
--   승인 시 지급(earn), 승인 취소·삭제 시 회수(revoke)를 한 줄씩 기록한다.
--   제보가 삭제돼도 내역은 남도록 report_id는 ON DELETE SET NULL, 제목은 사본(report_title)을 저장한다.
--   amount는 항상 양수이고, 증감 방향은 type으로 구분한다.

CREATE TABLE IF NOT EXISTS point_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id     UUID REFERENCES reports(id) ON DELETE SET NULL,
  report_title  VARCHAR(200),
  type          VARCHAR(10) NOT NULL CHECK (type IN ('earn', 'revoke')),
  amount        INTEGER NOT NULL CHECK (amount > 0),
  reason        VARCHAR(30) NOT NULL,
                -- earn : report_approved
                -- revoke: approval_cancelled(승인 취소: 반려·중복·대기로 변경) | report_deleted(제보 삭제)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_point_tx_user ON point_transactions(user_id, created_at DESC);

-- 기존에 승인되어 이미 지급된 포인트를 지급(earn) 내역으로 옮겨 담는다.
-- (지급 시각은 당시 기록이 없어 reports.updated_at을 사용)
INSERT INTO point_transactions (user_id, report_id, report_title, type, amount, reason, created_at)
SELECT user_id, id, title, 'earn', points_amount, 'report_approved', updated_at
FROM reports
WHERE point_awarded = TRUE AND points_amount > 0;
