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
로그인·지역 제한 없음. **비로그인·일반 사용자에게는 승인(`approved`)된 제보만 보입니다.**
- 선택 쿼리 `status` = `pending` | `approved` | `rejected` | `duplicate`
- 일반 사용자: 생략하면 `approved`로 처리. `approved` 이외의 값을 보내면 `403` `FORBIDDEN_STATUS`
- 관리자(관리자 토큰을 함께 보낸 경우): 원하는 `status`로 조회, 생략하면 전체
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
목록 항목과 같은 형태에 `user_id`, `address`, `updated_at`, `point_awarded`, `points_amount`가 추가됩니다.
- 승인된 제보는 누구나 볼 수 있습니다. 이 API는 조회수를 올리지 않습니다 (조회수는 아래 `POST /api/reports/:id/view`로 집계).
- 미승인(`pending`·`rejected`·`duplicate`) 제보는 **작성자 본인과 관리자만** 볼 수 있고(토큰 필요), 이때는 조회수가 올라가지 않습니다. 그 외에는 존재 여부가 드러나지 않도록 `404`입니다.
- 없는 id도 `404`.

### 내 제보 목록 `GET /api/reports/mine` 🔒
상태와 관계없이 내가 등록한 제보를 모두 돌려줍니다 (`pending`·`rejected` 포함). 각 항목에 조회수 `view_count`가 포함됩니다.

### 조회수 집계 `POST /api/reports/:id/view`
지도에서 제보 팝업을 **열 때** 호출합니다. 로그인 불필요(토큰이 있으면 사용자 기준, 없으면 IP 기준).
```json
{ "counted": true, "view_count": 13 }
```
- 같은 사용자가 같은 제보를 **하루(한국 시간 기준)에 여러 번** 열어도 1회만 반영됩니다. 이미 센 경우 `counted: false`이고 `view_count`는 그대로입니다.
- 승인(`approved`)된 제보만 집계합니다. 없는 id·미승인 제보는 `404`.
- 화면 문구는 `view_count`를 "N회 조회됨"처럼 쓰는 것을 권장합니다 (사람 수가 아니라 사용자·일 단위 조회 횟수).

### 잘못된 정보 신고 `POST /api/reports/:id/flags` 🔒
```json
{ "reason": "wrong_info", "description": "실제로는 계단이 없어요" }
```
- `reason` = `bad_photo` | `wrong_info` | `duplicate` | `etc`, `description`은 선택
- 성공 `201` → `{ "flag": { "id", "report_id", "reason", "description", "status": "open", "created_at" } }`
- 같은 사용자가 같은 제보를 다시 신고하면 `409` `ALREADY_FLAGGED`, 잘못된 `reason`은 `400`, 없는 제보는 `404`

### 정보 변경 신고 `POST /api/reports/:id/change-report` 🔒
"장애물이 치워졌어요" 같이 상황이 바뀐 것을 알립니다. **JSON**으로 보내며 사진·GPS는 필요 없습니다.
```json
{ "reason": "obstacle_removed", "description": "적치물이 없어졌어요" }
```
- `reason` = `obstacle_removed` | `construction_done` | `now_passable` | `now_impassable` | `info_different` | `etc`, `description`은 선택
- 성공 `201` → `{ "change_report": { "id", "report_id", "reason", "description", "status": "open", "created_at" } }`
- 잘못된 `reason`은 `400`, 없는 제보는 `404`, 로그인 안 함은 `401`
- 같은 사용자가 같은 제보에 아직 처리되지 않은(`open`) 신고가 있으면 `409` `ALREADY_REPORTED`. 처리(수락·반려)된 뒤에는 다시 신고할 수 있습니다.
- 1시간에 최대 20건까지 보낼 수 있습니다.
- 수락되면 신고자에게 포인트 30점이 지급됩니다(아래 관리자 항목 참고).

## 3-2. 관리자 (`role: "admin"` 토큰 필요, 아니면 `403`)

### 제보 승인·반려 `PATCH /api/reports/:id/status` 🔒 관리자
```json
{ "status": "approved" }
```
- `status` = `approved` | `rejected` | `duplicate` (`pending`으로 되돌리는 것은 불가)
- 성공 `200` → `{ "report": {...}, "points_awarded": 10, "points_revoked": 10 }` (`points_awarded`·`points_revoked`는 해당될 때만 포함)
- **승인**하면 작성자에게 포인트를 지급합니다(기본 10점, 서버 환경변수 `POINTS_PER_APPROVAL`). 같은 제보에 중복 지급되지 않습니다.
- **승인된 제보를 `rejected`·`duplicate`로 바꾸면** 지급했던 포인트를 회수합니다(0점 밑으로는 내려가지 않음). 다시 승인하면 새로 지급되므로 승인·반려를 반복해도 포인트가 늘지 않습니다.

### 제보 본문 수정 `PATCH /api/reports/:id` 🔒 관리자
관리자 "정보 수정". 보낸 항목만 바뀝니다. JSON으로 보냅니다.
```json
{ "title": "계단", "description": "입구 계단 5개", "tag_ids": [1, 3], "accessibility_status": "inconvenient" }
```
| 항목 | 설명 |
|---|---|
| title | 제목, 200자 이하. 빈 문자열이면 제목을 비움 |
| description | 설명. 빈 문자열이면 비움 |
| tag_ids | 태그 id 배열 또는 `"1,3"`. **태그를 이 목록으로 통째로 교체**하며 최소 1개 |
| accessibility_status | `passable` \| `inconvenient` \| `impassable` |

- 성공 `200` → `{ "report": {...제보 상세와 같은 형태} }`. `updated_at`(최근 확인일)이 갱신됩니다.
- `400` `NO_FIELDS` 수정할 항목 없음 / `INVALID_TITLE` / `INVALID_DESCRIPTION` / `INVALID_ACCESSIBILITY_STATUS` / `TAGS_REQUIRED` 태그가 비었음 / `INVALID_TAG` 없는 태그, `404` 없는 제보
- 검수 상태(승인·반려)·좌표·사진은 이 API로 바꾸지 않습니다. 상태는 위의 `PATCH /api/reports/:id/status`로 바꿉니다.

### 제보 삭제 `DELETE /api/reports/:id` 🔒 관리자
- 태그·사진(파일 포함)·신고 기록을 함께 삭제하고, 승인되어 지급된 포인트가 있으면 회수합니다.
- 성공 `200` → `{ "message": "제보를 삭제했습니다.", "deleted_id": "uuid", "points_revoked": 10 }` (`points_revoked`는 회수했을 때만 포함)
- 포인트 내역은 제보가 삭제돼도 남습니다(`report_id`는 `null`, `report_title`은 유지).

### 잘못된 정보 신고 목록·처리
- `GET /api/admin/flags?status=open|resolved|dismissed` → `{ "flags": [ { id, reason, description, status, created_at, report_id, flagger_nickname, report_title, report_status, report_accessibility_status, report_owner_nickname, report_image } ] }`
- `PATCH /api/admin/flags/:id` body `{ "status": "resolved" | "dismissed" }` → `{ "flag": {...} }`
- 신고가 맞으면 제보 자체는 위의 `PATCH /api/reports/:id/status`(반려)나 `DELETE /api/reports/:id`(삭제)로 처리합니다.

### 정보 변경 신고 목록·처리
- `GET /api/admin/change-reports?status=open|accepted|dismissed` → `{ "change_reports": [ { id, reason, description, status, created_at, report_id, reporter_nickname, report_title, report_status, report_accessibility_status, report_updated_at, report_image } ] }`
- `PATCH /api/admin/change-reports/:id` body `{ "action": "accept" | "dismiss", ... }` → `{ "change_report": {...}, "points_awarded": 30 }` (`points_awarded`는 수락했을 때만 포함)
- **처리 대기(`open`)인 신고만 처리할 수 있습니다.** 이미 처리된 신고는 `409` `ALREADY_PROCESSED`입니다.
- **`dismiss`(반려)**: 신고만 `dismissed`로 바꿉니다. 포인트는 지급하지 않습니다.
- **`accept`(수락)**: 신고가 `accepted`로 바뀌고, **신고 사유에 따라 원본 제보가 자동으로 바뀝니다.**

  | reason | 원본 제보에 자동 반영되는 내용 |
  |---|---|
  | `now_passable` | 통행 상태를 `passable`로 |
  | `now_impassable` | 통행 상태를 `impassable`로 |
  | `obstacle_removed` | 태그 `obstacle`(적치물/장애물) 제거 |
  | `construction_done` | 태그 `construction`(공사 중) 제거 |
  | `info_different` · `etc` | 자동 반영 없음 → 아래 항목 중 하나 이상을 직접 보내야 함 (없으면 `400` `NEEDS_CHANGES`) |

  - 수락할 때 `accessibility_status`, `title`, `description`, `tag_ids`(교체할 태그 목록), `status`(제보 검수 상태)를 함께 보내면 **자동 반영 값보다 우선**합니다. 값 규칙은 `PATCH /api/reports/:id`와 같습니다.
  - 태그를 제거하면 제보에 태그가 하나도 남지 않을 때는 `400` `TAGS_WOULD_BE_EMPTY` — `tag_ids`로 새 태그를 지정해서 다시 보내세요. (이때 아무것도 바뀌지 않습니다)
  - 원본 제보의 `updated_at`(최근 확인일)은 항상 새로 찍힙니다.
  - `status`를 함께 넘기면 위 승인·반려와 똑같이 제보자의 포인트 지급·회수가 처리됩니다.
  - 수락하면 **신고자에게 포인트 30점**을 지급합니다(서버 환경변수 `POINTS_PER_CHANGE_REPORT`, 기본 30). 한 신고에 한 번만 지급됩니다.

### 회원 목록 `GET /api/admin/users` 🔒 관리자
페이지 나누기·검색을 지원합니다. 비밀번호 해시는 응답에 포함되지 않습니다. 가입 최신순.

| 쿼리 | 설명 |
|---|---|
| page | 페이지 번호 (기본 1) |
| limit | 페이지당 개수 (기본 20, 최대 100) |
| q | 아이디·닉네임 부분 일치 검색 (대소문자 무시) |
| role | `user` \| `admin` |
| active | `true` \| `false` (`is_active` 필터) |

```json
{
  "users": [ { "id": "uuid", "username": "walker01", "nickname": "길찾기", "role": "user",
               "points": 0, "is_active": true, "report_count": 3,
               "created_at": "2026-09-20T07:04:53.584Z", "updated_at": "2026-09-20T07:04:53.584Z" } ],
  "pagination": { "page": 1, "limit": 20, "total": 42, "total_pages": 3 }
}
```
- 잘못된 쿼리 값은 `400` (`INVALID_PAGE` / `INVALID_LIMIT` / `INVALID_ROLE` / `INVALID_ACTIVE`)
- 회원 정지·탈퇴 처리 API는 정책 결정 후 추가 예정

## 3-1. 포인트

### 내 포인트 내역 `GET /api/points/history` 🔒
내 포인트 지급·회수 기록을 최신순으로 돌려줍니다. 조회수는 올라가지 않습니다.
```json
{ "history": [ {
  "id": "uuid", "type": "earn", "amount": 10, "reason": "report_approved",
  "report_id": "uuid", "report_title": "계단", "created_at": "2026-09-20T07:04:53.584Z"
}, {
  "id": "uuid", "type": "revoke", "amount": 10, "reason": "approval_cancelled",
  "report_id": "uuid", "report_title": "계단", "created_at": "2026-09-21T02:10:11.000Z"
} ] }
```
| type | reason | 의미 |
|---|---|---|
| `earn` | `report_approved` | 제보가 승인되어 지급 |
| `earn` | `change_report_accepted` | 정보 변경 신고가 수락되어 지급 (30점) |
| `revoke` | `approval_cancelled` | 승인됐던 제보가 반려·중복 처리되어 회수 |
| `revoke` | `report_deleted` | 승인됐던 제보가 삭제되어 회수 |

- `amount`는 항상 양수이고, 늘었는지 줄었는지는 `type`으로 구분합니다. (`earn`은 +, `revoke`는 −)
- 제보가 삭제된 내역은 `report_id`가 `null`이지만 `report_title`은 남습니다.
- 정보 변경 신고로 받은 포인트는 그 제보가 나중에 삭제돼도 회수하지 않습니다.
- 현재는 포인트 사용 기능이 없어 `earn`과 `revoke`만 있습니다.
- 서버가 이 API를 도입하기 전에 이미 지급된 포인트는 `earn` 내역으로 옮겨 담았고, 그 `created_at`은 당시 제보의 `updated_at`입니다.

## 3-2. 경로 주변 경고

### 경로 경고 조회 `GET /api/route`
로그인 불필요. 경로(선분) 가까이에 있는 **승인(approved)된 제보**를 `warnings`로 돌려줍니다.

| 쿼리 | 필수 | 설명 |
|---|---|---|
| from_lat, from_lng, to_lat, to_lng | ✅* | 출발지→도착지 직선 경로 |
| path | ✅* | `위도,경도;위도,경도;...` 점 2~200개를 잇는 경로. 있으면 from/to보다 우선 |
| radius_m | | 경로에서 이 거리(m) 이내 제보만 포함. 기본 30, 1~200 |
| limit | | warnings 최대 개수. 기본 20, 1~50 |

\* from/to 4개 또는 path 중 하나

```json
{
  "route": [ [37.6215, 127.0605], [37.6215, 127.063] ],
  "route_distance_m": 220,
  "radius_m": 30,
  "warnings": [ {
    "report_id": "uuid", "title": "계단", "latitude": 37.6215, "longitude": 127.061,
    "tags": ["stairs"], "accessibility_status": "inconvenient",
    "distance_m": 0, "along_m": 44
  } ],
  "total_warnings": 1,
  "truncated": false
}
```
- `warnings`는 경로를 따라가는 순서(`along_m`: 출발지부터의 거리 m)로 정렬됩니다. `distance_m`은 경로에서 떨어진 거리입니다.
- 조건에 맞는 제보가 `limit`보다 많으면 앞에서부터 `limit`개만 주고 `truncated: true`, 전체 개수는 `total_warnings`로 알려줍니다.
- 경로의 점 중 하나라도 서비스 지역 밖이면 `403` `OUT_OF_REGION` (`distance_km`, `allowed_radius_km` 함께 반환)
- 좌표·`radius_m`·`limit` 형식 오류는 `400` `INVALID_ROUTE`
- 직선 경로 기준이며 실제 보행로를 따라 안내하는 길찾기는 아닙니다 (MVP).

## 4. 알아둘 점

- 새 제보는 `status: "pending"`으로 저장되며, 관리자가 승인하기 전까지는 지도 목록·상세에 나오지 않습니다(작성자 본인은 `GET /api/reports/mine`과 상세로 볼 수 있습니다).
- 포인트는 승인 시 지급되고, 승인이 취소(반려·중복 처리)되거나 제보가 삭제되면 회수됩니다. 현재 포인트는 로그인·`GET /api/auth/me`의 `points`로, 지급·회수 기록은 `GET /api/points/history`로 확인합니다.
- 사진 파일(`/uploads/...`)은 주소(무작위 UUID 파일명)를 알면 누구나 열 수 있습니다. 미승인 제보의 사진 주소는 위 조회 API로는 나오지 않지만, 파일 자체에 로그인 검사를 하지는 않습니다.
- 위치 판정은 앱이 보낸 좌표를 믿는 방식이라, 위치 조작 앱을 쓰면 서버에서 막을 수 없습니다.
