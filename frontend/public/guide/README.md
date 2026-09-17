# 가이드 상세 이미지

사용자가 AI 로 만들어 넣는 이미지 폴더. 프롬프트·규약은 `docs/raw/002-이미지제작요청서.md`.

파일이 없어도 화면은 정상 동작한다(컴포넌트가 자동으로 숨긴다). 파일을 아래 이름 그대로
넣으면 코드가 자동으로 연결한다.

## 헤더 (1200×675, 투명 PNG)
- how-to-check-hero.png
- prize-claim-hero.png
- lotto-facts-hero.png
- responsible-lottery-hero.png
- auto-vs-manual-hero.png — 2026-09-17 추가. 연필로 칠한 용지(수동)와 발권
  단말기에서 나오는 용지(자동)를 나란히 둔 그림이다. 허브 카드와 상세 헤더가 함께 쓴다.
  ⚠ 처음에 `auto-vs-manual.png` 로 넣었다가 `-hero` 를 붙였다 — `GuideHeroImage` 가
    `{slug}-hero.png` 만 찾으므로, 규약을 벗어난 이름은 상세에서 쓸 수 없다.
  ⚠ 원본이 1672×941 로 와서 1200×675 로 줄이고 256색으로 양자화했다(595KB → 79KB).
    webp 는 **무손실**이 더 작다(67KB) — 평면 색 일러스트라 lossy 가 오히려 커진다.

## 재미있는 사실 스팟 (400×400, 투명 PNG)
- fact-combinations.png
- fact-odds.png
- fact-world.png

각 파일에 같은 이름의 .webp 를 함께 넣으면 우선 사용된다.
