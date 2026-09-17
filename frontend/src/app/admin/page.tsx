'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * 운영자 로그인 — 아이디 · 비밀번호 · OTP 세 칸(2026-08-31 계약 변경).
 *
 * ⚠ **아이디·비밀번호'만' 이 아니다.** 그것만으로는 종전(64자 랜덤 토큰)보다 약해진다 —
 *   사람이 기억하는 비밀번호는 훨씬 추측하기 쉽다. 30초마다 바뀌는 OTP 여섯 자리가 그
 *   약점을 덮는다(계약). 세 칸 중 하나라도 빠지면 백엔드가 422 를 낸다.
 *
 * ⚠ 계정 테이블은 만들지 않는다. 쓰는 사람이 한 명이고, 계정 시스템은 그 자체로 공격면이자
 *   유지보수 대상이다(계약).
 *
 * ⚠ **자격증명을 어디에도 저장하지 않는다.** `localStorage` 에 두면 XSS 한 번에 샌다.
 *   보낸 뒤 서버가 준 `httpOnly` 쿠키만 남고, 이 화면의 state 는 곧 사라진다.
 *
 * ⚠ **실패 이유를 나누어 말하지 않는다.** 아이디·비밀번호·OTP 중 무엇이 틀렸는지 알려
 *   주면 아이디가 맞는지부터 알려 주는 셈이다. 계약이 네 경우를 같은 401 로 답하는 것과
 *   같은 이유로 화면 문구도 하나다. 429(너무 잦은 시도)와 503(설정 안 됨)만 구분하는데,
 *   그것은 **정상 사용자가 원인을 모르면 계속 두드리기 때문**이다.
 */
export default function AdminLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const filled = username.trim() && password && otp.trim()

  const submit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!filled || busy) return

    setBusy(true)
    setError(null)
    try {
      // 같은 출처로 부른다. 프론트 서버가 백엔드로 중계하고 쿠키를 이 도메인에 심는다.
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, otp: otp.trim() }),
      })

      if (res.ok) {
        // 메모리에서도 지운다.
        setUsername('')
        setPassword('')
        setOtp('')
        router.replace('/admin/logs')
        return
      }
      if (res.status === 429) setError('시도가 너무 잦습니다. 잠시 뒤 다시 시도하세요.')
      else if (res.status === 503)
        setError('운영자 기능이 꺼져 있습니다. 서버의 운영자 자격증명 설정을 확인하세요.')
      else if (res.status === 502) setError('서버에 연결하지 못했습니다.')
      else {
        /*
          ⚠ 401 과 422 를 **같은 문구**로 답한다. "형식이 잘못됐다" 와 "틀렸다" 를 나누면
            어떤 아이디가 존재하는지 좁혀 갈 실마리가 된다.
          ⚠ OTP 는 30초마다 바뀌므로 "다시 확인" 이라는 말이 실제로 도움이 된다.
        */
        setOtp('')
        setError('로그인하지 못했습니다. 아이디·비밀번호와 인증 앱의 6자리를 다시 확인하세요.')
      }
    } catch {
      setError('로그인하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="section admin-login">
      <h1>운영자 로그인</h1>

      <form onSubmit={submit}>
        <div className="admin-field">
          <label htmlFor="admin-username">아이디</label>
          <input
            id="admin-username"
            className="input"
            type="text"
            /*
              ⚠ `autoComplete="username"` 이라야 비밀번호 관리자가 아이디·비밀번호를 한 쌍으로
                묶는다. 끄면 저장이 안 되어 사람이 더 약한 비밀번호를 쓰게 된다.
            */
            autoComplete="username"
            spellCheck={false}
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="admin-field">
          <label htmlFor="admin-password">비밀번호</label>
          <input
            id="admin-password"
            className="input"
            // 어깨너머로 보이지 않게 하고, 브라우저가 일반 텍스트로 기억하지 않게 한다.
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="admin-field">
          <label htmlFor="admin-otp">인증 앱 6자리</label>
          <input
            id="admin-otp"
            className="input admin-otp"
            /*
              ⚠ `type="number"` 를 쓰지 않는다. 스피너가 붙고 앞자리 0 이 사라지며,
                모바일에서 스크롤로 값이 바뀐다. 숫자 키패드는 `inputMode` 로 띄운다.
              ⚠ `autoComplete="one-time-code"` 라야 iOS·안드로이드가 인증 앱에서 복사한
                코드를 붙여넣기로 제안한다.
            */
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          />
          <p className="admin-hint">Microsoft·Google Authenticator 등 인증 앱의 6자리 숫자</p>
        </div>

        {/* 오류는 입력 아래에서 낸다. `aria-live` 로 스크린리더에도 알린다. */}
        <p className="admin-error" aria-live="polite">
          {error}
        </p>

        <button type="submit" className="btn btn-primary" disabled={busy || !filled}>
          {busy ? '확인하는 중…' : '로그인'}
        </button>
      </form>
    </section>
  )
}
