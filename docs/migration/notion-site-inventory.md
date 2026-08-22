# snumps.notion.site — 공개 콘텐츠 인벤토리

> **성격**: 한시적 작업 문서. 이주 완료 시 삭제. [README](./README.md) 참조.

조사일: 2026-08-23 · 방법: 미인증 공개 API(`/api/v3/loadPageChunk`, `/api/v3/queryCollection`) +
Notion MCP 교차 확인. **여기 실린 것은 전부 로그인 없이 접근 가능한 콘텐츠다.**

- Space ID: `900be3ab-6e52-400f-ae4c-c5e2ca1cc5c8`
- Root page ID: `3042f5f5-b3ac-809f-af0d-cec9ae838ed8`
- 공개 노드: **20개** (콘텐츠 페이지 16 + 데이터베이스 페이지 4)
- 데이터베이스: **5개 / 351행**
- 뷰: **12개**
- 첨부 파일: **확인 86개** (블록 24 + DB 속성 62) + 미확인 2

---

## 1. 페이지 트리

경로는 `https://snumps.notion.site/<id>` (하이픈 제거 32자). Notion은 slug를 쓰지 않는다.

```
서울대학교 수학문제연구회                    /3042f5f5b3ac809faf0dcec9ae838ed8   [루트]
├── 활동 기록 (DB)                        /3042f5f5b3ac81f0b9ace74f33386d43   [collection_view_page]
├── 세미나                                /3042f5f5b3ac818f8eacc33129f137cc
├── 스터디                                /3042f5f5b3ac811ba381d92367b2e853
├── 개인 프로젝트                          /3042f5f5b3ac81ada029e3bc4a9fe9fd
├── 동아리 문서                            /3042f5f5b3ac81e9981be9c8b079f710
│   ├── 회칙                              /3042f5f5b3ac81fdbbe1f7e1c41ef61d
│   ├── 자금 내역                          /38a2f5f5b3ac802fb036e234814810b1
│   ├── 갤러리                             /3042f5f5b3ac814ca6d1e475ddfd5f48
│   ├── 역대 회장단                         /3902f5f5b3ac80f68041e8f7332a282d
│   ├── 선거 공약                          /3042f5f5b3ac81099ab6de9f94e5883c
│   └── 📢 홍보 자료                        /3042f5f5b3ac81b09c6ed7eb197d5fef
├── 🧭 기타 활동 자료                       /3042f5f5b3ac81ff9fbaf571e791ddc1
│   └── (토글 "2025" 내부 — 크롤러가 놓치기 쉬움)
│       ├── 자연대 Integration Bee         /3042f5f5b3ac818aac9fdfb953563c97
│       ├── 문제 창작 활동                   /3042f5f5b3ac81d596eddad0234e1645
│       └── 채팅방 논의 모음                  /3042f5f5b3ac8111a425dfb4078d8704
└── 데이터베이스                            /3042f5f5b3ac81f4923bc6642b5e3f1f
    ├── 회원 (DB)                          /3042f5f5b3ac81dd97c4d3042464a4c6
    ├── 세미나 기록 (DB)                     /3042f5f5b3ac81939f96f32c81b7dbad
    ├── 스터디 기록 (DB)                     /3042f5f5b3ac81d0b7cbe5f47b12b4c6
    └── 관리자 전용                          /3042f5f5b3ac81d1bbe2d251f517bef0   🔒 비공개
```

**`관리자 전용`은 미인증 요청 시 블록 0개** → 공개 범위 밖. 이주 대상 아님.
루트와 `데이터베이스` 사이에는 제목 없는 중간 페이지 2개(`...812b9b8d...`, `...81819ea9...`)가
ancestor-path에 나타나지만, 이는 column 레이아웃의 산물이며 별도 URL로 노출되지 않는다.

---

## 2. 페이지별 콘텐츠

| 페이지 | 성격 | 내용 |
|---|---|---|
| 루트 | 랜딩 | 소개문 + 2단 컬럼(동아리 활동 / 동아리 자료) + 활동 기록 캘린더 뷰 + 연락처 |
| 세미나 | DB 뷰 래퍼 | 안내문 2줄 + `세미나 목록` 리스트 뷰 |
| 스터디 | DB 뷰 래퍼 | 안내문 1줄 + `이번 학기의 스터디` 리스트 뷰 |
| 개인 프로젝트 | DB 뷰 래퍼 | 안내문 1줄 + `개인 프로젝트` 보드 뷰 |
| 동아리 문서 | 허브 | 하위 6페이지 링크만 |
| 회칙 | 정적 장문 | 5장 12조. header 5 / sub_header 12 / numbered_list 34 + 토글 "이력" |
| 자금 내역 | 외부 링크 | Google Sheets 링크 1건 (26-1 회계) |
| 갤러리 | DB 뷰 3개 | 세미나 갤러리 / 스터디 갤러리 / 회식 갤러리 (전부 gallery 뷰) + 토글 "동아리 로고" |
| 역대 회장단 | 정적 | 4기수 × (회장·부회장 이름·학번·이메일) |
| 선거 공약 | 정적 + 파일 | LaTeX 양식 code 블록 + PDF 3개 |
| 홍보 자료 | 정적 + 이미지 | 토글 "2025-2": 모집 홍보문 전문 + 포스터 PNG 1 |
| 기타 활동 자료 | 허브 | 토글 "2025" 안에 하위 3페이지 |
| Integration Bee | 정적 + 파일 | 대회 경위 2줄 + column_list 2 + **파일 2개** |
| 문제 창작 활동 | 파일 목록 | 날짜별 창작 문제 **PDF 15개** (2024.11 ~ 2025.05) |
| 채팅방 논의 모음 | 파일 목록 | **PDF 3개** |
| 데이터베이스 | 허브 | DB 4개 링크 + 관리자 전용(비공개) + 버튼 블록 |

### 블록 타입 분포 (236개)

```
text 89 · numbered_list 34 · sub_header 25 · file 23 · page 17 · header 13
column 11 · collection_view 7 · column_list 5 · collection_view_page 4 · toggle 4
```

`code` 블록 1개(선거 공약 LaTeX 양식). 이미지는 인라인 마크다운(`![]()`)으로 들어가 있어
`image` 블록 타입으로는 안 잡힌다.

---

## 3. 데이터베이스

| DB | collection id | 행 | 뷰 |
|---|---|---|---|
| 회원 | `3042f5f5-b3ac-81e3-9641-000b7950b6f9` | **231** | 활동 회원(table), 전체 회원(table, 필터 有) |
| 활동 기록 | `3042f5f5-b3ac-8132-882d-000b90936f75` | **76** | 일정표(calendar), 모든 활동 기록(table) |
| 세미나 기록 | `3042f5f5-b3ac-8123-9f2a-000b111b71c2` | **25** | 모든 세미나(table), 세미나 목록(list), 세미나 갤러리(gallery) |
| 스터디 기록 | `3042f5f5-b3ac-8172-81da-000ba335c05f` | **17** | 모든 스터디(table), 이번 학기의 스터디(list), 스터디 갤러리(gallery) |
| 회식 갤러리 | `3042f5f5-b3ac-8155-b369-000b71910a27` | **2** | 회식 갤러리(gallery) |

`개인 프로젝트` 보드 뷰는 회원 DB의 `개인 프로젝트` checkbox 기준 뷰로 보인다 (별도 collection 아님).

### 스키마

**회원** (10속성)
```
이름 title · 학과 text · 가입일 date · 개인 프로젝트 checkbox
임원 multi_select [24-2 자료관리부장/기획부장/부회장/회장, 25-1 ×4, 25-2 ×3, 26-1 회장/부회장]
회원 단계 formula
개인 정보 relation → (비공개 DB) · 활동 기록 relation · 주최 세미나 relation · 주최 스터디 relation
```

**활동 기록** (6속성)
```
활동명 title · 일정 date · 활동 종류 select [세미나, 스터디, 회의, 회식, 기타, Seminar]
출석 relation → 회원 · 출석 (기타) text · 캘린더 표시 여부 formula
```
> `활동 종류`에 `세미나`와 `Seminar`가 **동시에** 존재한다. 앱 코드의
> `SEMINAR_TYPES = new Set(["Seminar", "세미나"])`가 이 이중화를 흡수하고 있다.

**세미나 기록** (7속성)
```
제목 title · 학기 select [24-W, 25-1, 25-S, 25-2, 25-W, 26-1] · 비고 text
진행자 relation → 회원 · 진행자 (비회원) text
강의 자료 file · 활동 사진 file
```

**스터디 기록** (7속성)
```
분야명 title · 학기 select [동일] · 교재 text · 비고 text
주최자 relation → 회원 · 활동 기록 relation · 활동 사진 file
```

**회식 갤러리** (3속성)
```
연도 title · 사진 file · 활동 기록 relation
```

---

## 4. 첨부 파일 인벤토리 (85개)

### 블록 첨부 (확인 24 + 미확인 2)

`file` 블록 **23개** — 부모 페이지 기준 실측:

| 위치 | 개수 | 형식 |
|---|---|---|
| 문제 창작 활동 | 15 | PDF (창작 문제 + 일부 해답) |
| 채팅방 논의 모음 | 3 | PDF |
| 선거 공약 | 3 | PDF (2026-1, 2025-2, 2025-1) |
| 자연대 Integration Bee | 2 | 미확인 (column_list 내부) |

여기에 더해:

| 위치 | 개수 | 비고 |
|---|---|---|
| 홍보 자료 포스터 | 1 | **`file` 블록이 아니라 인라인 이미지**(`![]()`)라 블록 타입 집계에 안 잡힌다 |
| 갤러리 "동아리 로고" 토글 | 2 | **미해결** — loadPageChunk가 토글 내부를 안 내려준다. 실행 전 확인 필요 |

> 인라인 이미지가 `image` 블록으로 잡히지 않는다는 점은 열거 스크립트를 짤 때 함정이다.
> `file`/`image` 블록 타입만 훑으면 포스터를 통째로 빠뜨린다. **본문 텍스트의 인라인
> 마크다운 이미지까지 파싱해야 한다.**

### DB 속성 첨부 (62)

| DB | 속성 | 개수 |
|---|---|---|
| 세미나 기록 | 활동 사진 | 26 |
| 세미나 기록 | 강의 자료 | 14 |
| 스터디 기록 | 활동 사진 | 17 |
| 회식 갤러리 | 사진 | 5 |

### 🔴 파일 URL의 성질

Notion 첨부는 `prod-files-secure.s3.us-west-2.amazonaws.com/<spaceId>/<uuid>/<filename>`에
저장되며, **응답에 담기는 URL은 `X-Amz-Expires=300`인 presigned URL이다 — 5분 후 만료.**

결론: 핫링크·URL 저장 전부 불가. **반드시 다운로드 후 자체 스토리지로 재업로드**해야 한다.
블록 응답의 `source` 필드는 `attachment:<uuid>:<filename>` 형태의 내부 참조라 그대로는 못 쓴다.

---

## 5. 🔴 개인정보 노출 현황

이주 시 그대로 옮기면 안 되는 항목. **현재 로그인 없이 전부 조회 가능하다.**

| 위치 | 내용 |
|---|---|
| 회원 DB | **231명의 이름 + 학과 + 가입일 + 임원 이력** |
| 역대 회장단 | 4기수 8명의 실명 · 학부 · 학번 · **개인 이메일** |
| 루트 연락처 | 회장/부회장 **휴대전화 번호 2건** |
| 홍보 자료 | 전 회장 **휴대전화 번호 1건** (2025-2 홍보문 본문) |
| 세미나/스터디 기록 | 진행자·주최자 실명 (relation), 진행자(비회원) 실명 |

`개인 정보` DB(이메일·전화번호·배경지식)는 공개 범위 밖이다 — 이것만은 잘 분리돼 있다.

---

## 6. 🔴 이 DB들은 현재 프로덕션 DB다

공개 사이트의 DB 속성명을 앱의 `src/lib/constants.ts` `NOTION_PROPS`와 대조한 결과:

| DB | 앱이 요구하는 속성 | 결과 |
|---|---|---|
| 회원 | 이름, 학과, 가입일, 개인 정보, 임원, 활동 기록 | **6/6 일치** |
| 활동 기록 | 활동명, 일정, 활동 종류, 출석 | **4/4 일치** |
| 세미나 기록 | 제목, 진행자, 학기, 비고, 강의 자료, 활동 사진 | **6/6 일치** |

**snumps.notion.site에 공개된 데이터베이스 = Vercel 앱이 런타임에 읽고 쓰는 바로 그 DB.**
`NOTION_DB_MEMBERS` / `NOTION_DB_ACTIVITIES` / `NOTION_DB_SEMINARS`가 이들을 가리킨다.

따라서 "데이터베이스 이주"는 콘텐츠 백업이 아니라 **가동 중인 시스템의 데이터 레이어 교체**다.
[`notion-db-to-s3.md`](./notion-db-to-s3.md) §1에서 이 전제를 다룬다.

---

## 7. 재현 방법

```bash
# 루트 page id 확인
curl -s https://snumps.notion.site/ | grep -o '"pageId":"[^"]*"'

# 페이지 블록 트리
curl -s -X POST https://snumps.notion.site/api/v3/loadPageChunk \
  -H 'Content-Type: application/json' \
  -d '{"pageId":"3042f5f5-b3ac-809f-af0d-cec9ae838ed8","limit":200,
       "cursor":{"stack":[]},"chunkNumber":0,"verticalColumns":false}'

# DB 행
curl -s -X POST 'https://snumps.notion.site/api/v3/queryCollection?src=reset' \
  -H 'Content-Type: application/json' \
  -d '{"source":{"type":"collection","id":"<collection-id>","spaceId":"900be3ab-6e52-400f-ae4c-c5e2ca1cc5c8"},
       "collectionView":{"id":"<view-id>","spaceId":"900be3ab-6e52-400f-ae4c-c5e2ca1cc5c8"},
       "loader":{"reducers":{"collection_group_results":{"type":"results","limit":500}},
                 "sort":[],"searchQuery":"","userTimeZone":"Asia/Seoul"}}'
```

> `/api/v3/syncRecordValues`는 Cloudflare가 차단한다. 토글 내부 등 lazy 블록은
> loadPageChunk가 안 내려주므로, 해당 하위 페이지 id로 다시 loadPageChunk를 걸어야 한다.
> **크롤러가 토글 안의 페이지를 놓친다** — 이번 조사에서도 하위 3페이지를 2차 조회로 찾았다.
