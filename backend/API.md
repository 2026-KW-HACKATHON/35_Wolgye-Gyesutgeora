# 월계1동 보행지도 API 명세 (앱 개발용)

모든 응답은 JSON입니다. 실패 시 `{ "error": "메시지", "code": "코드(있을 때만)" }` 형태입니다.

## 0. 앱에서 서버 주소 설정

| 실행 환경 | Base URL |
|---|---|
| 안드로이드 에뮬레이터 | `http://10.0.2.2:3000` |
| 실제 폰 (PC와 같은 와이파이) | `http://<PC 내부 IP>:3000` (예: `http://192.168.0.10:3000`) |

- 서버가 HTTPS가 아니므로 안드로이드 매니페스트의 `<application>`에 `android:usesCleartextTraffic="true"`를 넣어야 요청이 막히지 않습니다.
- 로그인이 필요한 API는 헤더에 `Authorization: Bearer <token>`을 붙입니다.

## 1. 인증

개인정보 없이 **아이디 + 닉네임 + 비밀번호**로 가입합니다. 아이디는 로그인용, 닉네임은 화면(제보 작성자)에 보이는 이름이며 둘 다 중복될 수 없습니다.

| 항목 | 규칙 |
|---|---|
| username (아이디) | 영문·숫자·밑줄(_) 4~20자. 대문자로 입력해도 소문자로 저장 (`Walker01` = `walker01`) |
| nickname (닉네임) | 2~20자, 앞뒤 공백 제거 |
| password | 8자 이상 |

### 아이디 중복 확인 `GET /api/auth/check-username?username=walker01`
### 닉네임 중복 확인 `GET /api/auth/check-nickname?nickname=길찾기`
가입 화면의 "중복 확인" 버튼용입니다. 한글 닉네임은 URL 인코딩해서 보냅니다.
```json
{ "available": true,  "message": "사용 가능한 아이디입니다." }
{ "available": false, "message": "이미 사용 중인 아이디입니다." }
```
- 형식이 규칙에 맞지 않으면 `400` `INVALID_USERNAME` / `INVALID_NICKNAME`
- 확인 후 가입 버튼을 누르기 전에 다른 사람이 먼저 가져갈 수 있으므로, 가입 API에서도 다시 검사합니다.

### 회원가입 `POST /api/auth/register`
```json
{ "username": "walker01", "nickname": "길찾기", "password": "password123" }
```
- 성공 `201` → 로그인과 같은 형태로 토큰을 바로 돌려줍니다 (가입 후 자동 로그인)
- 실패 `400` 입력 오류 / `409` `USERNAME_TAKEN` 또는 `NICKNAME_TAKEN`

### 로그인 `POST /api/auth/login`
```json
{ "username": "walker01", "password": "password123" }
```
- 성공 `200`
```json
{ "token": "eyJ...", "user": { "id": "uuid", "username": "walker01", "nickname": "길찾기", "role": "user", "points": 0 } }
```
- 실패 `401` 아이디/비밀번호 틀림
- 토큰 유효기간 7일
- 비밀번호 찾기는 없습니다 (본인 확인할 개인정보를 받지 않기 때문)

### 내 정보 `GET /api/auth/me` 🔒
`200` → `{ "user": { "id", "username", "nickname", "role", "points", "created_at" } }`

## 2. 태그

### 태그 목록 `GET /api/tags`
제보 화면의 선택지로 사용합니다.
```json
{ "tags": [ { "id": 1, "code": "stairs", "label": "계단 있음", "category": "physical", "icon": "stairs" } ] }
```
| id | code | label | category |
|---|---|---|---|
| 1 | stairs | 계단 있음 | physical |
| 2 | high_curb | 단차 10cm 이상 | physical |
| 3 | narrow_path | 휠체어·유모차 통과 어려움 | physical |
| 4 | steep_slope | 급경사 | physical |
| 5 | no_sidewalk | 인도 없음 | physical |
| 6 | construction | 공사 중 | temp |
| 7 | obstacle | 적치물/장애물 | temp |
| 8 | poor_lighting | 조명 불량 | safety |
| 9 | safety_path | 여성 안심길 | safety |
| 10 | slippery | 미끄러움 주의 | physical |

## 3. 제보

### 제보 등록 `POST /api/reports` 🔒 📍
`multipart/form-data`로 보냅니다.

| 필드 | 필수 | 설명 |
|---|---|---|
| latitude | ✅ | **제보하는 순간의 단말기 GPS 위도** |
| longitude | ✅ | **제보하는 순간의 단말기 GPS 경도** |
| tag_ids | ✅ | 태그 id, 쉼표 구분 (예: `1,3`) |
| images | ✅ | 사진 파일 1~3장 (같은 필드명 `images`로 여러 번), jpg/png/webp/heic, 장당 10MB 이하 |
| title | | 제목 |
| description | | 설명 |

- 📍 좌표가 월계1동 중심 반경 1.5km 밖이면 `403` `OUT_OF_REGION` (`distance_km` 함께 반환)
- 앱은 제보 버튼을 누를 때 GPS 권한을 요청하고, 그때 받은 현재 위치를 보내면 됩니다.
- 성공 `201` → `{ "report": { ...아래 상세와 같은 형태 } }`
- 실패 `400` 사진 없음·태그 없음·없는 태그·사진 4장 이상 / `401` 로그인 안 함

### 지도용 제보 목록 `GET /api/reports`
로그인·지역 제한 없음. 선택 쿼리 `status` = `pending` | `approved` | `rejected` | `duplicate` (생략 시 전체)
```json
{ "reports": [ {
  "id": "uuid", "title": "계단", "description": "입구 계단 5개",
  "latitude": 37.623, "longitude": 127.059, "status": "pending",
  "view_count": 0, "created_at": "2026-09-20T07:04:53.584Z",
  "reporter_nickname": "길찾기",
  "tags": ["narrow_path", "stairs"],
  "images": ["/uploads/xxxx.png"]
} ] }
```
- 지도 마커 아이콘은 `tags`의 code로 구분하면 됩니다.
- 사진 주소는 `Base URL + images[i]` (예: `http://10.0.2.2:3000/uploads/xxxx.png`)

### 제보 상세 `GET /api/reports/:id`
목록 항목과 같은 형태에 `user_id`, `address`, `updated_at`이 추가됩니다. 호출할 때마다 조회수가 1 올라갑니다. 없는 id는 `404`.

### 내 제보 목록 `GET /api/reports/mine` 🔒

## 4. 알아둘 점

- 새 제보는 `status: "pending"`으로 저장되며, 지금은 승인 절차가 없어 목록에 바로 나옵니다.
- 포인트는 `points` 값만 존재하고 적립 기능은 아직 없습니다(항상 0).
- 위치 판정은 앱이 보낸 좌표를 믿는 방식이라, 위치 조작 앱을 쓰면 서버에서 막을 수 없습니다.
