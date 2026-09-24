-- 004_moderation.sql
-- 제보 신고 기능 2종
--   1) report_flags          : 잘못된 정보 신고 (부적절한 사진 / 실제와 다른 정보 / 중복 / 기타)
--   2) report_change_reports : 정보 변경 신고 (장애물 제거됨 / 공사 종료 / 통행 상태 변경 등)
-- 둘 다 로그인 사용자가 남기고, 관리자가 검토해서 원본 제보를 반려·삭제하거나 상태를 갱신한다.

-- ============================================================
-- 1. 잘못된 정보 신고 (report_flags)
--    reason: bad_photo | wrong_info | duplicate | etc
--    status: open(접수) | resolved(조치완료) | dismissed(반려)
--    같은 사용자가 같은 제보를 중복 신고하지 못하도록 (report_id, user_id) UNIQUE
-- ============================================================
CREATE TABLE IF NOT EXISTS report_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  reason      VARCHAR(20) NOT NULL
              CHECK (reason IN ('bad_photo', 'wrong_info', 'duplicate', 'etc')),
  description TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_report_flags_report ON report_flags(report_id);
CREATE INDEX IF NOT EXISTS idx_report_flags_status ON report_flags(status);

-- ============================================================
-- 2. 정보 변경 신고 (report_change_reports)
--    reason: obstacle_removed(장애물 제거됨) | construction_done(공사 종료)
--          | now_passable(통행 가능해짐)    | now_impassable(통행 불가로 변경됨)
--          | info_different(기존 정보와 다름) | etc(기타)
--    status: open(접수) | accepted(반영완료) | dismissed(반려)
--    한 사용자가 시점을 달리해 여러 번 변경 신고할 수 있으므로 UNIQUE 제약은 두지 않음
-- ============================================================
CREATE TABLE IF NOT EXISTS report_change_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  reason      VARCHAR(30) NOT NULL
              CHECK (reason IN ('obstacle_removed', 'construction_done', 'now_passable',
                                'now_impassable', 'info_different', 'etc')),
  description TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'accepted', 'dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_change_report ON report_change_reports(report_id);
CREATE INDEX IF NOT EXISTS idx_report_change_status ON report_change_reports(status);
