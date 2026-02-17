# SNUMPS Design Blueprint (Guest Landing)

## 1. 목적
- 비로그인 진입 화면(`/`)을 LaTeX/arXiv 스타일의 정형 미니멀 UI로 유지한다.
- 다음 디자인 Agent가 동일한 시각 언어와 구현 원칙을 재사용하도록 기준을 고정한다.

## 2. 적용 범위
- 포함:
  - `/` 비로그인 상태 + 해당 상태의 글로벌 헤더/푸터
  - 로그인 이후 주요 운영 라우트(`/signup*`, `/wait`, `/events/*`, `/seminar*`, `/admin*`, `/notion`)
  - 실험 라우트(`/experiment/*`)의 시각 문법
- 제외: 서버 액션/로드/데이터 계약 변경.

## 3. 핵심 디자인 철칙
- 극단적 미니멀리즘: 장식보다 정보 위계 우선.
- 직선 규칙선 중심: 1px/2px 선으로 섹션 구분.
- 각진 구조 유지: `border-radius: 0`, 강한 그림자/글래스모피즘 금지.
- 타이포 중심 구성: 제목/저자/초록/각주 순서가 명확해야 한다.
- 로고는 강조하되 과사용 금지: 커버 타이틀 영역에서만 큰 비중으로 사용.

## 4. 페이지 구조 계약
- 헤더: 로그인 전/후 모두 동일한 paper rule 헤더를 유지한다.
  - 좌측: 로고 + 최소 네비게이션(`Seminar` 링크 1개)
  - 우측: 유틸리티 레일(`ADMIN`, `DB`, `로그아웃`)
  - 권한 규칙: `ADMIN/DB`는 관리자만 노출, `로그아웃`은 로그인 사용자 공통 노출
- 푸터: 로그인 전/후 모두 동일한 guest-latex footer 문법(연락처 + 인스타 + 테마 토글)을 사용한다.
- 커버 페이지 순서:
  - 굵은 상단 규칙선
  - 로고
  - 제목(서울대학교 수학문제연구회)
  - 소속(SNUMPS)
  - 저자 블록(회장/부회장 + 연락처)
  - 얇은 규칙선
  - Google 로그인 버튼
  - 안내 문구 + 다음 페이지 힌트
  - 하단 주석(`* Chair`, `† Vice Chair`)
- Abstract 페이지 순서:
  - `Abstract` 제목
  - 본문(기존 소개 문장 중심 유지)
  - SNS 활동 문장 + 본문 각주 인용 `[1, 2]`
  - Footnotes 링크(Instagram, YouTube)
- 좌측 세로 아이덴티티:
  - `SNUMPS @ 29 NOV 2024`
  - 고정 배치, 연한 색, 모바일에서도 유지(가려지면 안 됨).

## 5. 토큰/스타일 시스템
- 파일 기준:
  - `/Users/ysh/Desktop/fun/snumps_webpage/src/routes/+layout.svelte`
  - `/Users/ysh/Desktop/fun/snumps_webpage/src/routes/+page.svelte`
  - `/Users/ysh/Desktop/fun/snumps_webpage/src/app.html`
- 폰트 우선순위:
  - 본문/제목: `"Computer Modern Serif" -> "STIX Two Text" -> serif`
  - 수학 심볼: `"STIX Two Math"`
  - 모노: `"JetBrains Mono"`
- 컬러 토큰(Guest Landing):
  - Light: `--latex-bg #f4f4f4`, `--latex-text #111111`, `--latex-muted #4a4a4a`, `--latex-rule #1a1a1a`, `--latex-accent #b22222`
  - Dark: `--latex-bg #121212`, `--latex-text #e8e8e8`, `--latex-muted #b7b7b7`, `--latex-rule #d0d0d0`, `--latex-accent #ff7b7b`

## 6. 정렬/레이아웃 구현 원칙 (중요)
- 중앙정렬은 컨테이너 기반으로만 한다.
- 허용 방식:
  - `max-width`/`width: min(...)`
  - `margin-inline: auto`
  - grid/flex의 `justify-items`, `align-items`, `align-content`
- 금지 방식:
  - `left: 50%` + `transform: translateX(-50%)`로 강제 중앙 맞춤
- 이유:
  - 리사이즈 시 미세 오프셋과 서브픽셀 블러를 유발하고 유지보수성이 떨어진다.
- 대칭 원칙:
  - 좌우 패딩은 반드시 동일 값 유지(비대칭 패딩 금지).

## 7. 반응형 규칙
- 검증 뷰포트: `360px`, `768px`, `1280px`.
- 모바일(`<=620px`) 원칙:
  - 저자 블록 1열 스택.
  - 제목 줄바꿈 허용(`.text-break` block).
  - 로그인 버튼 폭 100% 사용.
  - Abstract 폭 제한을 유지하되 중앙축 정렬 고정.
  - 좌측 세로 아이덴티티 표시 유지.
- 태블릿(`<=900px`, `<=768px`) 원칙:
  - 배경 수학 심볼 밀도/개수 감소.
  - 규칙선/타이틀/로그인 박스 중심축 유지.

## 8. 모션/배경 규칙
- 과한 애니메이션 금지.
- 허용: 힌트 화살표 정도의 미세 모션.
- `prefers-reduced-motion` 대응 유지.
- 배경 수학 심볼은 저대비로만 사용하고 본문 가독성을 침범하지 않는다.
- 도표/지표 표현은 원형 차트보다 `figure + figcaption + 선형 막대/표`를 우선한다.
- 전역 배경은 공책 줄무늬(repeating notebook lines) 없이 단색 paper 톤으로 유지한다.

## 8-1. 논문 문서형 레이아웃 규칙
- 폼/관리 페이지는 카드보다 문서형(`paper document`) 구조를 우선한다.
- 권장 구조:
  - 문서 헤더(제목 + 부제)
  - 번호 단락(`1.`, `2.`, `3.`) 기반 섹션
  - 섹션별 입력 필드(메타데이터/본문/첨부/동의)
  - 하단 액션 영역
- 버튼/입력은 `arXiv submission`처럼 단순 선형 박스와 모노 라벨을 유지한다.
- `/signup` 최소 필드 정책:
  - 유지: `전화번호`, `배경지식`, `개인정보 동의`, `제출 액션`
  - 제거: 읽기전용 메타데이터 입력(이름/학과/이메일) 및 장식성 부제
- `/` 로그인 후 대시보드 규칙:
  - 카드형 컨테이너 대신 문서형 섹션(`paper-document + numbered sections`) 사용
  - 접기 UI는 커스텀 카드 토글 대신 `details/summary` 문법 사용
  - 활동 목록은 모바일 포함 단일 arXiv/booktabs 테이블로 유지(카드 분기 금지)
  - 도표 캡션은 `Figure n: ...`, 표 캡션은 `Table n: ...` 형식을 따른다.

## 9. 접근성 규칙
- 로그인 버튼/테마 버튼은 키보드 포커스 가능해야 한다.
- 본문/보조 텍스트/포인트 색 대비는 WCAG AA 수준을 목표로 한다.
- 장식 요소(배경 심볼, 로고 데코)는 `aria-hidden` 처리 유지.

## 10. 콘텐츠 고정 규칙
- 제목: `서울대학교 수학문제연구회`
- 소속: `SNUMPS`
- 저자 정보:
  - `김건호*` / `회장 / Author` / `010-3472-6234`
  - `서성욱†` / `부회장 / Co-author` / `010-2865-4851`
- 창립 표기 기준일: `29 NOV 2024`
- Abstract 본문은 기존 소개 문단을 최대한 유지하고, SNS 안내 문장만 추가한다.

## 11. 다음 Agent를 위한 금지/주의 체크리스트
- 금지:
  - 둥근 버튼/카드(`border-radius` 복귀)
  - 글래스모피즘/강한 블러/강한 그림자
  - 감성형 카피 중심 랜딩으로 회귀
  - 중앙정렬을 transform으로 해결
  - 동일 selector 중복 선언으로 의도 덮어쓰기
  - 운영 라우트에서 원형 통계 차트(파이/도넛) 재도입
- 주의:
  - Guest Landing만 수정해야 할 때 로그인 이후 UI를 건드리지 않는다.
  - 정렬 이슈는 먼저 패딩 대칭/폭 제약 중복부터 확인한다.
  - 전역 토큰은 `--latex-*`를 기준으로 유지하고, 레거시 alias는 호환 목적으로만 유지한다.

## 12. 변경 시 기본 검증
- 정적 검사:
  - `npm run check`
  - `npm run lint` (환경 의존성 설치 시)
- 기능 회귀:
  - 비로그인 `/`에서 `signIn('google')` 정상 동작
  - 로그인 이후 `/` 대시보드 동작 불변
- 시각 검수:
  - 상단 굵은 선/제목/로그인 박스 중심축 일치
  - 모바일에서 Abstract 가독성과 중앙 정렬 유지
  - 운영 라우트(대시보드/가입/관리/노션)에서도 규칙선 중심의 동일 축 유지
  - 검증 뷰포트(`360px`, `768px`, `1280px`)에서 좌우 패딩 대칭 확인
