-- 월계1동 생활 보행 지도 서비스 DB 스키마
-- PostgreSQL

-- UUID는 PostgreSQL 13+ 내장 gen_random_uuid() 사용 (확장 불필요)

-- ============================================================
-- USERS 테이블
-- 가입: 아이디 + 닉네임 + 비밀번호 (개인정보 미수집)
-- 아이디는 로그인용, 닉네임은 화면 표시용. 둘 다 중복 불가
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username     VARCHAR(20)  UNIQUE NOT NULL,   -- 로그인 아이디 (소문자로 저장)
  nickname     VARCHAR(20)  UNIQUE NOT NULL,   -- 화면 표시 이름
  password     VARCHAR(255) NOT NULL,          -- bcrypt hash
  role         VARCHAR(20) NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
  points       INTEGER NOT NULL DEFAULT 0,     -- 포인트: 컬럼만 준비 (로직 없음)
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TAGS (제보 유형 마스터)
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(50) UNIQUE NOT NULL,   -- 코드값 (ex: stairs, high_curb)
  label       VARCHAR(100) NOT NULL,          -- 화면 표시 (ex: 계단 있음)
  category    VARCHAR(50) NOT NULL,           -- physical | safety | temp
  icon        VARCHAR(50),                    -- 아이콘 식별자
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기본 태그 데이터 (기획안 6번 항목 기준 객관적 태그)
INSERT INTO tags (code, label, category, icon, sort_order) VALUES
  ('stairs',          '계단 있음',               'physical', 'stairs',    1),
  ('high_curb',       '단차 10cm 이상',           'physical', 'curb',      2),
  ('narrow_path',     '휠체어·유모차 통과 어려움', 'physical', 'narrow',    3),
  ('steep_slope',     '급경사',                   'physical', 'slope',     4),
  ('no_sidewalk',     '인도 없음',                'physical', 'road',      5),
  ('construction',    '공사 중',                  'temp',     'cone',      6),
  ('obstacle',        '적치물/장애물',             'temp',     'block',     7),
  ('poor_lighting',   '조명 불량',                'safety',   'light',     8),
  ('safety_path',     '여성 안심길',              'safety',   'heart',     9),
  ('slippery',        '미끄러움 주의',             'physical', 'slip',     10)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- REPORTS (제보) 테이블
-- 인증된 사용자만 등록 가능 → user_id NOT NULL
-- 등록 시점 GPS가 서비스 지역(반경) 내여야 함 (애플리케이션 레벨 검증)
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          VARCHAR(200),                -- 선택적 제목
  description    TEXT,                        -- 상세 설명
  latitude       DECIMAL(10, 7) NOT NULL,     -- 위도
  longitude      DECIMAL(10, 7) NOT NULL,     -- 경도
  address        VARCHAR(300),                -- 역지오코딩 주소 (선택)
  status         VARCHAR(20) NOT NULL DEFAULT 'pending',
                                              -- pending | approved | rejected | duplicate
  point_awarded  BOOLEAN NOT NULL DEFAULT FALSE,  -- 포인트: 컬럼만 준비 (로직 없음)
  points_amount  INTEGER NOT NULL DEFAULT 0,      -- 포인트: 컬럼만 준비 (로직 없음)
  view_count     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_user     ON reports(user_id);
CREATE INDEX idx_reports_status   ON reports(status);
CREATE INDEX idx_reports_location ON reports(latitude, longitude);
CREATE INDEX idx_reports_created  ON reports(created_at DESC);

-- ============================================================
-- REPORT_TAGS (제보 ↔ 태그 N:M)
-- ============================================================
CREATE TABLE IF NOT EXISTS report_tags (
  report_id  UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (report_id, tag_id)
);

-- ============================================================
-- REPORT_IMAGES (제보 사진, 1건당 최대 3장, 로컬 디스크 저장)
-- ============================================================
CREATE TABLE IF NOT EXISTS report_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  filename    VARCHAR(255) NOT NULL,          -- 저장된 파일명
  original    VARCHAR(255),                   -- 원본 파일명
  url         VARCHAR(500) NOT NULL,          -- 접근 URL (/uploads/xxx.jpg)
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_images_report ON report_images(report_id);

-- ============================================================
-- updated_at 자동 갱신 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
