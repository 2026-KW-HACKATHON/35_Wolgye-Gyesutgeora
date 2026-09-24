# walkmap-backend

월계1동 생활 보행 지도 서비스의 API 서버입니다.  
앱/프론트 개발자용 API 명세는 [API.md](API.md)를 참고하세요.

---

## 기술 스택

| 항목 | 내용 |
|---|---|
| 런타임 | Node.js 18+ |
| 프레임워크 | Express 4 |
| 데이터베이스 | PostgreSQL 13+ |
| 인증 | JWT (httpOnly 쿠키 + Bearer 토큰 이중 지원) |
| 파일 업로드 | Multer (로컬 디스크 `uploads/`) |
| 보안 | Helmet, bcryptjs, express-rate-limit, CORS |

---

## 시작하기

### 1. 사전 준비

- Node.js 18 이상
- PostgreSQL 13 이상

### 2. 설치

```bash
# 저장소 클론 후
npm install
```

### 3. 환경변수 설정

```bash
cp .env.example .env
```

`.env`를 열고 아래 항목을 반드시 채웁니다.

```
DB_PASSWORD=your_password
JWT_SECRET=랜덤한_긴_문자열
```

나머지 항목은 기본값으로 동작합니다.

### 4. DB 마이그레이션

```bash
# 테이블 생성 + 기본 태그 데이터 삽입
npm run migrate
# 실제로는: node migrations/run.js
```

마이그레이션 파일이 여러 개인 경우 번호 순서대로 실행합니다.

```bash
# 수동으로 실행하는 경우
psql -d walkmap -f migrations/001_init.sql
psql -d walkmap -f migrations/002_accessibility.sql

# 테스트 데이터 삽입 (개발 환경에서만)
psql -d walkmap -f migrations/003_seed_test.sql
```

### 5. 서버 실행

```bash
npm start        # 운영
npm run dev      # 개발 (nodemon, 파일 변경 시 자동 재시작)
```

`http://localhost:3000/health` → `{"status":"ok"}` 가 반환되면 정상입니다.

---

## 폴더 구조

```
backend_re/
├── migrations/
│   ├── 001_init.sql          # 초기 테이블 생성 + 기본 태그 데이터
│   ├── 002_accessibility.sql # accessibility_status 컬럼 + 태그 4종 추가
│   ├── 003_seed_test.sql     # 테스트 계정 3개 + 샘플 제보 3개 (개발용)
│   └── run.js                # 마이그레이션 실행 스크립트
├── src/
│   ├── index.js              # 서버 진입점 (미들웨어, 라우트, 에러 핸들러)
│   ├── config/
│   │   ├── db.js             # PostgreSQL 연결 풀
│   │   └── region.js         # 서비스 지역 설정 (중심 좌표 + 반경)
│   ├── controllers/
│   │   ├── authController.js     # 중복 확인, 회원가입, 로그인, 로그아웃, 내 정보
│   │   ├── reportController.js   # 제보 등록, 목록, 상세, 관리자 상태 변경
│   │   └── tagController.js      # 태그 목록
│   ├── middleware/
│   │   ├── auth.js           # JWT 인증 (requireAuth, requireAdmin)
│   │   ├── regionCheck.js    # 제보 등록 시 서비스 지역 좌표 검증
│   │   └── upload.js         # Multer 이미지 업로드 (최대 3장, 10MB)
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── reportRoutes.js
│   │   └── tagRoutes.js
│   └── utils/
│       ├── geo.js            # Haversine 거리 계산
│       └── files.js          # 업로드 실패 시 파일 삭제
└── uploads/                  # 제보 사진 저장 위치 (정적 서빙: /uploads/*)
```

---

## DB 스키마 요약

| 테이블 | 설명 |
|---|---|
| `users` | 아이디 / 닉네임 / 비밀번호(bcrypt) / role / points |
| `tags` | 보행환경 유형 마스터 (계단, 단차 등 14종) |
| `reports` | 제보 본문 (위치, 설명, 통행 상태, 검토 상태) |
| `report_tags` | 제보 ↔ 태그 N:M |
| `report_images` | 제보 사진 (1건당 최대 3장) |

### 제보 상태 (`reports.status`)

| 값 | 의미 |
|---|---|
| `pending` | 관리자 검토 대기 (기본값) |
| `approved` | 승인 → 지도에 공개 |
| `rejected` | 반려 |
| `duplicate` | 중복 제보 |

### 통행 상태 (`reports.accessibility_status`)

| 값 | 의미 |
|---|---|
| `passable` | 통행 가능 |
| `inconvenient` | 통행 불편 |
| `impassable` | 통행 불가 |

---

## API 엔드포인트 요약

### 인증 `/api/auth`

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/check-username` | - | 아이디 중복 확인 |
| GET | `/check-nickname` | - | 닉네임 중복 확인 |
| POST | `/register` | - | 회원가입 |
| POST | `/login` | - | 로그인 |
| POST | `/logout` | - | 로그아웃 (쿠키 삭제) |
| GET | `/me` | ✅ | 내 정보 |

### 제보 `/api/reports`

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/` | - | 제보 목록 (`?status=approved`로 필터) |
| GET | `/mine` | ✅ | 내 제보 목록 |
| GET | `/:id` | - | 제보 상세 (조회수 증가) |
| POST | `/` | ✅ + 지역 검증 | 제보 등록 (multipart, 사진 필수) |
| PATCH | `/:id/status` | ✅ 관리자 | 상태 변경 + 승인 시 포인트 지급 |

### 태그 `/api/tags`

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/` | 태그 목록 전체 |

---

## 주요 동작 설명

### 제보 등록 흐름

1. 사용자가 `POST /api/reports`로 위치 + 사진 + 태그 전송
2. `requireInRegion` 미들웨어가 GPS 좌표가 서비스 지역 반경 내인지 검증
3. DB에 저장 후 상태는 `pending`으로 시작
4. 관리자가 `PATCH /api/reports/:id/status`로 `approved` 처리 시 포인트 자동 지급

### 관리자 승인 + 포인트 지급

- `PATCH /api/reports/:id/status` (body: `{ "status": "approved" }`)
- `reports.point_awarded = FALSE` 인 경우에만 포인트 지급 (중복 방지)
- 지급 포인트: 환경변수 `POINTS_PER_APPROVAL` (기본 10)

### 인증 방식

- 웹 브라우저: 로그인 시 `access_token` httpOnly 쿠키 자동 발급
- 앱 / fetch: `Authorization: Bearer <token>` 헤더 사용
- 두 방식 동시 사용 시 헤더 우선

### 서비스 지역 제한

`.env`의 세 값으로 제어합니다.

```
REGION_CENTER_LAT=37.6215   # 월계1동 중심 위도
REGION_CENTER_LNG=127.0605  # 월계1동 중심 경도
REGION_RADIUS_KM=50         # 허용 반경 (km) — 개발 중에는 크게 설정
```

---

## 환경변수 전체 목록

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | 서버 포트 |
| `NODE_ENV` | `development` | `production` 시 쿠키 secure/sameSite 강화 |
| `DB_HOST` | `localhost` | PostgreSQL 호스트 |
| `DB_PORT` | `5432` | PostgreSQL 포트 |
| `DB_NAME` | `walkmap` | DB 이름 |
| `DB_USER` | `postgres` | DB 유저 |
| `DB_PASSWORD` | — | DB 비밀번호 **(필수)** |
| `JWT_SECRET` | — | JWT 서명 키 **(필수, 긴 랜덤 문자열)** |
| `JWT_EXPIRES_IN` | `7d` | 토큰 유효 기간 |
| `COOKIE_SECRET` | JWT_SECRET 사용 | 쿠키 서명 키 |
| `UPLOAD_DIR` | `uploads` | 사진 저장 폴더 |
| `MAX_FILE_SIZE` | `10485760` | 사진 최대 크기 (바이트, 기본 10MB) |
| `REGION_CENTER_LAT` | `37.6215` | 서비스 지역 중심 위도 |
| `REGION_CENTER_LNG` | `127.0605` | 서비스 지역 중심 경도 |
| `REGION_RADIUS_KM` | `50` | 서비스 지역 반경 (km) |
| `CORS_ORIGIN` | (비어있음) | 허용 외부 도메인 (쉼표 구분, 미설정 시 same-origin) |
| `FRONTEND_DIR` | `../frontend/web` | 프론트엔드 빌드 경로 |
| `POINTS_PER_APPROVAL` | `10` | 제보 승인 시 지급 포인트 |

---

## Rate Limit 정책

| 대상 | 제한 |
|---|---|
| 전체 API | 15분 내 100건 |
| 회원가입 / 로그인 | 15분 내 20건 (브루트포스 방어) |
| 제보 등록 | 1시간 내 20건 |

---

## 미구현 / 향후 작업

- 포인트 내역 테이블 (현재는 `users.points` 합산만 존재)
- 관리자 전용 대시보드 페이지
- 중복 제보 자동 감지
- 사진 자동 비식별화 (얼굴·차량번호)
- 제보 변경 신고 기능