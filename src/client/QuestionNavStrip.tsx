/**
 * Question-nav minimap. Renders a vertical column of small round dots overlaid
 * on the LEFT edge of the conversation column (via the frame-wide
 * `shell.overlay` floating layer), vertically centered: one dot per user
 * question, enlarge on hover. The instant tooltip (a portal-rendered overlay,
 * no native-title delay) shows the question's full text; clicking a dot scrolls
 * the chat to that question.
 *
 * Index strategy (no render-window expansion): the dots cover the WHOLE
 * session history. The index is built from the raw `session.history` RPC via
 * the injected `fetchQuestionIndex` — the conversation's paged window is
 * untouched, so DSH's memory economy is preserved. The loaded window's live
 * questions are merged on top (for new messages arriving after the index was
 * built). Clicking a dot jumps through the existing paging loop, which calls
 * `loadOlder()` only until that specific page is in the window. If the index
 * safety budget is exhausted, a dimmed dashed "load earlier" dot appears above
 * the oldest question and continues the index on click.
 *
 * Data arrives through the four props shares: the framework `useSessions`
 * hook (current session), the registrant inject face (read/subscribe/jump/
 * fetch-index), and the bound locale translator.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the ui-layout SlotMap merge ('shell.overlay').
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { QuestionNode } from '../core/nodes.ts'
import { mergeQuestions } from '../core/nodes.ts'
import type { JumpFailureCode } from '../core/jump.ts'
import type { HistoryIndexOptions, HistoryIndexResult } from '../core/history-index.ts'
import type { QuestionNavKey } from './locales.ts'
import styles from './question-nav.module.css'

/** Values the registrant inject face supplies (wired in src/client/index.ts). */
export interface QuestionNavInjected {
  /** Extract the user questions of a session's currently loaded window. */
  readQuestions: (sessionId: SessionId) => QuestionNode[]
  /** Subscribe to the session list; returns an unsubscribe. */
  subscribeList: (cb: () => void) => () => void
  /** Subscribe to a session's content; returns an unsubscribe. */
  subscribeContent: (sessionId: SessionId, cb: () => void) => () => void
  /** Jump the chat to a question row (pages the window on demand). */
  jump: (sessionId: SessionId, key: string) => void
  /** Build the full-session question index from the raw history RPC. */
  fetchQuestionIndex: (sessionId: SessionId, options?: HistoryIndexOptions) => Promise<HistoryIndexResult>
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
  const [loadingIndex, setLoadingIndex] = useState(false)
  const [moreAvailable, setMoreAvailable] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const hintTimerRef = useRef<number | null>(null)
  /** Full-history index from the raw RPC (per current session). */
  const indexRef = useRef<QuestionNode[]>([])
  /** Next beforeSeq to resume from when the index budget was exhausted. */
  const nextBeforeSeqRef = useRef<number | undefined>(undefined)
  /** Abort controller for the in-flight index build. */
  const indexAbortRef = useRef<AbortController | null>(null)
  /** Session whose index build is in flight, to avoid duplicate loops. */
  const buildingSessionRef = useRef<SessionId | null>(null)

  const showHint = (message: string): void => {
    setHint(message)
    if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current)
    hintTimerRef.current = window.setTimeout(() => setHint(null), 1800)
  }

  // Build the full-history index on show; refresh the live window on content
  // change and merge both into the dot list.
  useEffect(() => {
    if (!visible || current === undefined) {
      indexRef.current = []
      nextBeforeSeqRef.current = undefined
      indexAbortRef.current?.abort()
      indexAbortRef.current = null
      buildingSessionRef.current = null
      setQuestions([])
      setLoadingIndex(false)
      setMoreAvailable(false)
      return
    }
    const sessionId = current
    // Reset the per-session index: this effect re-runs on session change.
    indexRef.current = []
    nextBeforeSeqRef.current = undefined
    const refresh = (): void => {
      const windowQuestions = props.readQuestions(sessionId)
      setQuestions(mergeQuestions(indexRef.current, windowQuestions))
    }
    const startBuild = (options?: HistoryIndexOptions): void => {
      buildingSessionRef.current = sessionId
      const controller = new AbortController()
      indexAbortRef.current = controller
      setLoadingIndex(true)
      setMoreAvailable(false)
      props.fetchQuestionIndex(sessionId, { ...options, signal: controller.signal })
        .then((result) => {
          if (buildingSessionRef.current !== sessionId) return
          indexRef.current = mergeQuestions(result.questions, indexRef.current)
          nextBeforeSeqRef.current = result.nextBeforeSeq
          setMoreAvailable(result.code === 'BUDGET' && result.nextBeforeSeq !== undefined)
          refresh()
        })
        .finally(() => {
          if (buildingSessionRef.current === sessionId) {
            setLoadingIndex(false)
            if (indexAbortRef.current === controller) indexAbortRef.current = null
            buildingSessionRef.current = null
          }
        })
    }
    refresh()
    startBuild()
    const unsubContent = props.subscribeContent(sessionId, refresh)
    const unsubList = props.subscribeList(refresh)
    return () => {
      indexAbortRef.current?.abort()
      indexAbortRef.current = null
      unsubContent()
      unsubList()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (current === undefined || nextBeforeSeqRef.current === undefined) return
    setMoreAvailable(false)
    setLoadingIndex(true)
    props.fetchQuestionIndex(current, { startBeforeSeq: nextBeforeSeqRef.current })
      .then((result) => {
        if (current === undefined) return
        indexRef.current = mergeQuestions(result.questions, indexRef.current)
        nextBeforeSeqRef.current = result.nextBeforeSeq
        setMoreAvailable(result.code === 'BUDGET' && result.nextBeforeSeq !== undefined)
        setQuestions(mergeQuestions(indexRef.current, props.readQuestions(current)))
      })
      .finally(() => setLoadingIndex(false))
  }

  const t = props.t

  return (
    <div ref={panelRef} className={styles.rail} data-question-nav="rail">
      {hint !== null ? <div className={styles.hint} role="status">{hint}</div> : null}
      <div className={styles.list}>
        {questions.length === 0 ? (
          <div className={styles.empty}>{loadingIndex ? t('strip.loadingAll') : t('strip.empty')}</div>
        ) : (
          <div className={styles.dots}>
            <span className={styles.count}>
              {questions.length}
              {loadingIndex ? <span className={styles.countLoading}>{t('strip.loadingSuffix')}</span> : null}
            </span>
            {moreAvailable && !loadingIndex ? (
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
