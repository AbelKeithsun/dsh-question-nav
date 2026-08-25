/**
 * Browser-half entry for the dsh-question-nav plugin.
 *
 * Registers one surface into the frame-wide floating layer (`shell.overlay`):
 * a vertical strip on the LEFT edge of the conversation column listing every
 * user question in the current session as a small button, one dot per turn.
 * Clicking a button scrolls the chat to that turn's first question.
 *
 * The dots are driven by the host-folded `questionIndex` session projection
 * (registered by the plugin's host half): the projection registry folds the
 * WHOLE event log without touching the chat's paged render window, the
 * projection cache persists it, and the standard carriers (history tail-page
 * baseline + session/projection push frames) keep it live. Live-window
 * questions not yet recorded by the projection are merged on top so a
 * just-sent question appears immediately.
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
// Type-only: pulls the settings shell's SlotMap merge ('settings.plugins.tab')
// and the ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SettingsScopeBinder } from '@deepseek-ai/dsh-client-ui-settings/client'
import { QuestionNavStrip, type ObservableFace, type QuestionNavInjected } from './QuestionNavStrip.tsx'
import { QuestionNavSettingsTab } from './QuestionNavSettingsTab.tsx'
import { QuestionNavSettingsController } from './settings.ts'
import { en, zh, type QuestionNavKey } from './locales.ts'
import { extractQuestions } from '../core/nodes.ts'
import { jumpToQuestion, type JumpFailureCode, type JumpPorts } from '../core/jump.ts'

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

/**
 * The session's `questionIndex` projection face (getSnapshot + subscribe).
 * Undefined when the session is not bound or the host unit is not registered
 * (e.g. a headless composition) — the strip then shows live-window dots only.
 */
function questionProjectionOf(ctx: ClientContext, sessionId: SessionId): ObservableFace | undefined {
  const face = ctx.sessions.binding(sessionId)?.session.projections.faceOf('questionIndex')
  if (face === undefined) return undefined
  return {
    getSnapshot: () => face.getSnapshot(),
    subscribe: (listener) => face.subscribe(listener),
  }
}

function createInject(ctx: ClientContext, settings: QuestionNavSettingsController): QuestionNavInjected {
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
    questionProjection: (sessionId) => questionProjectionOf(ctx, sessionId),
    jump: (sessionId, key) => {
      const ports = jumpPortsFor(ctx, sessionId)
      ports.report = (code: JumpFailureCode) => {
        // Surface the failure through the component via a DOM event the
        // strip listens for; simplest reliable cross-boundary channel here.
        window.dispatchEvent(new CustomEvent('question-nav:jump-failed', { detail: code }))
      }
      void jumpToQuestion(ports, key)
    },
    align: () => settings.getSnapshot().align,
    subscribeAlign: (cb) => settings.subscribe(cb),
    setAlign: (align) => settings.setAlign(align),
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
  const t = ctx.locale.bind(NS)

  const settings = new QuestionNavSettingsController()
  const injected = createInject(ctx, settings)

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'question-nav',
    order: 900,
    locale: NS,
    inject: () => injected,
  }, QuestionNavStrip))

  // The settings surface is optional and may apply after this plugin, so the
  // namespace binds and the settings page mounts in a fiber that waits for
  // it. Without it the strip simply keeps the default left alignment.
  ctx.inject(['settingsScope'], (scopeCtx) => {
    settings.attach(scopeCtx.get('settingsScope') as SettingsScopeBinder)
    ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
      name: 'settings.plugins.tab',
      id: 'question-nav',
      order: 100,
      label: () => t('settings.tab'),
      locale: NS,
      inject: () => injected,
    }, QuestionNavSettingsTab))
  })
}
