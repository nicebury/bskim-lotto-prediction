'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * 운영자 로그인 — 토큰 입력 하나.
 *
 * ⚠ 사용자 계정·비밀번호를 만들지 않는다. 쓰는 사람이 한 명이고, 계정 시스템은 그 자체로
 *   공격면이자 유지보수 대상이다(계약).
 *
 * ⚠ **토큰을 어디에도 저장하지 않는다.** `localStorage` 에 두면 XSS 한 번에 영구 토큰이
 *   샌다. 보낸 뒤 서버가 준 `httpOnly` 쿠키만 남고, 이 화면의 state 는 곧 사라진다.
 *
 * ⚠ 실패 이유를 나누어 말하지 않는다("토큰이 짧다"·"틀렸다"). 계약이 401 하나로 답하는
 *   것과 같은 이유다 — 공격자에게 힌트를 주지 않는다. 429(너무 잦은 시도)만 예외로
 *   구분하는데, 그것은 **정상 사용자가 원인을 모르면 계속 두드리기 때문**이다.
 */
export default function AdminLoginPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token.trim() || busy) return

    setBusy(true)
    setError(null)
    try {
      // 같은 출처로 부른다. 프론트 서버가 백엔드로 중계하고 쿠키를 이 도메인에 심는다.
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      if (res.ok) {
        setToken('') // 메모리에서도 지운다.
        router.replace('/admin/logs')
        return
      }
      if (res.status === 429) setError('시도가 너무 잦습니다. 잠시 뒤 다시 시도하세요.')
      else if (res.status === 503)
        setError('운영자 기능이 꺼져 있습니다. 서버의 ADMIN_TOKEN 설정을 확인하세요.')
      else if (res.status === 502) setError('서버에 연결하지 못했습니다.')
      else setError('로그인하지 못했습니다.')
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
        <label htmlFor="admin-token">접속 토큰</label>
        <input
          id="admin-token"
          className="input"
          /*
            ⚠ `type="password"` 다. 어깨너머로 보이지 않게 하고, 브라우저가 일반 텍스트로
              기억하지 않게 한다. `autoComplete="off"` 로 저장 제안도 막는다.
          */
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={{ marginTop: 'var(--space-2)' }}
        />

        {/* 오류는 입력 아래에서 낸다. `aria-live` 로 스크린리더에도 알린다. */}
        <p className="admin-error" aria-live="polite">
          {error}
        </p>

        <button type="submit" className="btn btn-primary" disabled={busy || !token.trim()}>
          {busy ? '확인하는 중…' : '로그인'}
        </button>
      </form>
    </section>
  )
}
