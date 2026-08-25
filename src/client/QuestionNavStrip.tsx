/**
 * Question-nav minimap. Renders a vertical column of small round dots overlaid
 * on the LEFT edge of the conversation column (via the frame-wide
 * `shell.overlay` floating layer): one dot per turn that claimed at least one
 * user question — strictly aligned with the Trajectory view's turn numbering
 * (turns without a question produce no dot). The dot column is vertically
 * centered and clamped to at most 60% of the conversation height, scrolling
 * within that band when the session has more dots than fit.
 *
 * Hovering a dot "selects" it: the selected dot plus its two immediate
 * neighbors on each side magnify (progressively smaller with distance), and a
 * vertical cascade of question cards opens — the selected (center) card is the
 * focus (brand accent, elevated, full question text), the four neighbors are
 * narrower context cards clamped to fewer lines. Every card is clickable and
 * jumps to its question, exactly like clicking the dot. Hovering never scrolls
 * the band — the dot column stays put while you browse.
 *
 * Overflow is paged, not auto-scrolled: two small triangle buttons in the dot
 * style sit above and below the dot queue (▲ / ▼), each click revealing one
 * page of hidden dots (the page size is configurable in the plugin settings,
 * default 5) with a staggered pop-in animation as click feedback. The native
 * scrollbar stays hidden; the triangles themselves are the overflow cue (each
 * appears only while its direction has more to reveal) — no hover auto-scroll
 * of any kind.
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
import type { PageSize } from '../core/page-size.ts'
import type { JumpFailureCode } from '../core/jump.ts'
import { DOT_GAP, DOT_SIZE, FOCUS_RADIUS, clampScrollTop, focusCardMetrics, focusScale, focusTier, pageStep } from '../core/focus.ts'
import { formatQuestionTime } from '../core/time.ts'
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
  /** Observe plugin-settings changes (align, page size); returns an unsubscribe. */
  subscribeSettings: (cb: () => void) => () => void
  /** Persist a new anchor edge. */
  setAlign: (align: AlignPreference) => void
  /** Current ▲/▼ page size (defaults to DEFAULT_PAGE_SIZE before the settings section is ready). */
  pageSize: () => PageSize
  /** Persist a new page size. */
  setPageSize: (pageSize: PageSize) => void
}

type ComponentProps = PropsRuntime<'shell.overlay'> & QuestionNavInjected & PropsLocale<'question-nav'>

const FAILURE_HINTS: Record<JumpFailureCode, QuestionNavKey> = {
  VIEW_INACTIVE: 'jump.inactive',
  TARGET_HIDDEN: 'jump.hidden',
  NOT_FOUND: 'jump.notfound',
  TIMEOUT: 'jump.timeout',
}

/** One card of the focus cascade: a dot inside the magnification window. */
interface FocusWindowItem {
  dot: TurnDot
  /** Distance from the selected dot (0 = selected, 1/2 = cascade neighbors). */
  distance: number
}

/** The focus cascade: a vertical column of one card per window dot,
 *  non-overlapping, centered on the selected dot. */
interface FocusState {
  /** The selected (hovered) dot's key. */
  key: string
  /** Every dot of the focus window, in dot order. */
  items: FocusWindowItem[]
  /** Vertical center (viewport px) of the selected dot — the column centers on it. */
  centerY: number
  /** Horizontal anchor — left edge (left-aligned rail) or right edge (right-aligned). */
  left?: number
  right?: number
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
 *  folded questions, so identical key sequences mean identical content).
 *  Lets the strip skip a re-render when a refresh produced no change. */
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
  const [focus, setFocus] = useState<FocusState | null>(null)
  const [align, setAlign] = useState<AlignPreference>(() => props.align())
  // Dots revealed per ▲/▼ click (settings scope; drives pageBy's step).
  const [pageSize, setPageSize] = useState<PageSize>(() => props.pageSize())
  const panelRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const hintTimerRef = useRef<number | null>(null)
  // Pending focus-clear timer: lets the mouse move from the rail onto a
  // cascade card without dropping the cascade mid-flight.
  const clearFocusTimerRef = useRef<number | null>(null)
  // Last rendered dot list, for the change-detection bail-out below.
  const lastDotsRef = useRef<TurnDot[]>([])
  // Whether the dot band overflows its 60% clamp (drives the ▲/▼ paging
  // buttons).
  const [scrollable, setScrollable] = useState(false)
  // Scroll offset of the band + its max offset: drives the ▲/▼ visibility
  // (each direction hides once there is nothing more to reveal).
  const [scrollPos, setScrollPos] = useState<{ top: number; max: number }>({ top: 0, max: 0 })
  // Dots revealed by the latest ▲/▼ click: key → stagger order + travel
  // direction. Drives a short staggered pop-in animation so the click has a
  // visible effect; cleared by a timer once the animation has played out.
  const [revealed, setRevealed] = useState<ReadonlyMap<string, { dir: 1 | -1; order: number }> | null>(null)
  const revealTimerRef = useRef<number | null>(null)

  const syncScroll = (): void => {
    const list = listRef.current
    if (list === null) return
    const max = Math.max(0, list.scrollHeight - list.clientHeight)
    setScrollPos({ top: list.scrollTop, max })
  }

  // Page the band by one DOT_PAGE_ROWS click in the given direction, then mark
  // the dots the page just brought into view so they play a staggered pop-in
  // animation in the direction of travel (▼ → rise from below, ▲ → drop from
  // above) — the visual confirmation that the click revealed new dots.
  const pageBy = (dir: 1 | -1): void => {
    const list = listRef.current
    if (list === null) return
    const max = Math.max(0, list.scrollHeight - list.clientHeight)
    const target = clampScrollTop(list.scrollTop + dir * pageStep(DOT_SIZE, DOT_GAP, pageSize), max)
    if (target === list.scrollTop) return
    // Snapshot which dots are geometrically inside the band before the jump
    // (the container rect does not move when its content scrolls).
    const band = list.getBoundingClientRect()
    const els = Array.from(list.querySelectorAll<HTMLElement>('[data-question-nav-key]'))
    const wasVisible = els.map((el) => {
      const r = el.getBoundingClientRect()
      return r.bottom > band.top && r.top < band.bottom
    })
    list.scrollTop = target
    syncScroll()
    const next = new Map<string, { dir: 1 | -1; order: number }>()
    const fresh: string[] = []
    els.forEach((el, i) => {
      if (wasVisible[i]) return
      const r = el.getBoundingClientRect()
      const key = el.dataset.questionNavKey
      if (key !== undefined && r.bottom > band.top && r.top < band.bottom) {
        fresh.push(key)
      }
    })
    // Stagger radiates from the clicked triangle: paging down (▼) starts at
    // the bottom of the fresh batch, paging up (▲) at the top.
    if (dir === 1) fresh.reverse()
    fresh.forEach((key, order) => next.set(key, { dir, order }))
    if (next.size === 0) return
    setRevealed(next)
    if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current)
    // Animation (320ms) + per-dot stagger (35ms each) + slack.
    revealTimerRef.current = window.setTimeout(() => setRevealed(null), 320 + next.size * 35 + 120)
  }

  const canPageUp = scrollable && scrollPos.top > 0
  const canPageDown = scrollable && scrollPos.top < scrollPos.max

  // Focus persists briefly after leaving the rail, so the mouse can reach the
  // clickable cascade cards; entering a card cancels the clear, leaving
  // everything re-arms it.
  const cancelClearFocus = (): void => {
    if (clearFocusTimerRef.current !== null) {
      window.clearTimeout(clearFocusTimerRef.current)
      clearFocusTimerRef.current = null
    }
  }
  const scheduleClearFocus = (): void => {
    cancelClearFocus()
    clearFocusTimerRef.current = window.setTimeout(() => setFocus(null), 240)
  }

  // Follow the plugin settings from the settings scope (an align change
  // re-anchors the rail through the layout effect below; a page-size change
  // steps the ▲/▼ paging).
  useEffect(() => props.subscribeSettings(() => {
    setAlign(props.align())
    setPageSize(props.pageSize())
  }), [props])

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

  // Detect band overflow: drives the ▲/▼ paging buttons. Re-checked when the
  // dots change and whenever the band itself resizes (the layout loop above
  // clamps it to the conversation height).
  useLayoutEffect(() => {
    const list = listRef.current
    if (list === null) return
    const check = (): void => {
      setScrollable(list.scrollHeight > list.clientHeight + 1)
      syncScroll()
    }
    check()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(check)
    observer.observe(list)
    return () => observer.disconnect()
  }, [dots, align])

  // Clear any pending timers on unmount.
  useEffect(() => () => {
    if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current)
    if (clearFocusTimerRef.current !== null) window.clearTimeout(clearFocusTimerRef.current)
    if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!visible) return null

  const onJump = (dot: TurnDot): void => {
    if (current === undefined) return
    setJumpingKey(dot.key)
    props.jump(current, dot.key)
    window.setTimeout(() => setJumpingKey((k) => (k === dot.key ? null : k)), 600)
  }

  const openFocus = (dot: TurnDot, target: HTMLElement): void => {
    const index = dots.findIndex((d) => d.key === dot.key)
    if (index < 0) return
    cancelClearFocus()
    const r = target.getBoundingClientRect()
    // The cascade opens away from the rail: to the right of the dots on a
    // left-anchored rail, to the left on a right-anchored one. The column is
    // vertically centered on the selected dot (top: centerY + translateY(-50%)).
    const horizontal = align === 'right'
      ? { right: window.innerWidth - r.left + 10 }
      : { left: r.right + 10 }
    const lo = Math.max(0, index - FOCUS_RADIUS)
    const hi = Math.min(dots.length - 1, index + FOCUS_RADIUS)
    const items: FocusWindowItem[] = []
    for (let i = lo; i <= hi; i++) {
      items.push({ dot: dots[i], distance: Math.abs(i - index) })
    }
    setFocus({ key: dot.key, items, centerY: r.top + r.height / 2, ...horizontal })
  }

  const t = props.t
  const selectedIndex = focus === null ? -1 : dots.findIndex((d) => d.key === focus.key)

  return (
    <div
      ref={panelRef}
      className={align === 'right' ? `${styles.rail} ${styles.railRight}` : styles.rail}
      data-question-nav="rail"
    >
      <div className={styles.queue}>
        {dots.length === 0 ? (
          <div className={styles.empty}>{t('strip.empty')}</div>
        ) : (
          <>
            <span className={styles.count}>{dots.length}</span>
            {scrollable ? (
              <button
                type="button"
                className={`${styles.navBtn} ${styles.navUp}`}
                aria-label={t('strip.up')}
                style={{ visibility: canPageUp ? 'visible' : 'hidden' }}
                onMouseEnter={cancelClearFocus}
                onMouseLeave={scheduleClearFocus}
                onClick={() => pageBy(-1)}
              />
            ) : null}
            <div
              ref={listRef}
              className={styles.list}
              onScroll={syncScroll}
              onMouseLeave={scheduleClearFocus}
            >
              <div className={styles.dots}>
                {dots.map((dot, index) => {
                  const isFocused = focus !== null && focus.key === dot.key
                  // Progressive magnification: selected largest, ±1 smaller, ±2
                  // smaller still, the rest base scale.
                  const tier = selectedIndex < 0 ? null : focusTier(index - selectedIndex)
                  const scale = jumpingKey === dot.key ? 1.6 : tier !== null ? focusScale(tier) : 1
                  // Click-paging feedback: dots just paged into view play a
                  // staggered pop-in, traveling in the paging direction.
                  const reveal = revealed?.get(dot.key)
                  const cls = [styles.dot]
                  if (isFocused) cls.push(styles.focused)
                  if (jumpingKey === dot.key) cls.push(styles.active)
                  if (reveal !== undefined) {
                    cls.push(reveal.dir === 1 ? styles.dotEnterFromBottom : styles.dotEnterFromTop)
                  }
                  return (
                    <button
                      key={dot.key}
                      className={cls.join(' ')}
                      style={{
                        transform: `scale(${scale})`,
                        ...(reveal !== undefined ? { animationDelay: `${reveal.order * 35}ms` } : {}),
                      }}
                      data-question-nav-focused={isFocused ? 'true' : undefined}
                      data-question-nav-index={index}
                      data-question-nav-key={dot.key}
                      aria-label={dot.texts[0] ?? ''}
                      onMouseEnter={(e) => openFocus(dot, e.currentTarget)}
                      onClick={() => onJump(dot)}
                    />
                  )
                })}
              </div>
            </div>
            {scrollable ? (
              <button
                type="button"
                className={`${styles.navBtn} ${styles.navDown}`}
                aria-label={t('strip.down')}
                style={{ visibility: canPageDown ? 'visible' : 'hidden' }}
                onMouseEnter={cancelClearFocus}
                onMouseLeave={scheduleClearFocus}
                onClick={() => pageBy(1)}
              />
            ) : null}
          </>
        )}
      </div>
      {hint !== null
        ? createPortal(
            <div
              className={styles.hint}
              style={align === 'right' ? { right: 60, top: 20 } : { left: 60, top: 20 }}
            >
              {hint}
            </div>,
            document.body,
          )
        : null}
      {focus !== null
        ? createPortal(
            /* The vertical cascade: one crisp card per window dot, stacked
               non-overlapping, vertically centered on the selected dot.
               Hovering the cascade keeps it alive (the rail only re-arms its
               clear once the mouse leaves both). */
            <div
              className={align === 'right' ? `${styles.cascade} ${styles.cascadeRight}` : styles.cascade}
              style={{
                ...(focus.left !== undefined ? { left: focus.left } : {}),
                ...(focus.right !== undefined ? { right: focus.right } : {}),
                top: focus.centerY,
                transform: 'translateY(-50%)',
              }}
              onMouseEnter={cancelClearFocus}
              onMouseLeave={scheduleClearFocus}
            >
              {focus.items.map((item) => {
                const metrics = focusCardMetrics(item.distance)
                if (metrics === null) return null
                const isSelected = item.distance === 0
                // Cascade cards join their dot's texts into one clamped line;
                // the selected card keeps every line. Every card shows the
                // question's sent time, and clicking any card jumps to its
                // question exactly like clicking the dot.
                const text = item.dot.texts.join(' · ')
                const cls = isSelected
                  ? `${styles.card} ${styles.cardSelected}${align === 'right' ? ` ${styles.cardSelectedRight}` : ''}`
                  : styles.card
                return (
                  <div
                    key={item.dot.key}
                    className={cls}
                    role="button"
                    tabIndex={-1}
                    style={{ width: metrics.widthPx }}
                    onClick={() => onJump(item.dot)}
                  >
                    {isSelected && item.dot.turn !== null ? (
                      <div className={styles.cardTitle}>Turn {item.dot.turn}</div>
                    ) : null}
                    <div
                      className={isSelected ? styles.cardBody : styles.cardClamp}
                      style={
                        isSelected
                          ? undefined
                          : ({ WebkitLineClamp: metrics.maxLines, fontSize: metrics.fontSize } as React.CSSProperties)
                      }
                    >
                      {isSelected
                        ? item.dot.texts.map((line, lineIndex) => (
                            <div key={lineIndex} className={styles.cardLine}>{line}</div>
                          ))
                        : text}
                    </div>
                    <div className={styles.cardTime}>{formatQuestionTime(item.dot.time, Date.now())}</div>
                  </div>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
