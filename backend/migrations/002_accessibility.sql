-- 002_accessibility.sql
-- 통행 상태(accessibility_status) 컬럼 추가 + 태그 보완

-- ============================================================
-- 1. reports 테이블에 통행 상태 컬럼 추가
--    'passable'   : 통행 가능
--    'inconvenient': 통행 불편 (돌아가거나 힘들지만 가능)
--    'impassable' : 통행 불가
-- ============================================================
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS accessibility_status VARCHAR(20)
    CHECK (accessibility_status IN ('passable', 'inconvenient', 'impassable'));

-- ============================================================
-- 2. 태그 추가: 통행 관련 3종 + 기타
--    category = 'accessibility' : 통행 상태 태그 (단독 사용 권장)
--    category = 'etc'           : 기타
-- ============================================================
INSERT INTO tags (code, label, category, icon, sort_order) VALUES
  ('passable',     '통행 가능',  'accessibility', 'check',  11),
  ('inconvenient', '통행 불편',  'accessibility', 'warn',   12),
  ('impassable',   '통행 불가',  'accessibility', 'block',  13),
  ('etc',          '기타',       'etc',           'etc',    14)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 3. 포인트 지급 기준값 (환경변수로 조정 가능, DB에 기본값 보존)
--    실제 지급은 애플리케이션(reportController)에서 처리
-- ============================================================
-- (별도 설정 테이블 없음 — POINTS_PER_APPROVAL 환경변수 사용)
