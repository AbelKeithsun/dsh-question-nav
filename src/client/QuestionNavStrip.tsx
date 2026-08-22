/**
 * Question-nav minimap. Renders a vertical column of small round dots overlaid
 * on the LEFT edge of the conversation column (via the frame-wide
 * `shell.overlay` floating layer), vertically centered: one dot per user
 * question, enlarge on hover. The instant tooltip (a portal-rendered overlay,
 * no native-title delay) shows the question's full text; clicking a dot scrolls
 * the chat to that question.
 *
 * Dots index the WHOLE session history, not just the currently loaded window:
 * on show, the strip auto-expands older pages (`loadAllOlder`) so questions
 * that still sit behind DSH's "load older" button are surfaced too. While the
 * expansion is running the count shows a "…" affordance; if the safety budget
 * is exhausted a dimmed "load earlier" dot appears above the oldest question.
 *
 * Data arrives through the four props shares: the framework `useSessions`
 * hook (current session), the registrant inject face (read/subscribe/jump/
 * load-all), and the bound locale translator.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the ui-layout SlotMap merge ('shell.overlay').
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { QuestionNode } from '../core/nodes.ts'
import type { JumpFailureCode } from '../core/jump.ts'
import type { LoadAllOptions, LoadAllResult } from '../core/load-all.ts'
import type { QuestionNavKey } from './locales.ts'
import styles from './question-nav.module.css'

/** Values the registrant inject face supplies (wired in src/client/index.ts). */
export interface QuestionNavInjected {
  /** Extract the user questions of a session (current loaded window). */
  readQuestions: (sessionId: SessionId) => QuestionNode[]
  /** Subscribe to the session list; returns an unsubscribe. */
  subscribeList: (cb: () => void) => () => void
  /** Subscribe to a session's content; returns an unsubscribe. */
  subscribeContent: (sessionId: SessionId, cb: () => void) => () => void
  /** Jump the chat to a question row. */
  jump: (sessionId: SessionId, key: string) => void
  /** Expand the session history until every question is loaded. */
  loadAllOlder: (sessionId: SessionId, options?: LoadAllOptions) => Promise<LoadAllResult>
}

type ComponentProps = PropsRuntime<'shell.overlay'> & QuestionNavInjected & PropsLocale<'question-nav'>

const FAILURE_HINTS: Record<JumpFailureCode, QuestionNavKey> = {
  VIEW_INACTIVE: 'jump.inactive',
  TARGET_HIDDEN: 'jump.hidden',
  NOT_FOUND: 'jump.notfound',
  TIMEOUT: 'jump.timeout',
}

/** Live position of the instant hover tooltip. */
interface TooltipState {
  text: string
  left: number
  top: number
}

function findConvRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-slot="conversation"] > div[data-phase]')
}

export function QuestionNavStrip(props: ComponentProps): React.JSX.Element | null {
  const current = props.useSessions((s) => s.current)
  const summary = props.useSessions((s) => (s.current === undefined ? undefined : s.byId[s.current]))
  const visible = current !== undefined && summary !== undefined && summary.blank !== true

  const [questions, setQuestions] = useState<QuestionNode[]>([])
  const [jumpingKey, setJumpingKey] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [loadingAll, setLoadingAll] = useState(false)
  const [moreAvailable, setMoreAvailable] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const hintTimerRef = useRef<number | null>(null)
  /** Abort controller for the in-flight expansion (cancelled on session change). */
  const loadAllAbortRef = useRef<AbortController | null>(null)
  /** Session whose expansion is already running, to avoid duplicate loops. */
  const loadingAllSessionRef = useRef<SessionId | null>(null)

  const showHint = (message: string): void => {
    setHint(message)
    if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current)
    hintTimerRef.current = window.setTimeout(() => setHint(null), 1800)
  }

  // Refresh the question list whenever the current session or its content changes.
  useEffect(() => {
    if (!visible || current === undefined) {
      setQuestions([])
      return
    }
    const refresh = (): void => setQuestions(props.readQuestions(current))
    refresh()
    const unsubContent = props.subscribeContent(current, refresh)
    const unsubList = props.subscribeList(refresh)
    return () => {
      unsubContent()
      unsubList()
    }
  }, [visible, current, props])

  // Auto-expand the full history so collapsed older questions surface as dots.
  // Runs once per session; the session notifier drives the list refresh above.
  useEffect(() => {
    if (!visible || current === undefined) {
      loadAllAbortRef.current?.abort()
      loadAllAbortRef.current = null
      loadingAllSessionRef.current = null
      setLoadingAll(false)
      setMoreAvailable(false)
      return
    }
    if (loadingAllSessionRef.current === current) return
    loadingAllSessionRef.current = current
    const controller = new AbortController()
    loadAllAbortRef.current = controller
    setLoadingAll(true)
    setMoreAvailable(false)
    props.loadAllOlder(current, { signal: controller.signal })
      .then((result) => {
        // Budget exhausted but more history still exists: offer "load earlier".
        setMoreAvailable(result.code === 'BUDGET' && !result.ok)
      })
      .finally(() => {
        setLoadingAll(false)
        if (loadAllAbortRef.current === controller) loadAllAbortRef.current = null
        loadingAllSessionRef.current = null
      })
    return () => {
      controller.abort()
    }
  }, [visible, current, props])

  // Listen for jump-failure events and surface the hint.
  useEffect(() => {
    const onJumpFailed = (event: Event): void => {
      const code = (event as CustomEvent<JumpFailureCode>).detail
      showHint(props.t(FAILURE_HINTS[code] ?? 'jump.timeout'))
    }
    window.addEventListener('question-nav:jump-failed', onJumpFailed)
    return () => window.removeEventListener('question-nav:jump-failed', onJumpFailed)
  }, [props])

  // Anchor the minimap to the conversation column: position it at the left
  // edge of the conversation root and reserve a thin rail with padding-left.
  useLayoutEffect(() => {
    if (!visible) return
    let raf = 0
    let retries = 0
    const applyLayout = (): void => {
      const panel = panelRef.current
      if (panel === null) return
      const frame = panel.closest('[data-shell-overlay]')?.parentElement ?? null
      const convRoot = findConvRoot()
      if (frame === null || convRoot === null) return
      const frameRect = frame.getBoundingClientRect()
      const convRect = convRoot.getBoundingClientRect()
      if (convRect.height <= 0) {
        if (retries < 20) {
          retries += 1
          raf = requestAnimationFrame(applyLayout)
        }
        return
      }
      retries = 0
      panel.style.top = `${convRect.top - frameRect.top}px`
      panel.style.height = `${convRect.height}px`
      panel.style.left = `${convRect.left - frameRect.left}px`
    }
    applyLayout()
    raf = requestAnimationFrame(applyLayout)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(applyLayout)
    const convRoot = findConvRoot()
    observer?.observe(convRoot ?? document.body, { box: 'border-box' })
    window.addEventListener('resize', applyLayout)
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      observer?.disconnect()
      window.removeEventListener('resize', applyLayout)
    }
  }, [visible])

  // Clear any pending hint timer on unmount.
  useEffect(() => () => {
    if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current)
  }, [])

  if (!visible) return null

  const onJump = (node: QuestionNode): void => {
    if (current === undefined) return
    setJumpingKey(node.key)
    props.jump(current, node.key)
    window.setTimeout(() => setJumpingKey((k) => (k === node.key ? null : k)), 600)
  }

  const onLoadMore = (): void => {
    if (current === undefined) return
    setMoreAvailable(false)
    setLoadingAll(true)
    props.loadAllOlder(current)
      .then((result) => {
        setMoreAvailable(result.code === 'BUDGET' && !result.ok)
      })
      .finally(() => setLoadingAll(false))
  }

  const t = props.t

  return (
    <div ref={panelRef} className={styles.rail} data-question-nav="rail">
      {hint !== null ? <div className={styles.hint} role="status">{hint}</div> : null}
      <div className={styles.list}>
        {questions.length === 0 ? (
          <div className={styles.empty}>{loadingAll ? t('strip.loadingAll') : t('strip.empty')}</div>
        ) : (
          <div className={styles.dots}>
            <span className={styles.count}>
              {questions.length}
              {loadingAll ? <span className={styles.countLoading}>{t('strip.loadingSuffix')}</span> : null}
            </span>
            {moreAvailable && !loadingAll ? (
              <button
                className={`${styles.dot} ${styles.moreDot}`}
                aria-label={t('strip.loadEarlier')}
                title={t('strip.loadEarlier')}
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setTooltip({ text: t('strip.loadEarlier'), left: r.right + 10, top: r.top })
                }}
                onMouseLeave={() => setTooltip(null)}
                onClick={onLoadMore}
              />
            ) : null}
            {questions.map((node) => (
              <button
                key={node.key}
                className={jumpingKey === node.key ? `${styles.dot} ${styles.active}` : styles.dot}
                aria-label={node.text}
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setTooltip({ text: node.text, left: r.right + 10, top: r.top })
                }}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => onJump(node)}
              />
            ))}
          </div>
        )}
      </div>
      {tooltip !== null
        ? createPortal(
            <div className={styles.tooltip} style={{ left: tooltip.left, top: tooltip.top }}>
              {tooltip.text}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
