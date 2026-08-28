---
type: external
title: "YouTube Data API v3 (영상)"
description: "복권 영상 수집에 쓸 YouTube Data API 의 쿼터 구조·정책 의무·미확인 항목"
tags: [external, tbd]
owner: worker
status: draft
sources: ["raw:004-유튜브영상수집계획.md"]
created: 2026-08-28
updated: 2026-08-28
---

# YouTube Data API v3 (영상)

worker 의 `video_channel` · `video_search` · `video_refresh` 잡이 쓰는 API 다. **메타데이터만** 가져온다 — 영상 파일·자막·썸네일 이미지는 받지 않는다.

`naver_news` 와 두 가지가 근본적으로 다르다. **쿼터가 유닛제이고 검색은 별도 버킷**이며, **데이터를 30일 넘게 보관할 수 없다.** 이 두 가지가 잡 설계 전체를 결정했다.

---

## 쿼터 — 버킷이 둘이다 ★

### `search.list` 는 하루 100회

2026-06-01 부터 `search.list` 와 `videos.insert` 가 **자체 쿼터 버킷**으로 분리됐다. 10,000 유닛이 남아 있어도 검색은 100회를 넘길 수 없다.

> "Projects that enable the YouTube Data API have a default quota allocation of 100 `search.list` calls, 100 `videos.insert` calls, and 10,000 units per day combined for all other endpoints."

`maxResults` 는 최대 50이므로 이론상 하루 5,000건이 검색 상한이다.

### 나머지는 공통 10,000 유닛

| 메서드 | 비용 |
|---|---|
| `videos.list` | 1 unit — **`id` 에 50개를 콤마로 묶어 1 unit** |
| `channels.list` | 1 unit — 채널 50개를 묶어 1 unit |
| `playlistItems.list` | 1 unit |

> "Every API request, even if invalid, will cost at least one quota point."

### 우리 소비량

```
video_channel  channels.list 1 + playlistItems.list 2(채널수) = 3 units/회 × 4회 = 12
video_search   search.list 4 calls/회 × 6회 = 24 calls / 100
video_refresh  재고 600건 ÷ 25일 ÷ 50 = 1 unit/일
────────────────────────────────────────────────
약 20 units / 10,000 (0.2%) · search 24 / 100
```

**네이버(25,000회 중 0.2% 사용)와 여유의 성격이 다르다.** 유닛은 남아돌지만 검색 100회는 빠듯하다. 매시간 크론(4질의 × 24회 = 96 calls)은 429 백오프 한 번에 터진다.

### 쿼터 증설

`support.google.com/youtube/contact/yt_api_form` 에서 신청하되 **컴플라이언스 감사를 먼저 통과**해야 한다. 개인정보처리방침에 YouTube 관련 섹션·Google 개인정보처리방침 링크·삭제 정책이 보이는 스크린샷을 요구한다. 지금은 필요 없다.

---

## 2단계 조회가 필수다

**`search.list` 응답에는 영상 길이·조회수가 없다.** `id`·`snippet`(publishedAt, channelId, title, description, thumbnails, channelTitle)뿐이다.

```
1단계  search.list       → videoId 목록          (search 버킷 1 call)
2단계  videos.list        → duration, viewCount,   (1 unit / 50개)
       part=snippet,        madeForKids, embeddable,
       contentDetails,      privacyStatus
       statistics,status
```

`playlistItems.list` 도 마찬가지라 2단계가 필요하다. **DB 에 이미 있는 키를 먼저 제거하고 남은 것만 조회한다** — 이 단계가 없으면 6시간마다 같은 50건을 다시 부른다.

---

## 저장 기간 — 30일 ★

개발자 정책 III.E.4 가 비승인 데이터(API 키로 얻은 공개 메타데이터)에 대해 이렇게 정한다.

> "API Clients may temporarily store limited amounts of Non-Authorized Data for as long as is necessary for the purposes of the API Client but not longer than 30 calendar days."

승인 데이터에 대해서도 같은 취지다 (III.E.4.c).

> "...for no longer than 30 calendar days. After 30 calendar days, the API Client must either **delete or refresh** the stored data."

무기한 저장이 명시적으로 허용된 것은 **Analytics/Reporting 데이터와 통계(조회수 등)** 뿐이다 (III.E.4.b).

### 우리 대응

`refreshed_dttm` 이 시계다. `video_refresh` 잡이 **25일**마다 `videos.list` 로 재조회해 갱신하고, **30일**을 넘긴 행은 API 성공 여부와 무관하게 삭제한다. 게시 후 **60일**이 지난 영상은 갱신하지 않고 그냥 지운다.

**하드 만료 삭제가 API 키 검사보다 먼저 실행된다.** 갱신에 성공해야만 삭제된다면 API 장애가 곧 정책 위반이 되기 때문이다. 순서가 정책 준수를 구조로 보장한다.

---

## 그 밖의 의무

| 조항 | 내용 | 우리 대응 |
|---|---|---|
| III.E.4.10 | 임베드하는 영상마다 `status.madeForKids` 조회 의무 | `made_for_kids_cd` 컬럼. `no` 만 표시 |
| III.F.2 | **썸네일 포함** YouTube 콘텐츠 표시 시 브랜드 표시 의무 | 홈 카드까지 전부 로고/링크 |
| III.E.6 | 스크래핑 금지 | RSS·HEAD 판별 기법을 쓰지 않는 근거 |
| III.G.1.c | 플레이어 **위·안** 광고 금지 | 겹치지 않게 배치. 하단은 해당 없음 |
| III.G.1.d | API 데이터 페이지의 광고는 "독립적 가치" 요건 | 전용 페이지에 회차 데이터를 함께 둔다 |
| RMF | 최소 200×200px, 자동재생 금지, 오버레이 금지 | 프론트 계약 |

III.F.2 원문:

> "Any API Client page or feature that displays YouTube content – including, without limitation, search results, YouTube videos, channels, playlists, **thumbnails**, and YouTube players – must make clear to the viewer that YouTube is the source..."

III.G.1.d 원문(광고 판단의 핵심):

> "sell advertising... on any page or screen that contains YouTube API Data **unless** other data, content, or material not obtained from YouTube appears on the same page and offers **enough independent value** to justify such sales **if the YouTube API Data were removed**"

판단 기준은 "그 페이지에서 영상 목록을 지웠을 때 남는 것만으로 광고를 붙일 만한가"다. 회차 당첨번호·통계는 우리가 수집한 우리 자산이므로 걷어내도 남는다.

---

## 쇼츠를 판별할 수 없다 ★

공식 API 필드가 **없다.** Video 리소스에 `isShort` 같은 것이 없고, Google 이 지원 계획을 밝힌 적도 없다.

공식 정의는 이렇다 (2024-10-15 이후 업로드 기준).

- 정사각형 또는 **세로 화면비**
- **3분 이하**
- 해당 기준일 이후 업로드

**Data API 는 원본 화면비를 주지 않는다.** `snippet.thumbnails` 의 width/height 는 정규화된 값이라 근거가 못 된다. 그래서 재생시간과 게시일만으로 추정하고, **3분 이하 가로 영상이 쇼츠로 오분류된다.** 로또 도메인에서 "90초짜리 당첨번호 요약 가로 영상"은 드물지 않다.

`search.list` 의 `videoDuration=short` 는 **4분 미만**이라 쇼츠(3분)와 1:1 대응하지 않는다.

### 검토했으나 쓰지 않기로 한 방법 둘

**1. `/shorts/{id}` HTTP 리다이렉트 확인** — 200이면 쇼츠, 303이면 롱폼. 널리 쓰이지만 **비공식이고 예고 없이 깨진다.** 무엇보다 youtube.com 에 직접 요청해 API 가 주지 않는 정보를 얻는 행위라 **III.E.6 스크래핑 금지의 회색지대**다. 30일 정책과 `madeForKids` 의무를 성실히 지키는 설계가 여기서 회색지대를 쓰면 정책 준수 주장 전체가 약해진다.

**2. oEmbed 의 width/height** — 플레이어 크기이지 원본 화면비가 아니다. 무의미하다.

**이 두 판단을 여기 남기는 것은 나중에 같은 제안이 다시 나왔을 때 답이 있어야 하기 때문이다.**

---

## 채널 RSS 를 쓰지 않는다

`https://www.youtube.com/feeds/videos.xml?channel_id=UC...` 는 **동작한다.** 2026-08-27 에 18개 채널로 실측했다.

| | |
|---|---|
| 인증 | 불필요 |
| 쿼터 | **소모 없음** |
| 반환 | 최신 15~20건 (채널마다 다름). 페이징 없음 |
| 포함 | videoId, 제목, 설명, 썸네일, 게시일, 채널명, **조회수** |
| **미포함** | **영상 길이** |
| 쇼츠 | **`link/@href` 가 `/shorts/` 인지 `/watch?v=` 인지로 구분 가능** |

**쿼터를 안 쓰고 쇼츠까지 알려주는데도 쓰지 않는다.** 이유 넷.

1. **미문서화 기능이다.** 공식 개발자 문서에 없다. 이 프로젝트는 이미 `dhlottery` 공식 API 차단을 겪고 위젯 파싱으로 우회한 이력이 있다([[dhlottery-blocked]]) — 그 비용을 아는 쪽이 두 번째로 같은 선택을 하지 않는다
2. **약관 적용 여부가 불명확하다.** 미문서화라 III.E.4(30일)·III.E.6(스크래핑)이 이 피드에 적용되는지 판단할 근거가 없다
3. **영상 길이를 안 준다.** 어차피 `videos.list` 2단계가 필요해, RSS 가 아끼는 것은 채널당 1 unit 뿐이다
4. **최신 15~20건 상한에 페이징이 없다.** `playlistItems.list` 는 `maxResults=50` + `pageToken` 이라 초기 백필이 된다

같은 이유로 `UC…`→`UU…` 업로드 플레이리스트 ID 치환도 쓰지 않는다 — 관례일 뿐 문서화된 규칙이 아니다. `channels.list?part=contentDetails` 의 `relatedPlaylists.uploads` 가 공식 경로다.

> **재검토 조건**: 쇼츠 오분류율이 30% 를 넘으면 RSS 의 `/shorts/` 링크를 **보조 신호로만** 쓰는 안을 다시 검토한다. 그때는 이 문서에 판단을 기록하고 결정한다.

---

## 금지 표현 3중 방어 — 실측 (2026-08-28)

수집 단계에서 세 겹으로 거른다. 실제 채널 조사에서 나온 제목 10건으로 검증했다.

| 방어선 | 무엇을 잡는가 | 실측 |
|---|---|---|
| 1. 채널 차단 | 예상번호 채널 자체 | **4건** |
| 2. 규칙 제외어 | 목록에 있는 낱말 | **1건** |
| 3. LLM 보조(`gpt-5-nano`) | 목록에 없는 표현 | **1건** |
| | | **10/10 정확** |

**각 층이 실제로 다른 것을 잡는다.**

- 채널 차단이 가장 많이 잡는다 — 예상번호는 채널 단위 성격이라 당연하다
- 규칙이 잡은 것: `1239회 필출 2수 가지치기 공개` (`필출` 이 목록에 있다)
- **LLM 만 잡은 것**: `이번주 로또 1등 예상 조합 5게임 공개` — 미상 채널이고 "예상 조합" 은 제외어 목록에 없다. 규칙만으로는 통과했을 제목이다

### 채널 차단이 없을 때의 한계

채널 차단을 빼고 규칙+LLM 만으로 같은 제목들을 판정했더니 **13건 중 11건**이었다. 놓친 둘은 이랬다.

```
1238회 참고로보는 조합결과              ← 로또더신
📜로또-1239회차📜최종분석 총 정리 편      ← 일억선생
```

둘 다 **제목만으로는 예상번호인지 회차 리뷰인지 판별되지 않는다.** 프롬프트가 "애매하면 통과" 를 지시하므로 모델이 지시대로 한 것이고, 그 방향이 옳다 — 애매한 것을 차단하면 정상 영상이 사라진다.

**이것이 채널 차단 목록을 함께 유지해야 하는 이유다.** LLM 은 규칙의 사각지대를 메우지만 채널 차단을 대체하지 못한다. 세 층을 다 두는 근거가 실측으로 확인됐다.

### 비용

`gpt-5-nano` 입력 $0.05/1M · 출력 $0.40/1M. 하루 판정 대상 5~15건(검색 유래만)을 20건씩 묶어 호출하면 **월 $0.006** 수준이다. 하루 100건으로 늘어도 월 $0.032 다. 비용은 판단 요소가 아니다.

**Batch API 의 50% 할인은 쓰지 않는다** — 24시간 비동기 완료 방식이라 수집 잡의 즉시 판정과 맞지 않는다.

---

## 확인된 사실

### 인증

**`X-goog-api-key` 헤더로 보낸다.** `?key=` 쿼리스트링이 표준 안내지만 쓰지 않는다 — httpx 예외 메시지에 request URL 이 실려 `collect_job_log.error_desc` 에 API 키가 평문으로 남는다. [[env-vars]] 의 함정 절 참조.

OAuth 는 필요 없다. `search.list`·`videos.list`·`channels.list`·`playlistItems.list` 는 전부 공개 데이터 조회라 API 키만으로 된다.

> "In some cases, `list` methods support both authorized and unauthorized requests, where unauthorized requests only retrieve public data."

### 엔드포인트

```
GET https://www.googleapis.com/youtube/v3/search
    ?part=snippet&type=video&q=...&order=date&maxResults=50
    &regionCode=KR&relevanceLanguage=ko&publishedAfter=...&videoEmbeddable=true

GET https://www.googleapis.com/youtube/v3/videos
    ?part=snippet,contentDetails,statistics,status&id=<최대 50개 콤마>

GET https://www.googleapis.com/youtube/v3/channels
    ?part=contentDetails,snippet&id=<최대 50개 콤마>

GET https://www.googleapis.com/youtube/v3/playlistItems
    ?part=contentDetails&playlistId=<uploads>&maxResults=50
```

`channels.list` 에는 `forHandle` 파라미터가 있어 `@donghanglottery` 같은 핸들로도 조회된다. 필터는 정확히 하나만 지정할 수 있다.

### 애플리케이션 등록 절차

1. `console.cloud.google.com` 에서 프로젝트 생성
2. **YouTube Data API v3** 활성화
3. 사용자 인증 정보 → API 키 생성
4. **키에 "API 제한"을 걸어 YouTube Data API v3 만 허용한다.** IP 제한은 걸지 않는다 — 서버 IP 가 바뀌면 조용히 403 이 된다
5. `worker/.env_worker` 의 `YOUTUBE_API_KEY` 에 넣는다

### 응답 필드와 저장 정책

저장하는 것: 영상 ID·채널 ID·채널명·제목·설명 앞부분(300자)·썸네일 URL·게시일시·재생시간·조회수·`madeForKids`·`embeddable`·`privacyStatus`.

저장하지 않는 것: **영상 파일·자막·썸네일 이미지 파일·설명 전문.**

### 403 은 두 의미다

`error.errors[].reason` 으로 가른다. 둘 다 즉시 포기하되 **메시지가 달라야 사람이 대응할 수 있다.**

| reason | 뜻 | 대응 |
|---|---|---|
| `quotaExceeded` | 그날 쿼터 소진 | 백오프 무의미. 다음날까지 회복 불가 |
| `keyInvalid` · `accessNotConfigured` | 키 문제 | 영구. 사람이 고쳐야 한다 |

429·5xx 는 지수 백오프 재시도. 그 밖의 4xx 는 즉시 포기.

---

## 자막을 받지 않는다

`captions.download` 는 **영상 소유자의 OAuth 인증**을 요구한다. 남의 영상 자막은 API 로 받을 수 없다.

비공식 라이브러리(`youtube-transcript-api` 등)는 유튜브 내부 자막 엔드포인트를 긁으므로 **III.E.6 에 정면으로 걸린다.** 쇼츠 HEAD 판별이 "회색지대"라면 이쪽은 명백한 쪽이다 — API 가 인증으로 막아둔 데이터를 우회하는 것이다.

저작권 문제도 있다. 자막은 영상 저작물의 일부이고, [[naver-search-api]] 에서 기사 **원문**을 저장하지 않기로 한 것과 같은 논리가 적용된다. 게다가 자막 요약을 잘 만들수록 사용자가 영상을 보지 않게 되어 조회수를 뺏는 구조가 된다.

> **확인 불가**: `captions.download` 의 소유자 인증 요건은 이 문서 작성 시점에 원문을 직접 확인하지 않았다. 이 방향을 검토하게 되면 공식 문서를 먼저 확인한다.

---

## 남은 미확인 (사람이 직접 확인해야 함)

전부 **잡을 막지는 않지만** 공개 전에 확인한다.

- **"video ID 는 30일 제한 예외" 라는 통설의 근거 조항.** 개발자 정책 원문에서 찾지 못했다. 명시된 예외는 Analytics/Reporting 데이터와 통계(조회수)뿐이다. 우리 설계는 예외를 가정하지 않고 전 컬럼을 갱신 대상으로 두므로 **더 보수적인 쪽**이다
- **"갱신(refresh)"의 정확한 정의.** "재조회해 값을 덮으면 30일이 다시 시작한다"가 우리 해석인데, 그러면 무제한 보관이 되어 정책 취지와 어긋날 소지가 있다. `YOUTUBE_RETAIN_DAYS=60` 이 이 논쟁을 실질적으로 무력화한다 — 대부분의 행이 60일 안에 사라진다
- **`search.list` 의 유닛 단가 숫자.** 버킷 분리와 하루 100회는 공식 페이지 3곳에서 교차 확인했으나 단가 표기는 확정하지 못했다. 우리 설계는 호출 수로 관리하므로 영향 없다
- **쿼터 리셋 시각.** 공식 문서에 명시 문장이 없다. 태평양시 자정이라는 것이 통설이다. Cloud Console 에서 확인
- **"enough independent value" 의 판단 기준.** 정량 기준이 없고 YouTube 재량이다. 사전 확인 절차도 없다
- **애드센스가 III.G.1.d 의 "sell advertising" 에 해당하는지.** 문언상 불명확하다. 다만 III.G.2 가 "ad-enabled API Clients" 를 명시적으로 허용하므로 광고 자체가 금지가 아닌 것은 분명하다
- **브랜딩 로고 최소 크기·여백 수치.** 별도 브랜드 사이트를 참조해야 한다

---

## 관련 문서

[[worker-jobs]] · [[db-schema]] · [[env-vars]] · [[forbidden-expressions]] · [[naver-search-api]] · [[dhlottery-blocked]]
