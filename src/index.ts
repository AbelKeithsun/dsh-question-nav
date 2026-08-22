/**
 * Host half of the dsh-question-nav plugin — runs in the DSH host process.
 * Registers the `questionIndex` session projection unit: the ordered list of
 * user questions (each tagged with its turn), folded from the session event
 * log by the projection registry, persisted by the projection cache, and
 * delivered to the browser through the standard projection carriers (history
 * tail-page baseline + session/projection push frames). The navigation UI
 * itself lives in the browser half (src/client).
 */
import type { Context } from '@deepseek-ai/cordis'
import { questionIndexProjectionDefinition } from './projection.ts'

/** Cordis plugin name. */
export const name = 'dsh-question-nav'

/**
 * Register the `questionIndex` unit. The registry is an optional capability
 * (absent in headless compositions), so registration rides `ctx.inject`:
 * without it the host half simply contributes nothing and the browser strip
 * falls back to live-window questions.
 * @param ctx - plugin context.
 */
export function apply(ctx: Context): void {
  ctx.inject(['sessionProjections'], (inner) => {
    inner.sessionProjections.register(questionIndexProjectionDefinition)
  })
}
