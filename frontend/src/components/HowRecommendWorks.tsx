'use client'

import { useState } from 'react'

import { Modal } from './Modal'

/**
 * "오늘의 추천 번호" 제목 옆의 설명 버튼과 그 대화상자.
 *
 * 왜 필요한가: 카드에 "완전 랜덤" 이라 써 놓고 그 아래에 `홀짝 1:5 · 합계 153` 을 붙이면,
 * 랜덤이 그 값을 **맞추려고** 뽑은 것처럼 읽힌다. 실제로는 뽑은 뒤에 센 값이다.
 * 실제 사용자가 이 오해를 했고, 그래서 이 설명을 만들었다.
 *
 * 문체는 중학생이 한 번에 이해할 수 있는 수준으로 쓴다. 어려운 말을 쉬운 말로 바꾸는 것이
 * 아니라, 어려운 개념을 아예 꺼내지 않는다.
 */
export function HowRecommendWorks() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="info-btn"
        aria-label="추천 번호가 어떻게 만들어지는지 알아보기"
        onClick={() => setOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4.4a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Zm1.2 5.1v6.2a1.2 1.2 0 1 1-2.4 0v-6.2a1.2 1.2 0 1 1 2.4 0Z"
          />
        </svg>
      </button>

      {open && (
        // 배경을 눌러도 닫히지 않는다. 닫기 버튼(또는 Esc)으로만 닫는다.
        <Modal title="추천 번호는 어떻게 만들어지나요?" onClose={() => setOpen(false)} dismissible={false}>
          <div className="prose modal-prose">
            <p>
              카드마다 번호를 고르는 <strong>방법</strong>이 다릅니다. 다섯 가지를 나란히 놓아
              비교해 볼 수 있게 했습니다.
            </p>

            <ol className="how-steps">
              <li>
                <strong>완전 랜덤</strong>
                <span>1번부터 45번까지 아무 조건 없이 6개를 뽑습니다. 실제 추첨과 같습니다.</span>
              </li>
              <li>
                <strong>통계 종합</strong>
                <span>
                  과거에 자주 나온 번호, 오래 안 나온 번호를 참고해 뽑을 가능성을 조금씩 다르게
                  줍니다.
                </span>
              </li>
              <li>
                <strong>번호대 균형</strong>
                <span>1~15, 16~30, 31~45에서 두 개씩 골라 한쪽에 몰리지 않게 합니다.</span>
              </li>
              <li>
                <strong>홀짝·고저 균형</strong>
                <span>홀수 3개 짝수 3개처럼, 과거에 자주 보였던 모양을 찾아 만듭니다.</span>
              </li>
              <li>
                <strong>COLD 번호 부활</strong>
                <span>오랫동안 안 나오다가 최근에 다시 나온 번호를 먼저 넣습니다.</span>
              </li>
            </ol>

            <h3>번호 아래 숫자는 무슨 뜻인가요?</h3>
            <p>
              <code>홀짝 1:5</code>, <code>합계 153</code> 같은 숫자는{' '}
              <strong>번호를 다 뽑은 다음에 세어 본 결과</strong>입니다. 뽑기 전에 정해둔 조건이
              아닙니다.
            </p>
            <p>
              예를 들어 완전 랜덤으로 <code>3 · 12 · 19 · 27 · 33 · 41</code> 이 나왔다면, 홀수가
              4개이고 짝수가 2개이므로 <code>홀짝 4:2</code> 라고 적습니다. 랜덤이 그 비율을
              맞추려고 뽑은 것이 아니라, 뽑고 나서 세어 보니 그랬던 것입니다. 그래서 다시 생성을
              누를 때마다 이 숫자는 매번 달라집니다.
            </p>

            <h3>어떤 방법이 더 잘 맞나요?</h3>
            <p>
              <strong>없습니다.</strong> 로또는 45개 중 6개를 무작위로 뽑습니다. 나올 수 있는 조합은
              8,145,060가지이고, 그 하나하나가 뽑힐 가능성은 모두 똑같습니다. 어떤 번호가 지난주에
              나왔든 10년 동안 안 나왔든 이번 주에는 아무 차이가 없습니다.
            </p>
            <p>
              그래서 <strong>완전 랜덤을 맨 앞에 두었습니다.</strong> 통계를 참고한 조합과 아무
              근거 없이 뽑은 조합은 결과적으로 구분되지 않습니다. 그 사실을 감추지 않는 것이 이
              도구가 할 수 있는 유일한 정직함입니다.
            </p>
            <p>
              이 기능은 번호를 고르는 일을 조금 더 재미있게 만들기 위한 것입니다. 당첨을 보장하지
              않습니다.
            </p>
          </div>
        </Modal>
      )}
    </>
  )
}
