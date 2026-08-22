/**
 * Browser-half entry for the dsh-question-nav plugin.
 *
 * Registers one surface into the frame-wide floating layer (`shell.overlay`):
 * a vertical strip on the LEFT edge of the conversation column listing every
 * user question in the current session as a small button. Clicking a button
 * scrolls the chat to that question (paging older history when needed). The
 * strip auto-expands the whole session history so even collapsed older
 * questions are surfaced as dots.
 *
 * Failure policy: nothing here throws at apply time — an external plugin must
 * never take the GUI down.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls ui-layout's SlotMap merge ('shell.overlay').
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { QuestionNavStrip, type QuestionNavInjected } from './QuestionNavStrip.tsx'
import { en, zh, type QuestionNavKey } from './locales.ts'
import { extractQuestions } from '../core/nodes.ts'
import { jumpToQuestion, type JumpFailureCode, type JumpPorts } from '../core/jump.ts'
import { loadAllOlder, type LoadAllOptions, type LoadAllResult } from '../core/load-all.ts'

/** Locale namespace this plugin owns. */
const NS = 'question-nav'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** question-nav surface copy. */
    'question-nav': QuestionNavKey
  }
}

/** Services required by this plugin. */
export const inject = ['slots', 'locale', 'sessions']

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

/** Resolve the active conversation scrollport (or null when not mounted). */
function scrollport(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-conversation-scroll]')
}

/**
 * One backward page that preserves the reader's scroll position. DSH's own
 * "load older" button arms a paging anchor; a programmatic `loadOlder()` does
 * not, so without this compensation prepended content would push the visible
 * rows down. We restore by the exact growth of the scrollHeight.
 */
async function pagedLoadOlder(ctx: ClientContext, sessionId: SessionId): Promise<void> {
  const binding = ctx.sessions.binding(sessionId)
  if (binding === undefined) return
  const port = scrollport()
  const beforeHeight = port?.scrollHeight ?? 0
  const beforeTop = port?.scrollTop ?? 0
  await binding.session.loadOlder()
  if (port === null) return
  // Let React commit the prepend before measuring the new height.
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  const delta = port.scrollHeight - beforeHeight
  if (delta > 0) port.scrollTop = beforeTop + delta
}

/** Map the session to the load-all port surface. */
function loadAllPortsFor(ctx: ClientContext, sessionId: SessionId): Parameters<typeof loadAllOlder>[0] {
  return {
    snapshot: () => {
      const binding = ctx.sessions.binding(sessionId)
      const snap = binding?.session.getSnapshot()
      if (snap === undefined) return undefined
      return { openState: snap.openState, hasMore: snap.hasMore, loadingOlder: snap.loadingOlder }
    },
    loadOlder: () => pagedLoadOlder(ctx, sessionId),
    isViewActive: () => document.querySelector('[data-chat-flow]') !== null,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
  }
}

/** Expand the whole session history so every question becomes a dot. */
function loadAllFor(ctx: ClientContext, sessionId: SessionId, options: LoadAllOptions = {}): Promise<LoadAllResult> {
  return loadAllOlder(loadAllPortsFor(ctx, sessionId), options)
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
    loadAllOlder: (sessionId, options) => loadAllFor(ctx, sessionId, options),
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
