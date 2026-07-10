/**
 * 한국어 조사 처리.
 *
 * 꿈 키워드는 백엔드가 사전 표제어를 그대로 준다("돼지", "불", "물", "쫓기다"). 이것을
 * 문장에 끼워 넣으려면 받침 유무에 따라 조사가 달라진다 — "돼지를" / "불을".
 * 조사를 "을(를)" 처럼 병기하면 읽기 나쁘고, 하나로 고정하면 절반이 틀린다.
 *
 * 한글 음절은 유니코드에서 `가(0xAC00)` 부터 `힣(0xD7A3)` 까지 연속으로 배열되고,
 * 종성(받침)은 28가지가 순환한다. 그래서 (코드포인트 - 0xAC00) % 28 이 0이면 받침이 없다.
 */

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
const JONGSEONG_COUNT = 28

/** 마지막 글자에 받침이 있는가. 한글이 아니면 null(판단 불가). */
function hasFinalConsonant(word: string): boolean | null {
  const last = word.trim().at(-1)
  if (!last) return null

  const code = last.charCodeAt(0)
  if (code < HANGUL_START || code > HANGUL_END) return null

  return (code - HANGUL_START) % JONGSEONG_COUNT !== 0
}

/**
 * 단어 뒤에 붙일 조사를 고른다.
 *
 * 받침을 판단할 수 없으면(숫자·영문·한자로 끝나는 표제어) **받침 없는 쪽**을 쓴다.
 * 병기 표기("을(를)")보다 한쪽으로 틀리는 편이 읽기에 낫다고 보았다.
 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  return hasFinalConsonant(word) ? withFinal : withoutFinal
}

/** "돼지를" / "불을" */
export function eulReul(word: string): string {
  return `${word}${josa(word, '을', '를')}`
}

/** "돼지는" / "불은" */
export function eunNeun(word: string): string {
  return `${word}${josa(word, '은', '는')}`
}

/** "돼지가" / "불이" */
export function iGa(word: string): string {
  return `${word}${josa(word, '이', '가')}`
}
