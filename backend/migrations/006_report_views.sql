-- 006_report_views.sql
-- 조회수 중복 집계 방지용 테이블
--   (제보, 조회자, 날짜) 조합당 1행 → 같은 사용자가 같은 제보를 하루에 여러 번 열어도 1회만 센다.
--   viewer_key: 로그인 사용자는 'u:<user_id>', 비로그인은 'ip:<IP 해시>' (원본 IP는 저장하지 않음)
--   view_date : 한국 시간(Asia/Seoul) 기준 날짜

CREATE TABLE IF NOT EXISTS report_views (
  report_id   UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  viewer_key  VARCHAR(80) NOT NULL,
  view_date   DATE NOT NULL,
  PRIMARY KEY (report_id, viewer_key, view_date)
);

-- 오래된 기록 정리용
CREATE INDEX IF NOT EXISTS idx_report_views_date ON report_views(view_date);
