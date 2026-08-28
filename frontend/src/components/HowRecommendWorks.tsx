'use client'

import { useState } from 'react'

import { LottoBall } from './LottoBall'
import { Modal } from './Modal'

/**
 * "오늘의 추천 번호" 제목 옆의 설명 버튼과 그 대화상자.
 *
 * 왜 필요한가: 카드에 "완전 랜덤" 이라 써 놓고 그 아래에 `홀짝 1:5 · 합계 153` 을 붙이면,
 * 랜덤이 그 값을 **맞추려고** 뽑은 것처럼 읽힌다. 실제로는 뽑은 뒤에 센 값이다.
 * 실제 사용자가 이 오해를 했고, 그래서 이 설명을 만들었다.
 *
 * 아이콘 버튼(ⓘ)이 아니라 **글자가 보이는 버튼**이다. 아이콘만 있으면 눌러 볼 이유가
 * 생기지 않는다 — 무엇이 열리는지 알려 주어야 누른다.
 *
 * ★ 문체는 **친절체**다(002 R11). 정직함(완전 랜덤을 맨 앞에 둔 이유, 통계 조합과 랜덤이
 *   결과적으로 구분되지 않는다는 사실)은 유지하되, "없습니다"·"유일한 정직함"·"감추지 않는"
 *   같은 단정적·훈계조를 쓰지 않는다. 40대+ 사용자가 "가르치려 든다"·"무섭다" 고 느끼지
 *   않게 "함께 즐기는 도구" 의 어조로 쓴다. 다만 면책의 핵심(당첨을 보장하지 않는다)은
 *   부드럽게라도 반드시 남긴다. 긴 문단을 만들지 않는다 — 대화상자는 훑어보는 곳이다.
 */
export function HowRecommendWorks() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className="explain-btn" onClick={() => setOpen(true)}>
        <span className="explain-caret" aria-hidden="true">
          ▸
        </span>
        {/*
          이모지(🤔)를 쓰지 않는다. OS·폰트마다 모양과 색이 달라 브랜드 색을 따르지 못한다
          (홈 6타일에서 이모지를 뺀 것과 같은 이유). currentColor 를 쓰는 SVG 로 그린다.
        */}
        <span className="explain-mark" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm.1 14.2a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7Zm.2-11c2.5 0 4.2 1.5 4.2 3.6 0 1.5-.7 2.4-2 3.2-1 .6-1.3 1-1.3 1.8v.3a1.2 1.2 0 0 1-2.4 0v-.5c0-1.6.7-2.5 2-3.3.9-.6 1.2-1 1.2-1.6 0-.8-.7-1.4-1.8-1.4-1 0-1.7.5-1.9 1.4a1.2 1.2 0 0 1-2.3-.5c.4-2 2-3 4.3-3Z" />
          </svg>
        </span>
        5가지 방식이란?
        <span className="explain-sub">(전략 설명)</span>
      </button>

      {open && (
        // 배경을 눌러도 닫히지 않는다. 닫기 버튼(또는 Esc)으로만 닫는다.
        <Modal
          title="추천 번호는 어떻게 만들어지나요?"
          onClose={() => setOpen(false)}
          dismissible={false}
        >
          <div className="explain">
            <p className="explain-lead">
              카드마다 번호를 고르는 <strong>방법</strong>이 조금씩 달라요. 다섯 가지를 나란히
              놓아 비교해 보실 수 있게 했어요.
            </p>

            <ul className="explain-ways">
              {WAYS.map((way) => (
                <li key={way.name} data-accent={way.accent}>
                  <span className="explain-way-dot" aria-hidden="true" />
                  <div>
                    <strong>{way.name}</strong>
                    <span>{way.desc}</span>
                  </div>
                </li>
              ))}
            </ul>

            <section className="explain-block">
              <h3>번호 아래 숫자는 무슨 뜻인가요?</h3>
              <p>
                <strong>번호를 다 뽑은 다음에 세어 본 결과</strong>예요. 뽑기 전에 정해둔 조건이
                아니랍니다.
              </p>

              {/* 말로 설명하는 대신 실제로 세어 보인다. 한 번 보면 더 설명할 것이 없다. */}
              <figure className="explain-demo">
                <div className="explain-demo-balls">
                  {EXAMPLE.map((n) => (
                    <span key={n} className={n % 2 === 1 ? 'is-odd' : 'is-even'}>
                      <LottoBall number={n} size="sm" />
                      <em>{n % 2 === 1 ? '홀' : '짝'}</em>
                    </span>
                  ))}
                </div>
                <figcaption>
                  홀수 <b>4개</b>, 짝수 <b>2개</b> → 그래서 <code>홀짝 4:2</code>
                </figcaption>
              </figure>

              <p>
                랜덤이 이 비율을 맞추려고 뽑은 게 아니라, 뽑고 나서 세어 보니 그랬던 거예요.
                그래서 <strong>다시 생성을 누를 때마다 이 숫자는 달라진답니다.</strong>
              </p>
            </section>

            <section className="explain-block">
              <h3>어떤 방식이 더 잘 맞을까요?</h3>

              <p className="explain-answer">사실 다 비슷해요.</p>

              <p>
                로또는 45개 중 6개를 무작위로 뽑습니다. 나올 수 있는 조합은{' '}
                <b>8,145,060가지</b>인데, 그 하나하나가 뽑힐 가능성은 모두 똑같아요.
              </p>
              <p>
                어떤 번호가 지난주에 나왔든, 오랫동안 안 나왔든 이번 주에는 차이가 없답니다.
              </p>

              <div className="explain-callout">
                <p>
                  그래서 <strong>완전 랜덤을 맨 앞에 두었어요.</strong>
                </p>
                <p>
                  통계를 참고한 조합이든 그냥 무작위로 뽑은 조합이든, 결과는 크게 다르지 않아요.
                  방식을 여러 개 둔 건 맞히기 위해서가 아니라, 번호를 고르는 재미를 조금 더
                  다양하게 즐기시라는 뜻이에요.
                </p>
              </div>
            </section>

            <p className="explain-foot">
              번호를 고르는 일을 조금 더 수월하게 만들기 위한 기능이에요. 당첨을 보장하지는
              않는다는 점만 기억해 주세요.
            </p>
          </div>
        </Modal>
      )}
    </>
  )
}

/** 홀짝을 세어 보이는 예시. 홀 4 · 짝 2 가 되도록 고른 숫자다. */
const EXAMPLE = [3, 12, 19, 27, 33, 41]

/** 캐러셀 5장과 같은 순서. `accent` 는 --svc-* 토큰 접미어다. */
const WAYS = [
  {
    accent: 'lotto',
    name: '완전 랜덤',
    desc: '1번부터 45번까지 아무 조건 없이 6개를 뽑습니다. 실제 추첨과 같습니다.',
  },
  {
    accent: 'stats',
    name: '통계 종합',
    desc: '자주 나온 번호와 오래 안 나온 번호를 참고해 뽑힐 가능성을 조금씩 다르게 줍니다.',
  },
  {
    accent: 'reco',
    name: '번호대 균형',
    desc: '1~15, 16~30, 31~45에서 두 개씩 골라 한쪽에 몰리지 않게 합니다.',
  },
  {
    accent: 'dream',
    name: '홀짝·고저 균형',
    desc: '홀수 3개 짝수 3개처럼, 과거에 자주 보였던 모양을 찾아 만듭니다.',
  },
  {
    accent: 'news',
    name: '안 나오던 번호 되짚기',
    desc: '오랫동안 안 나오다가 최근에 다시 나온 번호를 먼저 넣습니다.',
  },
] as const
