/**
 * Browser-half entry for the dsh-question-nav plugin.
 *
 * Registers one surface into the frame-wide floating layer (`shell.overlay`):
 * a vertical strip on the LEFT edge of the conversation column listing every
 * user question in the current session as a small button. Clicking a button
 * scrolls the chat to that question.
 *
 * The strip indexes the WHOLE session history WITHOUT expanding DSH's paged
 * render window: it pages the raw `session.history` RPC (read-only, no render
 * cost) and derives each question's chat anchor key from the event. Only when
 * a dot is clicked does the jump loop call `loadOlder()` to bring that
 * specific page into the window — so the conversation's memory economy is
 * preserved.
 *
 * Failure policy: nothing here throws at apply time — an external plugin must
 * never take the GUI down.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls ui-layout's SlotMap merge ('shell.overlay').
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { QuestionNavStrip, type QuestionNavInjected } from './QuestionNavStrip.tsx'
import { en, zh, type QuestionNavKey } from './locales.ts'
import { extractQuestions } from '../core/nodes.ts'
import { jumpToQuestion, type JumpFailureCode, type JumpPorts } from '../core/jump.ts'
import { buildQuestionIndex, type HistoryIndexOptions, type HistoryIndexResult, type RawEventLike } from '../core/history-index.ts'

/** Locale namespace this plugin owns. */
const NS = 'question-nav'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** question-nav surface copy. */
    'question-nav': QuestionNavKey
  }
}

/** Services required by this plugin. */
export const inject = ['slots', 'locale', 'sessions', 'connection']

/** Single-instance guard: a duplicated client injection must not mount twice. */
declare global {
  // eslint-disable-next-line no-var
  var __dshQuestionNavApplied: boolean | undefined
}

function claimApply(): boolean {
  if (globalThis.__dshQuestionNavApplied === true) return false
  globalThis.__dshQuestionNavApplied = true
  return true
}

function releaseApply(): void {
  globalThis.__dshQuestionNavApplied = undefined
}

/** Map the session snapshot to the jump-loop port surface. */
function jumpPortsFor(ctx: ClientContext, sessionId: SessionId): JumpPorts {
  return {
    snapshot: () => {
      const binding = ctx.sessions.binding(sessionId)
      const snap = binding?.session.getSnapshot()
      if (snap === undefined) return undefined
      return {
        openState: snap.openState,
        hasMore: snap.hasMore,
        loadingOlder: snap.loadingOlder,
        rows: snap.chat.nodes.values(),
      }
    },
    loadOlder: async () => {
      const binding = ctx.sessions.binding(sessionId)
      if (binding === undefined) throw new Error('session unavailable')
      await binding.session.loadOlder()
    },
    isViewActive: () => document.querySelector('[data-chat-flow]') !== null,
    findRow: (key: string) => {
      for (const candidate of Array.from(document.querySelectorAll<HTMLElement>('[data-chat-anchor-key]'))) {
        if (candidate.dataset.chatAnchorKey === key) return candidate
      }
      return null
    },
    scrollIntoView: (row) => row.scrollIntoView({ block: 'start' }),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
  }
}

/** Resolve the connection handle (shared API client) as other DSH plugins do. */
function connectionOf(ctx: ClientContext): ConnectionHandle {
  return ctx.get('connection') as ConnectionHandle
}

/**
 * One raw history page, mapped to the pure `buildQuestionIndex` port shape.
 * `beforeSeq` is exclusive; `undefined` reads the newest page. Returns
 * undefined when the page is unavailable so the builder stops cleanly. The
 * SDK's `SessionEvent` is cast to the structural `RawEventLike` at this
 * boundary (the index reader only touches type/seq/time/surfaceOp/data).
 */
async function rawHistoryPage(
  ctx: ClientContext,
  sessionId: SessionId,
  beforeSeq: number | undefined,
  maxMessages: number,
): Promise<{ events: readonly { event: RawEventLike }[]; hasMore: boolean } | undefined> {
  const { api } = connectionOf(ctx)
  const { result } = await api.sessions.history({ sessionId, beforeSeq, maxMessages })
  if (!result.ok) return undefined
  return {
    events: result.value.events.map((entry) => ({ event: entry.event as unknown as RawEventLike })),
    hasMore: result.value.hasMore,
  }
}

/** Build the full-session question index from the raw history RPC (no render). */
function buildIndexFor(
  ctx: ClientContext,
  sessionId: SessionId,
  options: HistoryIndexOptions = {},
): Promise<HistoryIndexResult> {
  return buildQuestionIndex({
    history: (beforeSeq, maxMessages) => rawHistoryPage(ctx, sessionId, beforeSeq, maxMessages),
    now: () => Date.now(),
  }, options)
}

function createInject(ctx: ClientContext): QuestionNavInjected {
  return {
    readQuestions: (sessionId) => {
      const snap = ctx.sessions.binding(sessionId)?.session.getSnapshot()
      if (snap === undefined) return []
      return extractQuestions(snap.chat.nodes.values())
    },
    subscribeList: (cb) => ctx.sessions.list.subscribe(cb),
    subscribeContent: (sessionId, cb) => {
      const binding = ctx.sessions.binding(sessionId)
      if (binding === undefined) return () => {}
      return binding.session.subscribe(cb)
    },
    jump: (sessionId, key) => {
      const ports = jumpPortsFor(ctx, sessionId)
      ports.report = (code: JumpFailureCode) => {
        // Surface the failure through the component via a DOM event the
        // strip listens for; simplest reliable cross-boundary channel here.
        window.dispatchEvent(new CustomEvent('question-nav:jump-failed', { detail: code }))
      }
      void jumpToQuestion(ports, key)
    },
    fetchQuestionIndex: (sessionId, options) => buildIndexFor(ctx, sessionId, options),
  }
}

/**
 * Register the question-nav surface.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  if (!claimApply()) return
  ctx.effect(() => releaseApply, 'question-nav: apply claim')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'question-nav: dictionaries')

  const injected = createInject(ctx)

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'question-nav',
    order: 900,
    locale: NS,
    inject: () => injected,
  }, QuestionNavStrip))
}
