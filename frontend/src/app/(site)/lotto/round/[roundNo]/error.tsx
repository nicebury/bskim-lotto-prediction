'use client'

import Link from 'next/link'

/**
 * 회차 상세를 그리다 실패했을 때의 화면.
 *
 * ── 왜 있어야 하나 ──────────────────────────────────────────────────
 * 이 라우트는 백엔드 장애를 **삼키지 않고 던진다**(`BackendUnavailableError`).
 * 장애와 "그런 회차 없음" 을 구분하지 못하면 장애 중에 만들어진 404 가 ISR 캐시에
 * 일주일 남아, 백엔드가 살아난 뒤에도 그 회차가 계속 없는 페이지가 된다
 * (2026-08-28 에 500회에서 실제로 겪었다).
 *
 * 던지면 **그 렌더는 캐시되지 않고** 다음 요청에 다시 만들어진다. 실측으로 확인했다:
 * 백엔드를 끄고 800회를 요청하면 500, 백엔드를 켜고 같은 회차를 다시 요청하면 200 이다.
 * 종전에는 404 가 일주일 굳었다.
 *
 * ── ⚠ 이 화면이 나오지 않는 경우가 있다 ────────────────────────────
 * **아직 만들어지지 않은 회차를 요청 시 생성하다가 실패하면**(`dynamicParams` 경로)
 * Next 는 이 경계를 태우지 않고 자체 500 페이지를 낸다(실측). 이 파일이 잡는 것은
 * **이미 만들어진 페이지**를 그리다 난 오류다. 캐시를 막는 목적은 두 경우 모두 이루어지므로
 * 그대로 둔다 — 화면이 밋밋한 것과 404 가 굳는 것 중 후자가 훨씬 비싸다.
 *
 * ⚠ 사용자에게 원인을 묻지 않는다. 잘못한 것이 없으므로 사과도 하지 않는다. 지금 무슨
 *   일이 일어났고 무엇을 하면 되는지만 말한다.
 * ⚠ `error.message` 를 화면에 내지 않는다. 내부 URL 과 예외 문구가 그대로 노출된다.
 */
export default function RoundError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container">
      <section className="section">
        <h1>회차 정보를 불러오지 못했습니다</h1>
        <p className="muted" style={{ marginTop: 'var(--space-3)' }}>
          잠시 문제가 있어 이 회차의 당첨번호를 가져오지 못했습니다. 회차가 없는 것이 아니라
          정보를 가져오는 데 실패한 것이니, 잠시 뒤 다시 시도해 주세요.
        </p>

        <div className="hero-cta" style={{ marginTop: 'var(--space-5)' }}>
          {/* 페이지를 새로 그린다. 새로고침보다 빠르고 스크롤 위치도 지킨다. */}
          <button type="button" className="btn btn-primary" onClick={reset}>
            다시 시도
          </button>
          <Link className="btn btn-secondary" href="/lotto/latest">
            최신 회차 보기
          </Link>
          <Link className="btn btn-secondary" href="/">
            홈으로
          </Link>
        </div>
      </section>
    </div>
  )
}
