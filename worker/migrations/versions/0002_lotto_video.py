"""lotto_video — 복권 관련 유튜브 영상 메타데이터

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-28

이 리비전의 DDL 은 worker/scripts/ddl/002_lotto_video.sql 을 **그대로 옮겨 적은 것**이다.
두 곳이 어긋나면 안 된다 — 어긋나는 순간 db-schema 계약이 깨진다.
(0001 과 같은 규약: op.create_table() 대신 op.execute(원시 SQL) 을 쓴다.
 --autogenerate 를 쓰지 않는다.)

★ 적용 후 반드시 확인할 것 — db-schema.md 의 "새 테이블이 생기면 백엔드가 죽는다":

    SELECT pg_get_userbyid(defaclrole), defaclobjtype, defaclacl FROM pg_default_acl;

`ALTER DEFAULT PRIVILEGES FOR ROLE app_writer` 가 걸려 있지 않으면 백엔드가
이 테이블을 조회하는 순간 42501(permission denied)로 500 을 뱉는다. 개발 환경에서는
슈퍼유저로 접속해 재현되지 않는다.

계약: docs/wiki/10-contracts/db-schema.md
"""
from __future__ import annotations

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        """
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
        )
        """
    )
    op.execute("COMMENT ON TABLE  lotto_video                      IS '복권 관련 유튜브 영상 메타데이터(30일 갱신 의무 대상)'")
    op.execute("COMMENT ON COLUMN lotto_video.video_id             IS '영상 대리키'")
    op.execute("COMMENT ON COLUMN lotto_video.provider_nm          IS '영상 제공처(예약어 source 대체, 기본 youtube)'")
    op.execute("COMMENT ON COLUMN lotto_video.provider_video_key   IS '제공처가 발급한 영상 식별자(YouTube 는 11자 문자열). _id 는 대리키 전용이라 _key 접미어를 쓴다'")
    op.execute("COMMENT ON COLUMN lotto_video.provider_channel_key IS '제공처가 발급한 채널 식별자(YouTube 는 UC 로 시작)'")
    op.execute("COMMENT ON COLUMN lotto_video.channel_nm           IS '채널명. 금지 표현 필터가 제목과 함께 검사하고, 채널 매각·개명 감시에도 쓴다'")
    op.execute("COMMENT ON COLUMN lotto_video.title_nm             IS '영상 제목(원문 그대로. 변조하지 않는다 — YouTube 정책 위반이다)'")
    op.execute("COMMENT ON COLUMN lotto_video.summary_desc         IS '영상 설명 앞부분(YOUTUBE_SUMMARY_MAX_LEN 자로 잘라 저장. 전문은 담지 않는다)'")
    op.execute("COMMENT ON COLUMN lotto_video.thumbnail_url        IS '썸네일 URL(핫링크 전용. 이미지 파일을 내려받아 자체 서버에 두지 않는다)'")
    op.execute("COMMENT ON COLUMN lotto_video.published_dttm       IS '영상 게시일시. 갱신 시에도 덮지 않는다 — 게시 시각은 변하지 않는다'")
    op.execute("COMMENT ON COLUMN lotto_video.duration_sec         IS '재생시간(초). ISO 8601 duration 파싱 결과. 실패 시 NULL'")
    op.execute("COMMENT ON COLUMN lotto_video.view_cnt             IS '조회수. 21억(int4 상한)을 넘을 수 있어 _cnt 이지만 bigint 다'")
    op.execute("COMMENT ON COLUMN lotto_video.shorts_estimate_cd   IS '쇼츠 추정(likely/unlikely/unknown). ★확정이 아니다 — 공식 판별 필드가 없고 원본 화면비를 얻을 수 없어 재생시간·게시일만으로 추정한다'")
    op.execute("COMMENT ON COLUMN lotto_video.shorts_basis_desc    IS '쇼츠 추정 근거. 판정 규칙이 바뀌었을 때 기존 행이 어떤 규칙으로 매겨졌는지 알기 위해 남긴다'")
    op.execute("COMMENT ON COLUMN lotto_video.made_for_kids_cd     IS '아동용 표시 여부(yes/no/unknown). 정책 III.E.4.10 조회 의무. no 인 영상만 표시한다'")
    op.execute("COMMENT ON COLUMN lotto_video.embeddable_cd        IS '임베드 허용 여부(yes/no/unknown). no 면 화면에 깨진 플레이어가 뜬다'")
    op.execute("COMMENT ON COLUMN lotto_video.privacy_status_cd    IS '공개 상태(public/unlisted/private/unknown). public 만 표시한다'")
    op.execute("COMMENT ON COLUMN lotto_video.discovery_cd         IS '최초 발견 경로(channel=화이트리스트, search=검색 보조). 검색 유래는 신뢰도가 낮아 표시 우선순위를 낮춘다. 검색으로 먼저 발견된 뒤 화이트리스트 채널로 확인되면 channel 로 승격한다'")
    op.execute("COMMENT ON COLUMN lotto_video.round_no             IS '제목에서 파싱한 회차. ★FK 를 걸지 않는다 — 추첨 전 회차를 예고하는 영상이 있고, 연금복권 330회와 로또 330회는 다른 것이라 번호만으로 참조 대상이 정해지지 않는다'")
    op.execute("COMMENT ON COLUMN lotto_video.game_cd              IS '회차가 어느 게임의 것인지(lotto/pension/unknown). round_no 는 이 값과 짝을 이뤄야만 의미가 있다'")
    op.execute("COMMENT ON COLUMN lotto_video.keyword_list         IS '제목에서 실제로 매칭된 검색어 목록'")
    op.execute("COMMENT ON COLUMN lotto_video.collected_dttm       IS '최초 수집일시'")
    op.execute("COMMENT ON COLUMN lotto_video.refreshed_dttm       IS '마지막으로 videos.list 로 확인·갱신한 일시. ★30일 정책의 시계다. 값이 하나도 안 바뀌어도 확인만 하면 갱신한다'")
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_lotto_video_published_dttm
            ON lotto_video (published_dttm DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_lotto_video_refreshed_dttm
            ON lotto_video (refreshed_dttm)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_lotto_video_shorts_published
            ON lotto_video (shorts_estimate_cd, published_dttm DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_lotto_video_game_round
            ON lotto_video (game_cd, round_no)
            WHERE round_no IS NOT NULL
        """
    )


def downgrade() -> None:
    # 인덱스를 먼저 내리고 테이블을 지운다. FK 가 없어 의존 순서 문제는 없다.
    op.execute("DROP INDEX IF EXISTS ix_lotto_video_game_round")
    op.execute("DROP INDEX IF EXISTS ix_lotto_video_shorts_published")
    op.execute("DROP INDEX IF EXISTS ix_lotto_video_refreshed_dttm")
    op.execute("DROP INDEX IF EXISTS ix_lotto_video_published_dttm")
    op.execute("DROP TABLE IF EXISTS lotto_video")
