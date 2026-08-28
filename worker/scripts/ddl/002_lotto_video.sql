-- =============================================================================
-- 002 — lotto_video (복권 관련 유튜브 영상 메타데이터)
--
-- 이 파일은 **참조 원본(reference source)** 이다. 실제 스키마 적용의 정본은
-- worker/migrations/versions/0002_lotto_video.py 이며, 두 파일의 SQL 은
-- 한 글자씩 같아야 한다. 어긋나면 db-schema 계약이 깨진다.
--
-- 계약: docs/wiki/10-contracts/db-schema.md
--      docs/wiki/10-contracts/db-naming-standard.md  (_key · _sec 접미어)
--      docs/wiki/90-external/youtube-data-api.md     (30일 보관 정책)
-- =============================================================================

-- =============================================================================
-- lotto_video — 복권 관련 유튜브 영상
--   메타데이터만 담는다. 영상 파일·자막·썸네일 이미지는 저장하지 않는다
--   (lotto_news 가 기사 원문을 담지 않는 것과 같은 원칙).
--
--   ★ YouTube 개발자 정책 III.E.4: 비승인 데이터는 30일을 넘겨 저장할 수 없고
--     "삭제 또는 갱신"해야 한다. refreshed_dttm 이 그 시계이며 video_refresh 잡이
--     25일마다 갱신하고 30일을 넘긴 행은 무조건 삭제한다.
--
--   ★ link_url 컬럼을 두지 않는다. provider_video_key 에서 파생 가능하고,
--     파생값을 저장하면 두 곳이 어긋난다. 조립은 백엔드/프론트의 일이다.
-- =============================================================================
CREATE TABLE IF NOT EXISTS lotto_video (
    video_id                bigint      GENERATED ALWAYS AS IDENTITY,
    provider_nm             text        NOT NULL DEFAULT 'youtube',
    provider_video_key      text        NOT NULL,
    provider_channel_key    text        NOT NULL,
    channel_nm              text,
    title_nm                text        NOT NULL,
    summary_desc            text,
    thumbnail_url           text,
    published_dttm          timestamptz NOT NULL,
    duration_sec            integer,
    view_cnt                bigint,
    shorts_estimate_cd      text        NOT NULL DEFAULT 'unknown',
    shorts_basis_desc       text,
    made_for_kids_cd        text        NOT NULL DEFAULT 'unknown',
    embeddable_cd           text        NOT NULL DEFAULT 'unknown',
    privacy_status_cd       text        NOT NULL DEFAULT 'unknown',
    discovery_cd            text        NOT NULL,
    round_no                integer,
    game_cd                 text        NOT NULL DEFAULT 'unknown',
    keyword_list            text[],
    collected_dttm          timestamptz NOT NULL DEFAULT now(),
    refreshed_dttm          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_lotto_video PRIMARY KEY (video_id),

    -- provider 를 UNIQUE 에 포함한다. lotto_news 는 link_url 단독 UNIQUE 라
    -- 다른 소스가 붙으면 키 공간이 충돌할 여지가 있었다. 그 약점을 여기서 막는다.
    CONSTRAINT uk_lotto_video_provider_key
        UNIQUE (provider_nm, provider_video_key),

    -- 길이 11 을 CHECK 하지 않는다. 11자는 YouTube 의 현재 규칙일 뿐이고
    -- provider 가 늘면 달라진다. 형식 검증은 소스 클라이언트의 일이다.
    CONSTRAINT ck_lotto_video_provider_key
        CHECK (provider_video_key <> ''),

    -- ★ 'estimate' 는 이름이 아니라 경고다. 쇼츠를 판별하는 공식 API 필드가 없고
    --   (공식 정의는 세로/정사각 화면비 + 3분 이하 + 2024-10-15 이후 업로드인데
    --   Data API 는 원본 화면비를 주지 않는다) 재생시간·게시일만으로 추정한다.
    CONSTRAINT ck_lotto_video_shorts_estimate
        CHECK (shorts_estimate_cd IN ('likely', 'unlikely', 'unknown')),

    -- III.E.4.10: 임베드하는 영상마다 status.madeForKids 조회 의무가 있다.
    -- boolean 이 아니라 3-값인 이유: 조회 실패와 'false' 를 구분해야 한다.
    -- boolean NULL 로 두면 사람이 "false"와 "모름"을 헷갈린다.
    CONSTRAINT ck_lotto_video_made_for_kids
        CHECK (made_for_kids_cd IN ('yes', 'no', 'unknown')),

    CONSTRAINT ck_lotto_video_embeddable
        CHECK (embeddable_cd IN ('yes', 'no', 'unknown')),

    CONSTRAINT ck_lotto_video_privacy_status
        CHECK (privacy_status_cd IN ('public', 'unlisted', 'private', 'unknown')),

    CONSTRAINT ck_lotto_video_discovery
        CHECK (discovery_cd IN ('channel', 'search')),

    -- 로또 1238회와 연금복권 330회는 전혀 다른 것이다. round_no 는 이 값과
    -- 짝을 이뤄야만 의미가 있다. 백엔드는 game_cd='lotto' 일 때만 조인한다.
    CONSTRAINT ck_lotto_video_game
        CHECK (game_cd IN ('lotto', 'pension', 'unknown')),

    CONSTRAINT ck_lotto_video_round_no
        CHECK (round_no IS NULL OR round_no > 0),

    CONSTRAINT ck_lotto_video_duration_sec
        CHECK (duration_sec IS NULL OR duration_sec >= 0),

    CONSTRAINT ck_lotto_video_view_cnt
        CHECK (view_cnt IS NULL OR view_cnt >= 0)
);

COMMENT ON TABLE  lotto_video                      IS '복권 관련 유튜브 영상 메타데이터(30일 갱신 의무 대상)';
COMMENT ON COLUMN lotto_video.video_id             IS '영상 대리키';
COMMENT ON COLUMN lotto_video.provider_nm          IS '영상 제공처(예약어 source 대체, 기본 youtube)';
COMMENT ON COLUMN lotto_video.provider_video_key   IS '제공처가 발급한 영상 식별자(YouTube 는 11자 문자열). _id 는 대리키 전용이라 _key 접미어를 쓴다';
COMMENT ON COLUMN lotto_video.provider_channel_key IS '제공처가 발급한 채널 식별자(YouTube 는 UC 로 시작)';
COMMENT ON COLUMN lotto_video.channel_nm           IS '채널명. 금지 표현 필터가 제목과 함께 검사하고, 채널 매각·개명 감시에도 쓴다';
COMMENT ON COLUMN lotto_video.title_nm             IS '영상 제목(원문 그대로. 변조하지 않는다 — YouTube 정책 위반이다)';
COMMENT ON COLUMN lotto_video.summary_desc         IS '영상 설명 앞부분(YOUTUBE_SUMMARY_MAX_LEN 자로 잘라 저장. 전문은 담지 않는다)';
COMMENT ON COLUMN lotto_video.thumbnail_url        IS '썸네일 URL(핫링크 전용. 이미지 파일을 내려받아 자체 서버에 두지 않는다)';
COMMENT ON COLUMN lotto_video.published_dttm       IS '영상 게시일시. 갱신 시에도 덮지 않는다 — 게시 시각은 변하지 않는다';
COMMENT ON COLUMN lotto_video.duration_sec         IS '재생시간(초). ISO 8601 duration 파싱 결과. 실패 시 NULL';
COMMENT ON COLUMN lotto_video.view_cnt             IS '조회수. 21억(int4 상한)을 넘을 수 있어 _cnt 이지만 bigint 다';
COMMENT ON COLUMN lotto_video.shorts_estimate_cd   IS '쇼츠 추정(likely/unlikely/unknown). ★확정이 아니다 — 공식 판별 필드가 없고 원본 화면비를 얻을 수 없어 재생시간·게시일만으로 추정한다';
COMMENT ON COLUMN lotto_video.shorts_basis_desc    IS '쇼츠 추정 근거. 판정 규칙이 바뀌었을 때 기존 행이 어떤 규칙으로 매겨졌는지 알기 위해 남긴다';
COMMENT ON COLUMN lotto_video.made_for_kids_cd     IS '아동용 표시 여부(yes/no/unknown). 정책 III.E.4.10 조회 의무. no 인 영상만 표시한다';
COMMENT ON COLUMN lotto_video.embeddable_cd        IS '임베드 허용 여부(yes/no/unknown). no 면 화면에 깨진 플레이어가 뜬다';
COMMENT ON COLUMN lotto_video.privacy_status_cd    IS '공개 상태(public/unlisted/private/unknown). public 만 표시한다';
COMMENT ON COLUMN lotto_video.discovery_cd         IS '최초 발견 경로(channel=화이트리스트, search=검색 보조). 검색 유래는 신뢰도가 낮아 표시 우선순위를 낮춘다. 검색으로 먼저 발견된 뒤 화이트리스트 채널로 확인되면 channel 로 승격한다';
COMMENT ON COLUMN lotto_video.round_no             IS '제목에서 파싱한 회차. ★FK 를 걸지 않는다 — 추첨 전 회차를 예고하는 영상이 있고, 연금복권 330회와 로또 330회는 다른 것이라 번호만으로 참조 대상이 정해지지 않는다';
COMMENT ON COLUMN lotto_video.game_cd              IS '회차가 어느 게임의 것인지(lotto/pension/unknown). round_no 는 이 값과 짝을 이뤄야만 의미가 있다';
COMMENT ON COLUMN lotto_video.keyword_list         IS '제목에서 실제로 매칭된 검색어 목록';
COMMENT ON COLUMN lotto_video.collected_dttm       IS '최초 수집일시';
COMMENT ON COLUMN lotto_video.refreshed_dttm       IS '마지막으로 videos.list 로 확인·갱신한 일시. ★30일 정책의 시계다. 값이 하나도 안 바뀌어도 확인만 하면 갱신한다';

-- 최신순 목록(전용 페이지 기본 정렬)
CREATE INDEX IF NOT EXISTS ix_lotto_video_published_dttm
    ON lotto_video (published_dttm DESC);

-- 30일 갱신 대상 선정. ORDER BY refreshed_dttm LIMIT n 이 이 인덱스를 그대로 탄다
CREATE INDEX IF NOT EXISTS ix_lotto_video_refreshed_dttm
    ON lotto_video (refreshed_dttm);

-- 쇼츠/일반을 나눠 보여주므로 두 목록이 각각 인덱스를 타야 한다
CREATE INDEX IF NOT EXISTS ix_lotto_video_shorts_published
    ON lotto_video (shorts_estimate_cd, published_dttm DESC);

-- 회차별 영상 조회("이 회차의 다른 영상"). round_no 가 NULL 인 행이 많아 부분 인덱스다
CREATE INDEX IF NOT EXISTS ix_lotto_video_game_round
    ON lotto_video (game_cd, round_no)
    WHERE round_no IS NOT NULL;

-- =============================================================================
-- 롤백 (역순 DROP) — 필요 시 아래 블록의 주석을 해제해 실행한다.
-- =============================================================================
-- DROP INDEX IF EXISTS ix_lotto_video_game_round;
-- DROP INDEX IF EXISTS ix_lotto_video_shorts_published;
-- DROP INDEX IF EXISTS ix_lotto_video_refreshed_dttm;
-- DROP INDEX IF EXISTS ix_lotto_video_published_dttm;
-- DROP TABLE IF EXISTS lotto_video;
