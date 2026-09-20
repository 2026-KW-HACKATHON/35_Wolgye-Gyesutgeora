# 월계1동 생활 보행 지도 — 백엔드

주민이 보행 불편 구간을 사진·위치·태그로 제보하고, 누구나 지도에서 확인하는 서비스의 API 서버입니다.
앱 개발자용 API 설명은 [API.md](API.md)를 보세요.

- Node.js 18+ / Express / PostgreSQL 13+
- 사진은 서버 PC의 `uploads/` 폴더에 저장
- 가입: 아이디 + 닉네임 + 비밀번호 (개인정보 미수집), 아이디·닉네임 중복 확인 API 제공
- 제보 등록은 로그인 + 월계1동 반경 1.5km 안에서만 가능, 지도 조회는 누구나

## 실행 방법

1. PostgreSQL을 설치하고 DB를 하나 만듭니다.
   ```
   createdb walkmap
   ```
2. 패키지 설치
   ```
   npm install
   ```
3. `.env.example`을 `.env`로 복사한 뒤 `DB_PASSWORD`, `JWT_SECRET`을 채웁니다.
4. 테이블 생성
   ```
   npm run migrate
   ```
5. 서버 실행
   ```
   npm start        # 또는 개발 중에는 npm run dev
   ```
   `http://localhost:3000/health`가 `{"status":"ok"}`를 돌려주면 정상입니다.

## 서비스 지역 조정

`.env`의 `REGION_CENTER_LAT`, `REGION_CENTER_LNG`, `REGION_RADIUS_KM`로 바꿉니다.
기본 좌표(37.6215, 127.0605)는 월계1동의 대략적인 중심이라, 정확한 값으로 확인 후 수정하는 것을 권장합니다.
테스트할 때 반경을 크게(예: 50) 잡으면 어디서든 제보할 수 있습니다.

## 폴더 구조

```
migrations/        DB 테이블 정의(001_init.sql)와 실행 스크립트
src/index.js       서버 진입점
src/routes/        URL → 컨트롤러 연결
src/controllers/   auth(중복확인·가입·로그인), report(제보), tag(태그)
src/middleware/    auth(토큰 확인), regionCheck(지역 판정), upload(사진 저장)
src/utils/         geo(거리 계산), files(거부된 사진 삭제)
src/config/        DB 연결, 서비스 지역 설정
uploads/           제보 사진 저장 위치
```

## 아직 없는 것 (팀 결정 대기)

- 포인트: `users.points`, `reports.point_awarded`, `reports.points_amount` 컬럼만 있고 적립 로직은 없음
- 제보 승인/중복 판정, 회피 경로 추천, 관리자 페이지
