# Notion 데이터베이스 · 자산 → AWS S3 이주 계획

> **성격**: 한시적 작업 문서. 이주 완료 시 삭제하고 남길 내용은 `ARCHITECTURE.md`·`schema.md`로
> 흡수. [README](./README.md) 참조.

대상 인벤토리: [`notion-site-inventory.md`](./notion-site-inventory.md)
페이지 이주: [`notion-pages-to-web.md`](./notion-pages-to-web.md) (별도 프로세스, §7에 순서 의존)

범위: 공개 DB **5개 / 351행**과 첨부 **확인 86개 + 미확인 2개**.

---

## 1. 🔴 먼저 짚어야 할 전제 두 가지

### 1-1. 이 DB들은 백업 대상이 아니라 가동 중인 프로덕션 DB다

인벤토리 §6에서 확인했다. 공개 사이트의 `회원`·`활동 기록`·`세미나 기록` 속성명이 앱의
`NOTION_PROPS`와 **전부 일치**한다. `NOTION_DB_MEMBERS` 등이 가리키는 그 DB다.

그래서 "DB를 S3로 옮긴다"는 콘텐츠 아카이빙이 아니라 **라이브 시스템의 데이터 레이어 교체**다.

### 1-2. 앱은 Notion에 읽기만 하지 않는다 — 쓴다

```
notionCreate / notionUpdate / notionArchive 호출 지점: 43곳
쓰기 서비스 함수: 17개
쓰기를 수행하는 라우트: 7개
  signup/           가입 신청 생성·수정
  signup/edit/      신청 수정
  +page.server.ts   프로필·세미나 정보 수정
  events/[id]/[type] 출석 기록
  admin/            승인, 회원 생성, 활동 페이지 생성, 출석자 추가, 세미나 등록
  admin/events/new  이벤트 발행
  seminar/edit/[id] 세미나 신청 수정
```

**S3는 객체 스토리지다. 데이터베이스가 아니다.** 이 워크로드를 S3로 그대로 옮기면 깨진다:

| 필요한 것 | S3에서 |
|---|---|
| `getMemberByEmail` 같은 조회 | 전체 객체를 받아 앱에서 필터. 231행이면 버티지만 확장성 없음 |
| relation 조인 (출석 ↔ 회원) | 애플리케이션이 직접 조인 |
| 부분 수정 (출석자 1명 추가) | read-modify-write 전체 객체. **동시 쓰기 시 유실** |
| 원자성·트랜잭션 | 없음 |
| 조건부 갱신 | 2024년 도입된 If-Match 조건부 쓰기로 일부 가능하나, 앱 전체를 그 전제로 재작성해야 함 |
| 쿼리·인덱스 | 없음 (S3 Select는 은퇴, Athena는 분석용) |

특히 `addAttendeeToActivity`는 이미 **retrieve → 배열에 추가 → update** 패턴이라
동시성에 취약하다. Notion은 그나마 페이지 단위 갱신이 서버에서 직렬화되지만, S3 객체
통짜 덮어쓰기로 바꾸면 두 명이 동시에 출석 체크할 때 한쪽이 사라진다.

### 1-3. 권고 — 두 갈래로 나눈다

| 데이터 | 목적지 | 근거 |
|---|---|---|
| **첨부 파일 85개** (이미지·PDF) | **S3** ✅ | 정확히 S3가 할 일. presigned URL 만료 문제도 해결 |
| **레코드 351행** | S3는 **읽기 전용 스냅샷**까지만 | 쓰기 경로 43곳을 감당 못 함 |

레코드까지 Notion에서 떼어내려면 실제 DB가 필요하다 (RDS/Aurora Serverless,
DynamoDB, Supabase, Turso 등). 이건 이 문서의 범위를 넘어서므로 §9 결정 1번으로 올린다.

**따라서 이 계획서는 아래 두 트랙으로 쓴다.**
- **트랙 A (즉시 실행 가능)**: 자산 → S3. 의존 없음, 이득 명확
- **트랙 B (조건부)**: 레코드 → S3 JSON 스냅샷. **읽기 전용 공개 페이지 전용**.
  앱의 쓰기 경로는 당분간 Notion에 그대로 둔다

---

## 2. 트랙 A — 자산 이주 (85개)

### 2-1. 원본의 성질

```
prod-files-secure.s3.us-west-2.amazonaws.com/<spaceId>/<uuid>/<filename>
  ?X-Amz-Expires=300&X-Amz-Signature=...
```

- **300초 만료 presigned URL.** 저장·핫링크 불가
- 블록 응답의 `source`는 `attachment:<uuid>:<filename>` 내부 참조라 그 자체로 못 씀
- 실제 URL을 얻으려면 매번 Notion API를 다시 호출해야 함
- 파일명에 한글·공백 포함 (`수문연_The_3rd_Executive_...`, `2025-2_홍보_포스터.png`) →
  URL 인코딩 필수

### 2-2. 목록

| 출처 | 개수 | 형식 |
|---|---|---|
| 세미나 기록 · 활동 사진 | 26 | 이미지 |
| 스터디 기록 · 활동 사진 | 17 | 이미지 |
| 세미나 기록 · 강의 자료 | 14 | PDF 등 |
| 문제 창작 활동 (블록) | 15 | PDF |
| 회식 갤러리 · 사진 | 5 | 이미지 |
| 채팅방 논의 모음 (블록) | 3 | PDF |
| 선거 공약 (블록) | 3 | PDF |
| 자연대 Integration Bee (블록) | 2 | 미확인 |
| 홍보 포스터 (**인라인 이미지**) | 1 | PNG |
| 동아리 로고 (토글, **미해결**) | 2 | 이미지 추정 |

확인 **86개** + 미해결 2개. 총 용량은 미측정 — 실행 시 `Content-Length`로 집계할 것. 포스터·스캔 이미지가
많아 수백 MB 규모로 추정하나 **추정치를 계획 근거로 삼지 말 것.**

### 2-3. 버킷·키 설계

```
s3://snumps-assets/
├── seminars/<seminar-id>/photos/<n>-<slug>.<ext>
├── seminars/<seminar-id>/materials/<n>-<slug>.<ext>
├── studies/<study-id>/photos/<n>-<slug>.<ext>
├── gallery/dinner/<year>/<n>-<slug>.<ext>
├── documents/elections/<term>.pdf
├── documents/problems/<yyyy-mm-dd>/<slug>.pdf
├── documents/discussions/<slug>.pdf
├── press/<term>/poster.png
└── brand/logo/<variant>.<ext>
```

원칙:
- **원본 Notion uuid를 키에 넣지 않는다.** Notion을 떠나는 게 목적인데 식별자를 물려받으면
  의존이 남는다. 대신 매핑표(§2-5)를 남긴다
- 한글 파일명은 **슬러그화**한다. 원본 파일명은 매핑표와 S3 객체 메타데이터에 보존
- 확장자는 `Content-Type`으로 판정. Notion 파일명 확장자를 신뢰하지 말 것
  (인벤토리에 `2025-2`, `수문연_a_calculus_puzzle` 처럼 확장자 없는 항목이 있다)

### 2-4. 접근 정책

| 방식 | 평가 |
|---|---|
| **CloudFront + OAC (권장)** | 버킷은 완전 비공개, CDN만 접근. 캐시·커스텀 도메인·서명 URL 전환이 쉬움 |
| 퍼블릭 버킷 정책 | 가장 단순하나 실수 여지가 크고, 비공개 전환이 어렵다 |
| 앱 경유 presigned URL | Notion과 같은 문제를 재발명하는 셈. 비공개 자료가 생길 때만 |

공개 페이지에 붙는 자산이므로 CloudFront + OAC + 긴 `Cache-Control`이 맞다.
버킷은 **퍼블릭 액세스 차단 유지**, 버전 관리 활성화, 기본 SSE-S3 암호화.

### 2-5. 매핑표를 반드시 남긴다

```jsonc
// assets-manifest.json — 레포에 커밋
{
  "attachment:ef43a0d5-5920-4ff7-a593-078d795776e3:2026-1.pdf": {
    "s3Key": "documents/elections/2026-1.pdf",
    "originalName": "2026-1.pdf",
    "contentType": "application/pdf",
    "bytes": 123456,
    "sha256": "...",
    "sourcePage": "3042f5f5b3ac81099ab6de9f94e5883c"
  }
}
```
이게 없으면 페이지 이주 쪽에서 어떤 링크가 어떤 파일이었는지 되짚을 수 없다.

### 2-6. 파이프라인

```
1. 열거    loadPageChunk + queryCollection 으로 첨부 참조 전량 수집
           ⚠️ `file`/`image` 블록 타입만 훑으면 안 된다. 홍보 포스터처럼
              본문 인라인 마크다운 이미지로 들어간 자산이 있다. 토글 내부는
              lazy 로딩이라 하위 페이지 id로 재조회해야 한다 (동아리 로고 2건 미해결)
2. 해석    Notion API로 다운로드 가능한 presigned URL 획득 (5분 안에 소비)
3. 다운로드 Content-Type / Content-Length 기록, sha256 계산
4. 정규화   슬러그화, 확장자 판정, 중복 제거(sha256 동일 = 동일 파일)
5. 업로드   S3 PUT + 메타데이터(원본 파일명·출처 페이지)
6. 검증    개수 일치, 바이트 수 일치, HEAD 200, 샘플 열어보기
7. 기록    assets-manifest.json 커밋
```

**멱등성**: 4단계 sha256 기준으로 이미 올라간 파일은 건너뛴다. 중단·재실행이 안전해야 한다.
**레이트 리밋**: Notion API는 평균 3req/s. 85개면 문제없지만 재시도까지 고려해 직렬 + 백오프.

---

## 3. 트랙 B — 레코드 스냅샷 (조건부)

**전제: 읽기 전용. 앱의 쓰기 경로는 Notion에 그대로 둔다.**
이 트랙은 §1-3의 한계를 인정한 위에서, 공개 페이지의 읽기 부하를 Notion에서 떼어내는 것이 목적이다.

### 3-1. 스냅샷 형태

```
s3://snumps-data/
├── snapshots/<ISO8601>/members.json
├── snapshots/<ISO8601>/activities.json
├── snapshots/<ISO8601>/seminars.json
├── snapshots/<ISO8601>/studies.json
├── snapshots/<ISO8601>/gallery-dinner.json
└── latest/ → 위 5개의 최신 사본
```

`latest/`를 별도 프리픽스로 두는 이유: 소비자가 타임스탬프를 몰라도 되게 하려는 것.
S3에 심볼릭 링크는 없으므로 **복사**다.

### 3-2. 정규화 스키마

Notion의 relation은 page id 배열이다. 스냅샷에서는 그대로 두되 **안정적인 자체 id**를 병기한다.

```jsonc
// seminars.json
{
  "generatedAt": "2026-08-23T00:00:00Z",
  "source": "notion",
  "count": 25,
  "items": [{
    "id": "smn_2026-1_intro-to-topology",   // 자체 안정 id
    "notionPageId": "...",                   // 역추적용, 소비자는 쓰지 않음
    "title": "...",
    "semester": "26-1",                      // [24-W,25-1,25-S,25-2,25-W,26-1]
    "remarks": "...",
    "speakerIds": ["mem_..."],               // 회원 자체 id
    "speakerNamesNonMember": ["..."],
    "materials": [{ "s3Key": "seminars/.../materials/1-....pdf" }],
    "photos":    [{ "s3Key": "seminars/.../photos/1-....jpg" }]
  }]
}
```

- `file` 속성은 **S3 키로 치환**한다. 트랙 A가 선행돼야 하는 이유
- select 값은 그대로. `활동 종류`의 `세미나`/`Seminar` 이중화는 스냅샷 단계에서 **한쪽으로 통일**하고
  통일 규칙을 매니페스트에 기록 (앱의 `SEMINAR_TYPES` 처리와 어긋나지 않게)
- formula 속성(`회원 단계`, `캘린더 표시 여부`)은 Notion이 계산한 값이다.
  스냅샷에 값만 담으면 규칙이 사라진다 → **계산식을 코드로 옮기거나, 담지 않는다**

### 3-3. 🔴 회원 스냅샷은 기본적으로 만들지 않는다

231명의 이름·학과·가입일이다. S3에 통짜 JSON으로 올려놓고 CloudFront로 공개하면
Notion보다 **긁어가기 쉬운 형태**가 된다. 페이지 이주 문서 §4의 결정이 나기 전에는 만들지 않는다.

만들더라도:
- 공개 버킷/배포에 올리지 않는다
- 공개용에는 파생 집계(인원수, 학과 분포)만 별도 파일로 낸다
- `개인 정보` DB(이메일·전화)는 어떤 형태로도 포함하지 않는다

### 3-4. 갱신

| 방식 | 평가 |
|---|---|
| 수동 실행 | 351행 규모엔 충분. 초기엔 이걸로 시작 |
| Vercel Cron | 이미 `vercel.json`에 cron이 있다(`0 15 */2 * *`). 같은 방식으로 스냅샷 잡 추가 가능 |
| Notion webhook | 실시간이지만 설정·검증 부담. 지금 규모엔 과하다 |

Cron으로 갈 경우 기존 `/api/cron/sync-events`와 같이 `CRON_SECRET` Bearer 검사를 걸 것
(`docs/API.md` 참조 — 이 변수가 없으면 엔드포인트가 공개된다).

---

## 4. 앱 통합

### 4-1. 읽기 경로

현 구조는 `withCache(key, ttl, fetcher)`로 Notion 페처를 감싸고 있다
(`src/lib/server/cache.ts`, Redis+메모리 2단). 스냅샷을 도입해도 **이 인터페이스는 유지**하고
페처만 바꾸면 된다.

```
기존:  withCache("all_seminars", ttl, () => getSeminarsFromNotion())
신규:  withCache("all_seminars", ttl, () => getSeminarsFromS3())
```

Repository 계층(`src/lib/server/repositories/`)이 이미 있으므로 여기에 흡수시키는 게 자연스럽다.

### 4-2. 없는 모듈

스터디 기록·회식 갤러리 DB에 대한 접근 코드가 앱에 **전혀 없다**. env 변수도 없다
(`SETUP.md`에 `NOTION_DB_STUDIES` 부재). 트랙 B를 하든 안 하든 신설 대상이다.

### 4-3. 자산 URL

`CDN_BASE_URL` 같은 env를 두고 `s3Key`를 URL로 조립한다. 절대 URL을 스냅샷에 박으면
도메인 변경 시 전량 재생성해야 한다.

---

## 5. 비용

351행 + 85파일은 S3 관점에서 사실상 무시할 수준이다 (스토리지 GB당 월 $0.023 선).
실제 비용은 **CloudFront 전송량**과 **요청 수**에서 나온다. 동아리 사이트 트래픽 규모면
프리티어 내외. 다만:

- 버전 관리를 켜면 덮어쓸 때마다 이전 버전이 쌓인다 → 수명 주기 규칙으로 정리
- 스냅샷을 자주 돌리면 `snapshots/` 프리픽스가 무한히 자란다 → 보존 기간 정책 필요 (예: 30일)

---

## 6. 검증

| 항목 | 방법 |
|---|---|
| 행 수 | 스냅샷 `count` == Notion `queryCollection` total (회원 231 / 활동 76 / 세미나 25 / 스터디 17 / 회식 2) |
| 자산 개수 | S3 객체 수 == 열거 단계 실측치 (조사 시점 확인 86 + 미해결 2). 중복 제거로 줄면 매니페스트에 기록 |
| 자산 무결성 | sha256 대조, HEAD로 Content-Length 일치 |
| relation 정합 | 스냅샷의 모든 참조 id가 대상 스냅샷에 실재하는지 (dangling 0) |
| 렌더 확인 | 세미나·스터디·갤러리 페이지에서 이미지 깨짐 0 |
| 회귀 | Notion 쓰기 경로 7개 라우트가 그대로 동작 (트랙 B는 읽기만 바꾼다) |

---

## 7. 순서 의존

```
트랙 A (자산 → S3)
   └── assets-manifest.json 확정
         ├── 트랙 B (스냅샷의 file 속성을 s3Key로 치환)
         └── 페이지 이주 P3/P4 (링크·이미지 삽입)
```

**자산 이주가 모든 것의 선행 조건이다.** 페이지 이주 문서 §5, §8 P2와 대응.

---

## 8. 단계

```
A1  자산 전량 열거 + 용량 실측 (추정 금지)
A2  버킷 생성, 퍼블릭 차단·버전관리·암호화, CloudFront+OAC
A3  다운로드·정규화·업로드 스크립트 (멱등, 재실행 안전)
A4  검증 + assets-manifest.json 커밋
--- 여기서 페이지 이주 P3 착수 가능 ---
B1  결정 §9-1 (레코드 최종 목적지) 확정
B2  스냅샷 스키마 확정, formula 처리 방침
B3  익스포터 작성 (회원 제외)
B4  읽기 경로를 Repository 계층에서 스냅샷으로 전환
B5  갱신 자동화 (수동 → cron)
```

---

## 9. 결정 필요

1. **🔴 레코드의 최종 목적지** — S3 읽기 전용 스냅샷으로 만족할지, 실제 DB로 갈지.
   후자면 어떤 DB인지. 이 답이 트랙 B 전체를 규정한다
2. **Notion을 계속 쓸 것인가** — 임원진의 편집 UI로 남길지. 남기면 Notion이 원본이고
   S3는 파생물이다. 떠나면 편집 UI를 앱에 만들어야 한다 (현재 `/admin`이 일부만 커버)
3. **회원 스냅샷** — 만들지 여부와 공개 범위 (페이지 이주 §9-2와 같은 결정)
4. **버킷 분리** — `snumps-assets` / `snumps-data`를 나눌지 프리픽스로만 구분할지
5. **CloudFront 커스텀 도메인** — `assets.snumps.*` 같은 도메인을 붙일지
6. **스냅샷 갱신 주기** — 수동 / cron 주기
7. **`활동 종류` 값 통일** — `세미나` vs `Seminar` 중 어느 쪽으로 정규화할지
8. **리전** — Notion 원본은 `us-west-2`. 사용자가 한국이므로 `ap-northeast-2` 권장.
   CloudFront를 쓰면 체감 차이는 작다
