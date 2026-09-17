"""video_* 잡의 순수 함수 검증.

**API 를 부르지 않는다.** 쿼터를 한 유닛도 쓰지 않고 파이프라인 로직의
대부분을 검증한다 — 필터가 과잉 차단하는지, 회차 파싱이 게임을 헷갈리는지,
쇼츠 추정이 규칙대로 도는지.

pytest 대신 표준 unittest 를 쓰는 이유: 워커의 의존성 목록을 늘리지 않기
위해서다(CLAUDE.md). 실행은 `uv run python -m unittest discover -s tests`.
"""
from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from worker.jobs import video_common as vc
from worker.sources import llm_judge, youtube_data

KST = ZoneInfo("Asia/Seoul")


class TestParseDuration(unittest.TestCase):
    def test_basic(self):
        cases = {
            "PT1M30S": 90,
            "PT2H": 7200,
            "PT0S": 0,
            "P1DT2H3M4S": 93784,
            "PT45S": 45,
            "PT3M": 180,
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(youtube_data.parse_iso8601_duration(raw), expected)

    def test_invalid_is_none(self):
        """파싱 실패는 None 이다. 영상을 버리지 않고 쇼츠 추정만 unknown 이 된다."""
        for raw in ("", None, "garbage", "P1W", "1M30S"):
            with self.subTest(raw=raw):
                self.assertIsNone(youtube_data.parse_iso8601_duration(raw))


class TestOnTopic(unittest.TestCase):
    QUERIES = ["로또 추첨", "로또 당첨번호", "연금복권 추첨"]
    EXCLUDE = ["청약", "부동산"]

    def test_token_match(self):
        """질의가 '로또 추첨' 이어도 제목에 '로또' 만 있으면 통과한다.

        질의 전체를 요구하면 '로또 1238회 당첨번호' 같은 정상 제목이 죽는다.
        """
        self.assertTrue(
            vc.is_on_topic("로또 1238회 당첨번호", self.QUERIES, self.EXCLUDE, True)
        )

    def test_no_query_token_rejected(self):
        self.assertFalse(
            vc.is_on_topic("오늘의 요리 레시피", self.QUERIES, self.EXCLUDE, True)
        )

    def test_exclude_wins(self):
        """제목에 '로또' 가 있어도 제외어가 있으면 버린다(부동산 기사 패턴)."""
        self.assertFalse(
            vc.is_on_topic("로또 청약 당첨 후기", self.QUERIES, self.EXCLUDE, True)
        )

    def test_must_match_off(self):
        self.assertTrue(
            vc.is_on_topic("아무 제목", self.QUERIES, self.EXCLUDE, False)
        )


class TestForbidden(unittest.TestCase):
    FORBIDDEN = ["예상번호", "고확률", "필승", "고정수"]

    def test_hits(self):
        for title in ("1239회 로또 예상번호", "고확률 조합 공개", "이번주 필승 전략"):
            with self.subTest(title=title):
                self.assertTrue(vc.has_forbidden_expression(title, self.FORBIDDEN))

    def test_spacing_ignored(self):
        """유튜브 제목은 띄어쓰기가 제멋대로다. '예상 번호' 도 잡아야 한다."""
        self.assertTrue(vc.has_forbidden_expression("1239회 예상 번호", self.FORBIDDEN))

    def test_channel_name_checked(self):
        """채널명에만 금지 표현이 있어도 걸린다 — 호출자가 제목+채널명을 합쳐 넘긴다."""
        self.assertTrue(
            vc.has_forbidden_expression("1238회 결과 로또예상번호연구소", self.FORBIDDEN)
        )

    def test_clean_passes(self):
        self.assertFalse(
            vc.has_forbidden_expression("로또6/45 제1238회 당첨번호", self.FORBIDDEN)
        )

    def test_empty_list_disables(self):
        self.assertFalse(vc.has_forbidden_expression("예상번호", []))


class TestFresh(unittest.TestCase):
    TODAY = date(2026, 8, 28)

    def test_within_window(self):
        dt = datetime(2026, 8, 25, 12, 0, tzinfo=KST)
        self.assertTrue(vc.is_fresh(dt, self.TODAY, 7))

    def test_too_old(self):
        dt = datetime(2026, 8, 1, 12, 0, tzinfo=KST)
        self.assertFalse(vc.is_fresh(dt, self.TODAY, 7))

    def test_utc_converted_to_kst(self):
        """UTC 로 비교하면 KST 오전 9시 이전 게시분이 전날로 밀린다.

        2026-08-28 00:30 UTC = 2026-08-28 09:30 KST 다. 나이가 0이어야 한다.
        """
        dt = datetime(2026, 8, 28, 0, 30, tzinfo=timezone.utc)
        self.assertTrue(vc.is_fresh(dt, self.TODAY, 0))

    def test_future_rejected(self):
        """미래 날짜는 나이가 음수라 조건을 통과해 버린다. 명시적으로 막는다."""
        dt = datetime(2026, 9, 1, 12, 0, tzinfo=KST)
        self.assertFalse(vc.is_fresh(dt, self.TODAY, 7))

    def test_none_rejected(self):
        self.assertFalse(vc.is_fresh(None, self.TODAY, 7))


class TestEstimateShorts(unittest.TestCase):
    RECENT = datetime(2026, 8, 22, 21, 0, tzinfo=KST)
    OLD = datetime(2024, 1, 1, 12, 0, tzinfo=KST)

    def test_likely(self):
        cd, basis = vc.estimate_shorts(45, self.RECENT, 180)
        self.assertEqual(cd, "likely")
        self.assertIn("duration<=180s", basis)

    def test_unlikely(self):
        cd, _ = vc.estimate_shorts(600, self.RECENT, 180)
        self.assertEqual(cd, "unlikely")

    def test_boundary_is_likely(self):
        """3분 정확히는 쇼츠 정의에 포함된다(이하)."""
        cd, _ = vc.estimate_shorts(180, self.RECENT, 180)
        self.assertEqual(cd, "likely")

    def test_before_era_is_unknown(self):
        """2024-10-15 이전에는 쇼츠 기준이 60초였다. 3분 이하만으로는 알 수 없다."""
        cd, _ = vc.estimate_shorts(90, self.OLD, 180)
        self.assertEqual(cd, "unknown")

    def test_no_duration_is_unknown(self):
        cd, basis = vc.estimate_shorts(None, self.RECENT, 180)
        self.assertEqual(cd, "unknown")
        self.assertIn("파싱 실패", basis)


class TestParseRound(unittest.TestCase):
    def test_real_titles(self):
        """2026-08-27 RSS 실측 제목들."""
        cases = [
            ("로또6/45 제1238회 당첨번호 2026년 08월 22일", (1238, "lotto")),
            ("MBC 생방송 행복드림 로또 6/45 _ 1238회", (1238, "lotto")),
            ("[로또 1238회] 당첨 번호는?!", (1238, "lotto")),
            ("연금복권 제330회 당첨번호 2026년 08월 27일", (330, "pension")),
            ("[연금 329회] 당첨 번호는?!", (329, "pension")),
        ]
        for title, expected in cases:
            with self.subTest(title=title):
                self.assertEqual(vc.parse_round(title), expected)

    def test_game_word_absent_is_unknown(self):
        """게임 낱말이 없으면 회차를 담지 않는다.

        실측 제목이다 — 동행복권 채널의 "[#기부챌린지] 황금손의 기부 챌린지｜
        제1237회 배우 '오영실'". 사람은 동행복권 채널이니 로또 1237회라고 알지만
        **제목만으로는 알 수 없다.** 채널이나 회차 번호 범위(로또 1000번대,
        연금 300번대)로 추론할 수도 있으나 그러면 규칙이 시간에 종속된다 —
        연금복권이 1000회를 넘는 날 조용히 틀리기 시작한다.

        회차를 못 붙이면 그 영상은 관련 콘텐츠 블록이 생략될 뿐이다.
        틀린 회차를 붙이면 화면에 틀린 당첨번호가 뜬다. 후자가 훨씬 나쁘다.
        """
        self.assertEqual(
            vc.parse_round("[#기부챌린지] 황금손의 기부 챌린지｜제1237회 배우 '오영실'"),
            (None, "unknown"),
        )

    def test_both_games_is_unknown(self):
        """둘 다 있으면 회차를 담지 않는다.

        틀린 회차를 붙이는 것보다 안 붙이는 편이 낫다 — 연금복권 330회 영상에
        로또 330회 당첨번호가 붙으면 조용히 틀린 번호가 화면에 뜬다.
        """
        self.assertEqual(vc.parse_round("로또와 연금복권 제330회 비교"), (None, "unknown"))

    def test_no_game_word(self):
        self.assertEqual(vc.parse_round("제1238회 결과 발표"), (None, "unknown"))

    def test_game_without_round(self):
        """게임은 알지만 회차가 없으면 회차만 NULL 이다."""
        self.assertEqual(vc.parse_round("로또 판매점 방문기"), (None, "lotto"))

    def test_two_digit_not_matched(self):
        """2자리는 무시한다 — '6/45' 나 '10회 연속' 같은 숫자가 걸리지 않게."""
        self.assertEqual(vc.parse_round("로또 45회"), (None, "lotto"))


class TestIsDisplayable(unittest.TestCase):
    BASE = {
        "privacy_status_cd": "public",
        "embeddable_cd": "yes",
        "made_for_kids_cd": "no",
    }

    def test_ok(self):
        self.assertTrue(vc.is_displayable(dict(self.BASE)))

    def test_each_condition_blocks(self):
        for key, bad in (
            ("privacy_status_cd", "private"),
            ("embeddable_cd", "no"),
            ("made_for_kids_cd", "yes"),
        ):
            with self.subTest(key=key):
                item = dict(self.BASE, **{key: bad})
                self.assertFalse(vc.is_displayable(item))

    def test_unknown_blocks(self):
        """모르는 것은 통과시키지 않는다. 정책 III.E.4.10 의 조회 의무 때문이다."""
        for key in self.BASE:
            with self.subTest(key=key):
                self.assertFalse(vc.is_displayable(dict(self.BASE, **{key: "unknown"})))


class TestToStubs(unittest.TestCase):
    def test_search_shape(self):
        payload = [
            {
                "id": {"videoId": "abc12345678"},
                "snippet": {
                    "title": "로또 1238회 당첨번호",
                    "channelId": "UCtest",
                    "channelTitle": "테스트채널",
                    "publishedAt": "2026-08-22T12:00:00Z",
                },
            }
        ]
        out = youtube_data._to_stubs(payload, id_path=("id", "videoId"))
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["provider_video_key"], "abc12345678")
        self.assertEqual(out[0]["title_nm"], "로또 1238회 당첨번호")

    def test_playlist_shape(self):
        payload = [
            {
                "snippet": {
                    "title": "제목",
                    "channelId": "UCtest",
                    "resourceId": {"videoId": "xyz98765432"},
                    "publishedAt": "2026-08-22T12:00:00Z",
                }
            }
        ]
        out = youtube_data._to_stubs(
            payload, id_path=("snippet", "resourceId", "videoId")
        )
        self.assertEqual(out[0]["provider_video_key"], "xyz98765432")

    def test_deleted_video_skipped(self):
        """삭제된 영상이 플레이리스트에 남아 있으면 제목이 이렇게 온다."""
        payload = [
            {
                "snippet": {
                    "title": "Deleted video",
                    "resourceId": {"videoId": "aaa11111111"},
                    "publishedAt": "2026-08-22T12:00:00Z",
                }
            }
        ]
        out = youtube_data._to_stubs(
            payload, id_path=("snippet", "resourceId", "videoId")
        )
        self.assertEqual(out, [])


class TestToItems(unittest.TestCase):
    def _payload(self, **overrides):
        status = {"privacyStatus": "public", "embeddable": True, "madeForKids": False}
        status.update(overrides.pop("status", {}))
        return {
            "items": [
                {
                    "id": "abc12345678",
                    "snippet": {
                        "title": "로또 1238회 당첨번호",
                        "description": "설명" * 300,
                        "channelId": "UCtest",
                        "channelTitle": "테스트채널",
                        "publishedAt": "2026-08-22T12:00:00Z",
                        "thumbnails": {"high": {"url": "https://i.ytimg.com/x.jpg"}},
                    },
                    "contentDetails": {"duration": "PT1M30S"},
                    "statistics": {"viewCount": "7540"},
                    "status": status,
                }
            ]
        }

    def test_maps_to_columns(self):
        out = youtube_data._to_items(self._payload(), 300)
        self.assertEqual(len(out), 1)
        item = out[0]
        self.assertEqual(item["provider_video_key"], "abc12345678")
        self.assertEqual(item["duration_sec"], 90)
        self.assertEqual(item["view_cnt"], 7540)
        self.assertEqual(item["made_for_kids_cd"], "no")
        self.assertEqual(item["embeddable_cd"], "yes")
        self.assertEqual(item["privacy_status_cd"], "public")

    def test_summary_truncated(self):
        out = youtube_data._to_items(self._payload(), 300)
        self.assertEqual(len(out[0]["summary_desc"]), 300)

    def test_missing_status_is_unknown(self):
        """status 가 비면 unknown 이다. 'no' 로 뭉개면 조회 의무를 형식적으로만 지킨 것이 된다."""
        payload = self._payload()
        payload["items"][0]["status"] = {}
        out = youtube_data._to_items(payload, 300)
        self.assertEqual(out[0]["made_for_kids_cd"], "unknown")
        self.assertEqual(out[0]["embeddable_cd"], "unknown")

    def test_no_published_dropped(self):
        """published_dttm 은 NOT NULL 이고 신선도 판정의 근거다."""
        payload = self._payload()
        del payload["items"][0]["snippet"]["publishedAt"]
        self.assertEqual(youtube_data._to_items(payload, 300), [])


class TestClassify403(unittest.TestCase):
    def test_quota(self):
        payload = {"error": {"errors": [{"reason": "quotaExceeded"}]}}
        self.assertEqual(youtube_data._classify_403(payload), "quota")

    def test_key(self):
        payload = {"error": {"errors": [{"reason": "keyInvalid"}]}}
        self.assertEqual(youtube_data._classify_403(payload), "key")

    def test_garbage(self):
        self.assertEqual(youtube_data._classify_403({}), "unknown")


class TestLlmParseVerdicts(unittest.TestCase):
    # 2026-09-08: 뉴스·영상 공용이 되면서 키 이름이 provider_video_key → key 로
    # 바뀌었다. 호출자가 {"key", "title_nm", "source_nm"} 로 맞춰 넘긴다.
    CHUNK = [
        {"key": "k0", "title_nm": "a"},
        {"key": "k1", "title_nm": "b"},
    ]

    def _resp(self, content: str) -> dict:
        return {"choices": [{"message": {"content": content}}]}

    def test_blocked_extracted(self):
        out = llm_judge._parse_verdicts(
            self._resp('{"results":[{"i":0,"blocked":true},{"i":1,"blocked":false}]}'),
            self.CHUNK,
        )
        self.assertEqual(out, {"k0"})

    def test_broken_json_passes_all(self):
        """파싱 실패는 전건 통과다. 판정 실패가 대량 차단으로 이어지면 안 된다."""
        self.assertEqual(llm_judge._parse_verdicts(self._resp("설명입니다"), self.CHUNK), set())

    def test_missing_key_passes_all(self):
        self.assertEqual(llm_judge._parse_verdicts({}, self.CHUNK), set())

    def test_out_of_range_index_ignored(self):
        out = llm_judge._parse_verdicts(
            self._resp('{"results":[{"i":99,"blocked":true},{"i":0,"blocked":true}]}'),
            self.CHUNK,
        )
        self.assertEqual(out, {"k0"})

    def test_bad_row_does_not_kill_batch(self):
        out = llm_judge._parse_verdicts(
            self._resp('{"results":[{"nope":1},{"i":1,"blocked":true}]}'), self.CHUNK
        )
        self.assertEqual(out, {"k1"})


class TestEnrich(unittest.TestCase):
    def test_fills_classification(self):
        item = {
            "title_nm": "로또6/45 제1238회 당첨번호",
            "duration_sec": 45,
            "published_dttm": datetime(2026, 8, 22, 21, 0, tzinfo=KST),
        }
        out = vc.enrich(item, queries=["로또 당첨번호"], shorts_max_sec=180)
        self.assertEqual(out["shorts_estimate_cd"], "likely")
        self.assertEqual(out["round_no"], 1238)
        self.assertEqual(out["game_cd"], "lotto")
        self.assertIn("로또", out["keyword_list"])


if __name__ == "__main__":
    unittest.main()
