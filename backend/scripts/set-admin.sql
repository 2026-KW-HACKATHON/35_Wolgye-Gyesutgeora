-- 기존 계정 1개를 관리자(admin)로 승격하는 SQL (create-admin.js 대안)
--
-- 사용법:
--   1) 먼저 admin.html/앱에서 일반 회원가입으로 계정을 하나 만든다.
--   2) 아래 '여기에_아이디'를 그 계정 아이디로 바꿔서 실행한다.
--      psql -d walkmap -v u="'wgadmin'" -f scripts/set-admin.sql
--      또는 psql에서 직접:
--
--   UPDATE users SET role = 'admin' WHERE username = 'wgadmin';
--
-- 이 파일은 migrations/ 폴더 밖에 있으므로 `npm run migrate` 시 자동 실행되지 않습니다.
-- (관리자는 1개만 두고 수동 관리한다는 운영 원칙)

UPDATE users SET role = 'admin' WHERE username = '여기에_아이디';

-- 확인
SELECT id, username, nickname, role FROM users WHERE role = 'admin';
