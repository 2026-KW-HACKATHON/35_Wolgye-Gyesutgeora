-- 007_change_report_images.sql
-- 정보 변경 신고(report_change_reports)에 처리자 기록 추가
--   resolved_by / resolved_at : 관리자가 수락·반려한 사람과 시각
-- (파일명은 이전 작업과 같게 유지해 이미 적용된 환경과 이름이 어긋나지 않게 한다. 변경 신고에 사진 첨부는 하지 않는다.)

ALTER TABLE report_change_reports
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
