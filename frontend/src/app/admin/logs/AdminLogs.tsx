'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import type { JobLogItem, JobLogResult, JobStatus, JobSummary } from '@/lib/api-types'
import { formatNumber } from '@/lib/format'

/**
 * 수집 잡 실행 이력.
 *
 * ── 이 화면의 목적 ──────────────────────────────────────────────────
 * **"무엇이 잘못됐는지 나중에 고치는 것"** 이다(계약). 그래서 실패가 눈에 띄어야 하고,
 * 실패만 보는 필터를 한 번에 걸 수 있어야 한다.
 *
 * ⚠ **`stat` 의 키를 하드코딩하지 않는다.** 잡마다 다르고 앞으로 늘어난다. 받은 키를
 *   그대로 순회해야 워커가 단계를 추가해도 화면이 따라간다(계약).
 * ⚠ `stat`·`logs` 는 **`null` 일 수 있다.** 2026-08-28 이전 실행에는 두 컬럼이 없었다.
 * ⚠ 페이징은 **커서**다. `next_before_id` 를 넘긴다 — 잡 이력은 끊임없이 쌓여 `OFFSET`
 *   이면 경계에서 같은 행이 두 번 보이거나 빠진다.
 */

const STATUSES: { value: '' | JobStatus; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'failed', label: '실패만' },
  { value: 'success', label: '성공' },
  { value: 'running', label: '실행 중' },
]

const STATUS_LABEL: Record<JobStatus, string> = {
  success: '성공',
  failed: '실패',
  running: '실행 중',
}

const PAGE_SIZE = 50

export function AdminLogs() {
  const router = useRouter()
  const [summary, setSummary] = useState<JobSummary[]>([])
  const [items, setItems] = useState<JobLogItem[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [jobName, setJobName] = useState('')
  const [status, setStatus] = useState<'' | JobStatus>('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /**
   * 목록을 불러온다.
   *
   * ⚠ `before` 가 있으면 **이어 붙이고**, 없으면 갈아 끼운다. 필터를 바꿨는데 이어 붙이면
   *   조건이 다른 행이 한 목록에 섞인다.
   * ⚠ 401 이면 로그인 화면으로 보낸다. 쿠키는 12시간이면 만료되므로 정상 경로다.
   */
  const load = useCallback(
    async (before?: number) => {
      setBusy(true)
      setError(null)
      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
        if (jobName) params.set('job_name', jobName)
        if (status) params.set('status', status)
        if (before !== undefined) params.set('before_id', String(before))

        const res = await fetch(`/api/admin/job-logs?${params.toString()}`, {
          cache: 'no-store',
        })
        if (res.status === 401) {
          router.replace('/admin')
          return
        }
        if (!res.ok) {
          setError(
            res.status === 503
              ? '운영자 기능이 꺼져 있습니다. 서버의 운영자 자격증명 설정을 확인하세요.'
              : '이력을 불러오지 못했습니다.',
          )
          return
        }

        const data = (await res.json()) as JobLogResult
        setSummary(data.summary ?? [])
        setItems((prev) => (before === undefined ? data.items : [...prev, ...data.items]))
        setCursor(data.next_before_id ?? null)
      } catch {
        setError('이력을 불러오지 못했습니다.')
      } finally {
        setBusy(false)
      }
    },
    [jobName, status, router],
  )

  // 필터가 바뀌면 처음부터 다시 받는다.
  useEffect(() => {
    void load()
  }, [load])

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => null)
    router.replace('/admin')
  }

  /** 요약 카드에 쓸 잡 이름 목록. 필터 선택지도 여기서 만든다 — 목록을 박아 두지 않는다. */
  const jobNames = summary.map((s) => s.job_name)

  return (
    <>
      <div className="admin-head">
        <h1>수집 이력</h1>
        <button type="button" className="btn btn-secondary" onClick={logout}>
          로그아웃
        </button>
      </div>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}

      {/* ── 잡별 7일 요약 ───────────────────────────── */}
      {summary.length > 0 && (
        <section className="section" aria-labelledby="summary-title">
          <div className="section-head">
            <h2 id="summary-title">최근 7일 요약</h2>
          </div>
          <ul className="admin-summary">
            {summary.map((s) => (
              <li
                key={s.job_name}
                className="admin-summary-card"
                /* 실패가 하나라도 있으면 카드째 눈에 띄게 한다. 이 화면의 목적이다. */
                data-failed={s.failed_cnt > 0 ? '' : undefined}
              >
                <p className="admin-summary-job">{s.job_name}</p>
                <p className="admin-summary-run">
                  실행 {formatNumber(s.run_cnt)}회
                  {s.failed_cnt > 0 && (
                    <strong className="admin-summary-fail">
                      {' '}
                      · 실패 {formatNumber(s.failed_cnt)}
                    </strong>
                  )}
                  {s.running_cnt > 0 && <> · 실행 중 {formatNumber(s.running_cnt)}</>}
                </p>
                <dl className="admin-summary-kv">
                  <dt>수집 합계</dt>
                  <dd>{formatNumber(s.collected_sum)}건</dd>
                  <dt>마지막 성공</dt>
                  {/*
                    ⚠ 마지막 **성공** 시각을 따로 보여준다. 워커가 오래 멈춘 사고를 이 값
                      하나로 알아챈다 — '마지막 실행' 만 보면 계속 실패 중인 잡이 정상으로 읽힌다.
                  */}
                  <dd data-none={s.last_success_at ? undefined : ''}>
                    {s.last_success_at ? formatStamp(s.last_success_at) : '없음'}
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 필터 ────────────────────────────────────── */}
      <section className="section" aria-labelledby="filter-title">
        <h2 id="filter-title" className="sr-only">
          이력 거르기
        </h2>

        <div className="admin-filters">
          <div className="admin-filter">
            <span id="filter-job">잡</span>
            <div className="admin-chips" role="group" aria-labelledby="filter-job">
              <button
                type="button"
                className="admin-chip"
                data-active={jobName === '' ? '' : undefined}
                aria-pressed={jobName === ''}
                onClick={() => setJobName('')}
              >
                전체
              </button>
              {jobNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="admin-chip"
                  data-active={jobName === name ? '' : undefined}
                  aria-pressed={jobName === name}
                  onClick={() => setJobName(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-filter">
            <span id="filter-status">상태</span>
            <div className="admin-chips" role="group" aria-labelledby="filter-status">
              {STATUSES.map((s) => (
                <button
                  key={s.value || 'all'}
                  type="button"
                  className="admin-chip"
                  data-active={status === s.value ? '' : undefined}
                  aria-pressed={status === s.value}
                  onClick={() => setStatus(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 목록 ────────────────────────────────────── */}
      <section className="section" aria-labelledby="list-title">
        <div className="section-head">
          <h2 id="list-title">실행 이력</h2>
        </div>

        {items.length === 0 && !busy ? (
          <p className="admin-empty">조건에 맞는 실행 이력이 없습니다.</p>
        ) : (
          <ul className="admin-runs">
            {items.map((item) => (
              <RunRow key={item.run_id} item={item} />
            ))}
          </ul>
        )}

        <div className="admin-more">
          {busy && <span className="admin-busy">불러오는 중…</span>}
          {!busy && cursor !== null && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void load(cursor)}
            >
              더 보기
            </button>
          )}
        </div>
      </section>
    </>
  )
}

/**
 * 실행 한 건. 접었다 펴면 `stat` 표와 로그, 오류 전문이 나온다.
 *
 * ⚠ `<details>` 를 쓴다. JS 없이 펼쳐지고 키보드 동작을 브라우저가 준다.
 * ⚠ **실패한 실행은 처음부터 펼쳐 둔다.** 실패를 찾으러 온 화면에서 한 번 더 누르게 하지
 *   않는다.
 */
function RunRow({ item }: { item: JobLogItem }) {
  const failed = item.status === 'failed'

  return (
    <li>
      <details className="admin-run" data-status={item.status} open={failed}>
        <summary>
          <span className="admin-run-status" data-status={item.status}>
            {STATUS_LABEL[item.status] ?? item.status}
          </span>
          <span className="admin-run-job">{item.job_name}</span>
          <span className="admin-run-time">{formatStamp(item.started_at)}</span>
          <span className="admin-run-meta">
            {item.exec_type}
            {item.duration_sec !== null && ` · ${formatNumber(item.duration_sec)}초`}
            {item.collected_count !== null && ` · ${formatNumber(item.collected_count)}건`}
          </span>
        </summary>

        <div className="admin-run-body">
          {/* 오류 전문. 줄바꿈과 들여쓰기가 살아야 스택트레이스를 읽을 수 있다. */}
          {item.error && <pre className="admin-run-error">{item.error}</pre>}

          {/*
            ⚠ 키를 순회한다. 잡마다 다르고 앞으로 늘어나므로 표를 박아 두지 않는다(계약).
          */}
          {item.stat && Object.keys(item.stat).length > 0 && (
            <dl className="admin-stat">
              {Object.entries(item.stat).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{formatNumber(value)}</dd>
                </div>
              ))}
            </dl>
          )}

          {item.logs && item.logs.length > 0 && (
            <ul className="admin-logs">
              {item.logs.map((line, index) => (
                <li key={`${line.t}-${index}`} data-level={line.lv}>
                  <span className="admin-log-time">{formatTime(line.t)}</span>
                  <span className="admin-log-level">{line.lv}</span>
                  <span className="admin-log-msg">{line.msg}</span>
                </li>
              ))}
            </ul>
          )}

          {/* 셋 다 없을 수 있다(옛 실행). 빈 상자를 남기지 않고 그 사실을 말한다. */}
          {!item.error && !item.stat && !item.logs && (
            <p className="admin-run-none">이 실행에는 남은 상세 기록이 없습니다.</p>
          )}
        </div>
      </details>
    </li>
  )
}

/**
 * ISO 8601 → `08-28 10:17:02`.
 *
 * ⚠ 로케일 함수를 쓰지 않는다. 서버와 브라우저의 시간대·로케일이 다르면 hydration 이
 *   어긋난다. 응답이 KST(`+09:00`)로 오므로 **문자열에서 그대로 잘라 쓴다.**
 */
function formatStamp(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/)
  return m ? `${m[1]} ${m[2]}` : iso
}

function formatTime(iso: string): string {
  const m = iso.match(/T(\d{2}:\d{2}:\d{2})/)
  return m ? m[1] : iso
}
