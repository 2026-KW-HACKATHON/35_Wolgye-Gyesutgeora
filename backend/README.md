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

`npm run migrate`는 `migrations/`의 `.sql` 파일을 번호 순서대로 실행하고, 실행한 파일은 `migrations` 테이블에 기록해 두 번 실행하지 않습니다.
(`003_seed_test.sql`은 개발용 테스트 데이터이므로 운영 DB에서는 확인 후 사용하세요.)

수동으로 실행하는 경우:

```bash
psql -d walkmap -f migrations/001_init.sql
psql -d walkmap -f migrations/002_accessibility.sql
psql -d walkmap -f migrations/003_seed_test.sql          # 개발용
psql -d walkmap -f migrations/004_moderation.sql
psql -d walkmap -f migrations/005_point_transactions.sql
psql -d walkmap -f migrations/006_report_views.sql
psql -d walkmap -f migrations/007_change_report_images.sql
```

### 관리자 계정 만들기

일반 가입으로는 관리자가 될 수 없습니다. 아래 스크립트로 만들거나 기존 계정을 승격합니다.

```bash
node scripts/create-admin.js <아이디> <닉네임> <비밀번호>
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
backend/
├── migrations/
│   ├── 001_init.sql                  # 초기 테이블 생성 + 기본 태그 데이터
│   ├── 002_accessibility.sql         # accessibility_status 컬럼 + 태그 4종 추가
│   ├── 003_seed_test.sql             # 테스트 계정 3개 + 샘플 제보 3개 (개발용)
│   ├── 004_moderation.sql            # 잘못된 정보 신고(report_flags), 정보 변경 신고(report_change_reports)
│   ├── 005_point_transactions.sql    # 포인트 내역(point_transactions) + 기존 지급분 이관
│   ├── 006_report_views.sql          # 조회수 중복 집계 방지(report_views)
│   ├── 007_change_report_images.sql  # 변경 신고 처리자·처리 시각(resolved_by/resolved_at)
│   ├── 008_point_spend.sql           # 포인트 사용(spend) 타입 + 교환 상품 컬럼(item_code/item_name)
│   └── run.js                        # 마이그레이션 실행 스크립트
├── scripts/
│   ├── create-admin.js               # 관리자 계정 생성/승격
│   └── set-admin.sql                 # SQL로 관리자 지정
├── src/
│   ├── index.js                      # 서버 진입점 (보안 헤더, Rate Limit, 라우트, 정적 파일, 에러 핸들러)
│   ├── config/
│   │   ├── db.js                     # PostgreSQL 연결 풀
│   │   └── region.js                 # 서비스 지역 설정 (중심 좌표 + 반경)
│   ├── controllers/
│   │   ├── authController.js         # 중복 확인, 회원가입, 로그인, 로그아웃, 내 정보
│   │   ├── reportController.js       # 제보 등록·목록·상세·조회수, 상태 변경, 관리자 수정·삭제
│   │   ├── moderationController.js   # 잘못된 정보 신고, 정보 변경 신고(주민 접수 + 관리자 처리)
│   │   ├── pointController.js        # 내 포인트 내역
│   │   ├── storeController.js        # 지역 상점 포인트 교환 (상품 목록 상수 포함)
│   │   ├── routeController.js        # 경로 주변 경고 조회
│   │   ├── adminUserController.js    # 관리자 회원 목록
│   │   └── tagController.js          # 태그 목록
│   ├── middleware/
│   │   ├── auth.js                   # JWT 인증 (requireAuth, requireAdmin, optionalAuth)
│   │   ├── regionCheck.js            # 제보 등록 시 서비스 지역 좌표 검증
│   │   └── upload.js                 # Multer 이미지 업로드 (최대 3장, 10MB)
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── reportRoutes.js
│   │   ├── adminRoutes.js
│   │   ├── pointRoutes.js
│   │   ├── routeRoutes.js
│   │   ├── storeRoutes.js
│   │   └── tagRoutes.js
│   └── utils/
│       ├── geo.js                    # Haversine 거리 계산
│       ├── files.js                  # 업로드 실패 시 파일 삭제
│       ├── points.js                 # 포인트 지급 공통 로직
│       └── reportContent.js          # 제보 본문 검증·수정 공통 로직
└── uploads/                          # 제보 사진 저장 위치 (정적 서빙: /uploads/*)
```

---

## DB 스키마 요약

| 테이블 | 설명 |
|---|---|
| `users` | 아이디 / 닉네임 / 비밀번호(bcrypt) / role / points |
| `tags` | 보행환경 유형 마스터 (계단, 단차 등 14종) |
| `reports` | 제보 본문 (위치, 설명, 통행 상태, 검토 상태, 조회수, 포인트 지급 여부) |
| `report_tags` | 제보 ↔ 태그 N:M |
| `report_images` | 제보 사진 (1건당 최대 3장) |
| `report_flags` | 잘못된 정보 신고 (사용자당 제보 1건에 1회) |
| `report_change_reports` | 정보 변경 신고 (처리 전 `open` 신고가 있으면 같은 사용자는 중복 접수 불가) |
| `point_transactions` | 포인트 지급(`earn`)·사용(`spend`) 내역 |
| `report_views` | 조회수 중복 집계 방지 (제보·조회자·날짜당 1행) |

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

자세한 요청·응답 형식은 [API.md](API.md)를 참고하세요. 🔒는 로그인, 🛡는 관리자 권한이 필요합니다.

### 인증 `/api/auth`

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/check-username` | - | 아이디 중복 확인 |
| GET | `/check-nickname` | - | 닉네임 중복 확인 |
| POST | `/register` | - | 회원가입 |
| POST | `/login` | - | 로그인 |
| POST | `/logout` | - | 로그아웃 (쿠키 삭제) |
| GET | `/me` | 🔒 | 내 정보 |

### 제보 `/api/reports`

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/` | - (관리자 토큰 선택) | 제보 목록. 일반 사용자는 승인(`approved`)된 제보만, 관리자는 `?status=`로 전체 조회 |
| GET | `/mine` | 🔒 | 내 제보 목록 (상태 무관) |
| GET | `/:id` | - | 제보 상세. 미승인 제보는 작성자·관리자만 (조회수 증가 없음) |
| POST | `/:id/view` | - | 조회수 집계 (사용자당·제보당 하루 1회) |
| POST | `/` | 🔒 + 지역 검증 | 제보 등록 (multipart, 사진 필수) |
| POST | `/:id/flags` | 🔒 | 잘못된 정보 신고 |
| POST | `/:id/change-report` | 🔒 | 정보 변경 신고 (JSON, 1시간 20건) |
| PATCH | `/:id/status` | 🛡 | 승인·반려·중복 처리 + 승인 시 포인트 지급 |
| PATCH | `/:id` | 🛡 | 제보 본문 수정 (제목·설명·태그·통행 상태) |
| DELETE | `/:id` | 🛡 | 제보 삭제 (사진 파일 삭제. 지급 포인트는 유지) |

### 관리자 `/api/admin` (전체 🛡)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/flags` | 잘못된 정보 신고 목록 (`?status=open\|resolved\|dismissed`) |
| PATCH | `/flags/:id` | 신고 처리 (`resolved` / `dismissed`) |
| GET | `/change-reports` | 정보 변경 신고 목록 (`?status=open\|accepted\|dismissed`) |
| PATCH | `/change-reports/:id` | 수락(`accept`, 원본 제보 자동 반영 + 신고자 포인트 지급) 또는 반려(`dismiss`) |
| GET | `/users` | 회원 목록 (페이지·검색·역할 필터) |

### 포인트 `/api/points`

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/history` | 🔒 | 내 포인트 지급·사용 내역 |

### 상점 `/api/store`

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| POST | `/redeem` | 🔒 | 포인트로 지역 상점 혜택 교환 (`{ item_id }`) |

### 경로 `/api/route`

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/` | - | 경로 주변 승인 제보 경고 조회 (`from/to` 좌표는 TMAP 보행자 길찾기 호출, `path`는 넘긴 폴리라인 그대로) |

### 태그 `/api/tags`

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/` | 태그 목록 전체 |

기타: `GET /health` → `{"status":"ok"}`, `/uploads/*` 사진 정적 서빙, 그 외 경로는 `FRONTEND_DIR`의 프론트엔드 정적 파일.

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
- 승인된 제보를 `rejected`·`duplicate`로 바꾸거나 삭제해도 **이미 지급된 포인트는 회수하지 않습니다.** 재승인 시 중복 지급되지도 않습니다.
- 지급·사용은 모두 `point_transactions`에 기록되고 `GET /api/points/history`로 조회합니다. 포인트가 줄어드는 경우는 상점 교환(`POST /api/store/redeem`, `type: 'spend'`)뿐입니다.

### 신고 처리 흐름

- **잘못된 정보 신고** (`POST /api/reports/:id/flags`): 같은 사용자가 같은 제보를 다시 신고하면 `409 ALREADY_FLAGGED`. 관리자가 `resolved`/`dismissed`로 표시하며, 제보 자체의 반려·삭제는 제보 API로 따로 처리합니다.
- **정보 변경 신고** (`POST /api/reports/:id/change-report`): 같은 사용자가 같은 제보에 처리 전(`open`) 신고가 있으면 `409 ALREADY_REPORTED`. 관리자가 수락하면 신고 사유에 따라 원본 제보의 통행 상태·태그가 자동으로 바뀌고, 신고자에게 `POINTS_PER_CHANGE_REPORT`(기본 30)점이 지급됩니다. 반려하면 포인트는 없습니다.

### 인증 방식

- 웹 브라우저: 로그인 시 `access_token` httpOnly 쿠키 자동 발급
- 앱 / fetch: `Authorization: Bearer <token>` 헤더 사용
- 두 방식 동시 사용 시 헤더 우선

### 서비스 지역 제한

`.env`의 세 값으로 제어합니다. 제보 등록(`POST /api/reports`)과 경로 조회(`GET /api/route`)에 적용됩니다.

```
REGION_CENTER_LAT=37.6215   # 월계1동 중심 위도
REGION_CENTER_LNG=127.0605  # 월계1동 중심 경도
REGION_RADIUS_KM=50         # 허용 반경 (km) — 현재 테스트 단계라 50으로 유지
```

- `.env.example`과 현재 `.env`는 테스트 편의를 위해 **50km**로 두었습니다.
- `REGION_RADIUS_KM`을 설정하지 않으면 코드(`src/config/region.js`)의 기본값 **1.5km**가 적용됩니다. 운영·전시 전에는 1.5로 바꿀 계획입니다.

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
| `REGION_RADIUS_KM` | `1.5` (코드 기본값) | 서비스 지역 반경 (km). `.env.example`은 테스트용 `50` |
| `CORS_ORIGIN` | (비어있음) | 허용 외부 도메인 (쉼표 구분, 미설정 시 same-origin) |
| `FRONTEND_DIR` | `../frontend/web` | 프론트엔드 빌드 경로 |
| `POINTS_PER_APPROVAL` | `10` | 제보 승인 시 지급 포인트 |
| `POINTS_PER_CHANGE_REPORT` | `30` | 정보 변경 신고가 수락됐을 때 신고자에게 지급하는 포인트 |
| `RATE_LIMIT_API_MAX` | `100` | 전체 API 요청 제한 (15분, IP당) |
| `RATE_LIMIT_AUTH_MAX` | `20` | 로그인·회원가입 요청 제한 (15분) |
| `RATE_LIMIT_REPORT_MAX` | `20` | 제보 등록 제한 (1시간) |
| `RATE_LIMIT_CHANGE_REPORT_MAX` | `20` | 정보 변경 신고 제한 (1시간) |
| `RATE_LIMIT_STORE_REDEEM_MAX` | `20` | 포인트 교환 제한 (1시간) |
| `RATE_LIMIT_ROUTE_MAX` | `120` | 경로 조회 제한 (1시간) |
| `TMAP_APP_KEY` | — | TMAP 보행자 길찾기 appKey (`/api/route`의 from/to 모드 필수). 미설정 시 503 ROUTING_UNAVAILABLE |
| `TMAP_TIMEOUT_MS` | `5000` | TMAP 요청 타임아웃 (ms) |
| `ROUTE_CACHE_TTL_MS` | `600000` | TMAP 응답 메모리 캐시 TTL (ms, 기본 10분) |
| `ROUTE_CACHE_SIZE` | `500` | TMAP 응답 메모리 캐시 최대 엔트리 수 |
| `TRUST_PROXY` | 자동(Vercel `1`, 로컬 `0`) | 프록시 신뢰 단계 수. 프록시 뒤에서 IP별 제한이 동작하게 함 |

---

## Rate Limit 정책

| 대상 | 제한 |
|---|---|
| 전체 API | 15분 내 100건 |
| 회원가입 / 로그인 | 15분 내 20건 (브루트포스 방어) |
| 제보 등록 | 1시간 내 20건 |
| 정보 변경 신고 | 1시간 내 20건 |
| 포인트 교환 | 1시간 내 20건 |
| 경로 조회 | 1시간 내 120건 |

위 수치는 기본값이며 `RATE_LIMIT_*` 환경변수로 조정합니다. 전시처럼 한 IP(공용 와이파이)에서 많이 접속할 때는 `.env.example`의 권장값을 참고하세요.

---

## 외부 API 연동

### TMAP 보행자 길찾기 (경로 조회용)

`GET /api/route`의 `from/to` 모드는 서버가 TMAP 보행자 길찾기 API를 호출해 실제 보행로 폴리라인을 만듭니다. `path` 모드(폴리라인 직접 지정)는 TMAP 호출 없이 그대로 사용합니다.

1. [SK오픈API 콘솔](https://openapi.sk.com) 로그인 → "나의 앱" → 앱 생성
2. 생성된 앱의 **appKey**를 복사
3. `.env`에 `TMAP_APP_KEY=복사한_값`으로 추가
4. 서버 재시작

같은 (출발·도착) 좌표 쌍은 10분 동안 메모리 캐시로 재사용돼 TMAP 호출 수를 줄입니다. 1시간당 IP별 120건으로 외부 호출을 보호하지만, 혹시 TMAP 무료 한도에 가까워지면 `.env`의 `RATE_LIMIT_ROUTE_MAX`를 더 낮추거나 `ROUTE_CACHE_TTL_MS`를 길게 두세요.

| 상황 | 응답 |
|---|---|
| 키 미설정 | `503 ROUTING_UNAVAILABLE` (`reason: KEY_NOT_CONFIGURED`) |
| TMAP이 경로를 못 찾음 | `404 NO_ROUTE_FOUND` |
| TMAP 네트워크·타임아웃·오류 | `502 UPSTREAM_ERROR` |

폴백 없이 바로 에러를 돌려주므로, 발표/시연 전에 반드시 키를 넣고 한 번 호출해 정상 응답이 오는지 확인하세요.

---

## 구현 현황과 향후 작업

구현됨: 인증, 제보 등록·조회·조회수, 관리자 승인·반려·수정·삭제, 포인트 지급과 내역, **포인트 상점 교환**, 잘못된 정보 신고, **정보 변경 신고**(접수 + 관리자 수락·반려), 관리자 회원 목록, **경로 조회**(TMAP 보행자 길찾기 기반 폴리라인 + 주변 승인 제보 경고).

미구현:

- 회원 정지·탈퇴 처리 (정책 결정 후)
- 중복 제보 자동 감지
- 사진 자동 비식별화 (얼굴·차량번호)
