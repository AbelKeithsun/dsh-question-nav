/**
 * Question-nav minimap. Renders a vertical column of small round dots overlaid
 * on the LEFT edge of the conversation column (via the frame-wide
 * `shell.overlay` floating layer), vertically centered: one dot per turn that
 * claimed at least one user question — strictly aligned with the Trajectory
 * view's turn numbering (turns without a question produce no dot). Hover
 * enlarges a dot and shows an instant tooltip (portal-rendered, no native
 * delay) with the turn label and the turn's question text(s); clicking jumps
 * the chat to that turn's first question.
 *
 * Data source: the host-folded `questionIndex` session projection (whole
 * history, persisted host-side, pushed live through session/projection
 * frames) read through the injected `questionProjection` face, plus the live
 * chat window's questions merged on top for the brief window before a
 * just-sent question lands in the projection. No render-window expansion, no
 * client-side history paging.
 *
 * Data arrives through the props shares: the framework `useSessions` hook
 * (current session), the registrant inject face (read/subscribe/project/
 * jump), and the bound locale translator.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the ui-layout SlotMap merge ('shell.overlay').
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { QuestionNode } from '../core/nodes.ts'
import type { QuestionEntry } from '../core/question-entry.ts'
import { groupQuestionsByTurn, mergeLiveQuestions, type TurnDot } from '../core/turn-dots.ts'
import type { JumpFailureCode } from '../core/jump.ts'
import type { QuestionNavKey } from './locales.ts'
import styles from './question-nav.module.css'

/** Minimal observable shape of a session projection face. */
export interface ObservableFace {
  /** Current projection value (unknown — validated structurally at read). */
  getSnapshot: () => unknown
  /** Subscribe to value changes; returns an unsubscribe. */
  subscribe: (listener: () => void) => () => void
}

/** Values the registrant inject face supplies (wired in src/client/index.ts). */
export interface QuestionNavInjected {
  /** Extract the user questions of a session's currently loaded window. */
  readQuestions: (sessionId: SessionId) => QuestionNode[]
  /** Subscribe to the session list; returns an unsubscribe. */
  subscribeList: (cb: () => void) => () => void
  /** Subscribe to a session's content; returns an unsubscribe. */
  subscribeContent: (sessionId: SessionId, cb: () => void) => () => void
  /** The session's `questionIndex` projection face, when the host unit is registered. */
  questionProjection: (sessionId: SessionId) => ObservableFace | undefined
  /** Jump the chat to a question row (pages the window on demand). */
  jump: (sessionId: SessionId, key: string) => void
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
  /** Turn label line (e.g. "Turn 32"); null for ungrouped live questions. */
  title: string | null
  /** Question text lines (one per question folded into the dot). */
  lines: readonly string[]
  left: number
  top: number
}

/** Read the projection face value as a question-entry list (structural guard). */
function projectionEntries(face: ObservableFace | undefined): QuestionEntry[] {
  const value = face?.getSnapshot()
  if (!Array.isArray(value)) return []
  return value.filter((item): item is QuestionEntry =>
    typeof item === 'object' && item !== null
    && typeof (item as QuestionEntry).id === 'string'
    && typeof (item as QuestionEntry).seq === 'number'
    && typeof (item as QuestionEntry).turn === 'number')
}

function findConvRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-slot="conversation"] > div[data-phase]')
}

export function QuestionNavStrip(props: ComponentProps): React.JSX.Element | null {
  const current = props.useSessions((s) => s.current)
  const summary = props.useSessions((s) => (s.current === undefined ? undefined : s.byId[s.current]))
  const visible = current !== undefined && summary !== undefined && summary.blank !== true

  const [dots, setDots] = useState<TurnDot[]>([])
  const [jumpingKey, setJumpingKey] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const hintTimerRef = useRef<number | null>(null)

  const showHint = (message: string): void => {
    setHint(message)
    if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current)
    hintTimerRef.current = window.setTimeout(() => setHint(null), 1800)
  }

  // Recompute the dot list from the projection + live window; subscribe to
  // the projection push frames, session content, and the session list.
  useEffect(() => {
    if (!visible || current === undefined) {
      setDots([])
      return
    }
    const sessionId = current
    const face = props.questionProjection(sessionId)
    const refresh = (): void => {
      const grouped = groupQuestionsByTurn(projectionEntries(face))
      setDots(mergeLiveQuestions(grouped, props.readQuestions(sessionId)))
    }
    refresh()
    const unsubProjection = face?.subscribe(refresh) ?? (() => {})
    const unsubContent = props.subscribeContent(sessionId, refresh)
    const unsubList = props.subscribeList(refresh)
    return () => {
      unsubProjection()
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

  const onJump = (dot: TurnDot): void => {
    if (current === undefined) return
    setJumpingKey(dot.key)
    props.jump(current, dot.key)
    window.setTimeout(() => setJumpingKey((k) => (k === dot.key ? null : k)), 600)
  }

  const openTooltip = (dot: TurnDot, target: HTMLElement): void => {
    const r = target.getBoundingClientRect()
    setTooltip({
      title: dot.turn === null ? null : `Turn ${dot.turn}`,
      lines: dot.texts,
      left: r.right + 10,
      top: r.top,
    })
  }

  const t = props.t

  return (
    <div ref={panelRef} className={styles.rail} data-question-nav="rail">
      {hint !== null ? <div className={styles.hint} role="status">{hint}</div> : null}
      <div className={styles.list}>
        {dots.length === 0 ? (
          <div className={styles.empty}>{t('strip.empty')}</div>
        ) : (
          <div className={styles.dots}>
            <span className={styles.count}>{dots.length}</span>
            {dots.map((dot) => (
              <button
                key={dot.key}
                className={jumpingKey === dot.key ? `${styles.dot} ${styles.active}` : styles.dot}
                aria-label={dot.texts[0] ?? ''}
                onMouseEnter={(e) => openTooltip(dot, e.currentTarget)}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => onJump(dot)}
              />
            ))}
          </div>
        )}
      </div>
      {tooltip !== null
        ? createPortal(
            <div className={styles.tooltip} style={{ left: tooltip.left, top: tooltip.top }}>
              {tooltip.title !== null ? <div className={styles.tooltipTitle}>{tooltip.title}</div> : null}
              {tooltip.lines.map((line, index) => (
                <div key={index} className={styles.tooltipLine}>{line}</div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
