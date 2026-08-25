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
import type { AlignPreference } from '../core/align.ts'
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
  /** Current rail anchor edge (defaults to 'left' before the settings section is ready). */
  align: () => AlignPreference
  /** Observe anchor-edge changes; returns an unsubscribe. */
  subscribeAlign: (cb: () => void) => () => void
  /** Persist a new anchor edge. */
  setAlign: (align: AlignPreference) => void
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
  /** Horizontal anchor — left edge (left-aligned rail) or right edge (right-aligned). */
  left?: number
  right?: number
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

/** Structural equality of two dot lists (member keys fully capture a dot's
 * folded questions, so identical key sequences mean identical content).
 * Lets the strip skip a re-render when a refresh produced no change. */
function sameDots(a: readonly TurnDot[], b: readonly TurnDot[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const da = a[i]
    const db = b[i]
    if (da.key !== db.key || da.memberKeys.length !== db.memberKeys.length) return false
    for (let j = 0; j < da.memberKeys.length; j++) {
      if (da.memberKeys[j] !== db.memberKeys[j]) return false
    }
  }
  return true
}

export function QuestionNavStrip(props: ComponentProps): React.JSX.Element | null {
  const current = props.useSessions((s) => s.current)
  const summary = props.useSessions((s) => (s.current === undefined ? undefined : s.byId[s.current]))
  const visible = current !== undefined && summary !== undefined && summary.blank !== true

  const [dots, setDots] = useState<TurnDot[]>([])
  const [jumpingKey, setJumpingKey] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [align, setAlign] = useState<AlignPreference>(() => props.align())
  const panelRef = useRef<HTMLDivElement | null>(null)
  const hintTimerRef = useRef<number | null>(null)
  // Last rendered dot list, for the change-detection bail-out below.
  const lastDotsRef = useRef<TurnDot[]>([])

  // Follow the rail anchor edge from the settings scope (a change re-anchors
  // the rail through the layout effect below).
  useEffect(() => props.subscribeAlign(() => setAlign(props.align())), [props])

  const showHint = (message: string): void => {
    setHint(message)
    if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current)
    hintTimerRef.current = window.setTimeout(() => setHint(null), 1800)
  }

  // Recompute the dot list from the projection + live window. Subscribed to
  // the projection push frames and the session's content only — session
  // switches are covered by `current` below (the effect re-runs on change),
  // so the session-list feed is not subscribed: it would re-run the full
  // recompute for unrelated list churn.
  useEffect(() => {
    if (!visible || current === undefined) {
      setDots([])
      lastDotsRef.current = []
      return
    }
    const sessionId = current
    const face = props.questionProjection(sessionId)
    const refresh = (): void => {
      const grouped = groupQuestionsByTurn(projectionEntries(face))
      const next = mergeLiveQuestions(grouped, props.readQuestions(sessionId))
      // Identical content (a streaming update that added no question): re-use
      // the previous array reference so React bails out of re-rendering the
      // strip — the common case during assistant streaming.
      if (sameDots(next, lastDotsRef.current)) {
        setDots(lastDotsRef.current)
        return
      }
      lastDotsRef.current = next
      setDots(next)
    }
    refresh()
    const unsubProjection = face?.subscribe(refresh) ?? (() => {})
    const unsubContent = props.subscribeContent(sessionId, refresh)
    return () => {
      unsubProjection()
      unsubContent()
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
  //
  // A layout-correction loop keeps the rail pinned to the conversation even
  // when an outside panel (e.g. a browser-extension sidebar like Doubao) moves
  // or resizes the frame without resizing the browser window: `window resize`
  // never fires for in-page panels, and a ResizeObserver on the conversation
  // root alone misses remounts and the tail of the frame's grid-column
  // transition, which used to leave the rail drifting into the session list.
  // The loop runs while the layout is still moving, then parks itself after a
  // few stable frames; observers re-wake it on the next change.
  useLayoutEffect(() => {
    if (!visible) return
    let raf = 0
    let idle = 0
    let stopped = false
    let observer: ResizeObserver | null = null
    const observed = { frame: null as Element | null, convRoot: null as Element | null }

    const applyLayout = (): boolean => {
      const panel = panelRef.current
      if (panel === null) return false
      const frame = panel.closest('[data-shell-overlay]')?.parentElement ?? null
      const convRoot = findConvRoot()
      // Keep looping while the anchors are not both present (conversation not
      // mounted yet / mid-reflow), so a late mount still aligns.
      if (frame === null || convRoot === null) return true
      // Keep observing the live nodes: the conversation root may remount
      // (e.g. after a panel-triggered reflow), which silently detaches an
      // earlier ResizeObserver target.
      if (observer !== null) {
        if (observed.frame !== frame) {
          observer.observe(frame, { box: 'border-box' })
          observed.frame = frame
        }
        if (observed.convRoot !== convRoot) {
          observer.observe(convRoot, { box: 'border-box' })
          observed.convRoot = convRoot
        }
      }
      const frameRect = frame.getBoundingClientRect()
      const convRect = convRoot.getBoundingClientRect()
      // Never snap onto a transient box: keep correcting until the
      // conversation has a real footprint again.
      if (convRect.height <= 0 || convRect.width <= 0) return true
      const top = `${convRect.top - frameRect.top}px`
      const height = `${convRect.height}px`
      // Anchor to the configured edge: keep the other edge's inline style
      // cleared so the CSS class (left: auto on .railRight) owns it.
      if (align === 'right') {
        const right = `${frameRect.right - convRect.right}px`
        if (panel.style.top === top && panel.style.height === height
          && panel.style.right === right && panel.style.left === '') {
          return false
        }
        panel.style.top = top
        panel.style.height = height
        panel.style.right = right
        panel.style.left = ''
        return true
      }
      const left = `${convRect.left - frameRect.left}px`
      if (panel.style.top === top && panel.style.height === height
        && panel.style.left === left && panel.style.right === '') {
        return false
      }
      panel.style.top = top
      panel.style.height = height
      panel.style.left = left
      panel.style.right = ''
      return true
    }

    const loop = (): void => {
      if (stopped) return
      raf = 0
      idle = applyLayout() ? 0 : idle + 1
      if (idle < 3) raf = requestAnimationFrame(loop)
    }
    const wake = (): void => {
      if (stopped) return
      idle = 0
      if (raf === 0) raf = requestAnimationFrame(loop)
    }

    observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(wake)
    if (observer !== null) {
      const panel = panelRef.current
      const frame = panel?.closest('[data-shell-overlay]')?.parentElement ?? null
      const convRoot = findConvRoot()
      if (frame !== null) { observer.observe(frame, { box: 'border-box' }); observed.frame = frame }
      if (convRoot !== null) { observer.observe(convRoot, { box: 'border-box' }); observed.convRoot = convRoot }
    }

    // Initial alignment; the loop keeps correcting through layout transitions.
    wake()
    window.addEventListener('resize', wake)
    return () => {
      stopped = true
      if (raf !== 0) cancelAnimationFrame(raf)
      observer?.disconnect()
      window.removeEventListener('resize', wake)
    }
  }, [visible, align])

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
      // The tooltip opens away from the rail: to the right of the dot on a
      // left-anchored rail, to the left on a right-anchored one.
      ...(align === 'right'
        ? { right: window.innerWidth - r.left + 10 }
        : { left: r.right + 10 }),
      top: r.top,
    })
  }

  const t = props.t

  return (
    <div
      ref={panelRef}
      className={align === 'right' ? `${styles.rail} ${styles.railRight}` : styles.rail}
      data-question-nav="rail"
    >
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
            <div className={styles.tooltip} style={{ left: tooltip.left, right: tooltip.right, top: tooltip.top }}>
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
