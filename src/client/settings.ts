/**
 * Browser mirror of the `question-nav` settings namespace: reads the rail
 * anchor edge and the ▲/▼ page size from the settings scope
 * (`ctx.settingsScope.bind`) and routes the user's choices back through
 * `scope.set`. The namespace itself is registered by the host half
 * (src/settings.ts).
 *
 * The settings surface is optional and may apply after this plugin, so the
 * controller starts unbound and degrades to the defaults until {@link attach}
 * binds the scope (called from a fiber that injects `settingsScope`). The
 * plugin keeps working everywhere it already did.
 *
 * @module dsh-question-nav/client/settings
 */

import type { SettingsScope, SettingsScopeSnapshot, SettingsScopeSpec } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  ALIGN_FIELD, ALIGN_OPTIONS, DEFAULT_ALIGN, QUESTION_NAV_SETTINGS_NS,
  type AlignPreference,
} from '../core/align.ts'
import {
  DEFAULT_PAGE_SIZE, PAGE_SIZE_FIELD, PAGE_SIZE_OPTIONS,
  type PageSize,
} from '../core/page-size.ts'

/** Narrow a raw section value to the anchor field. */
function isAlignPreference(value: unknown): value is AlignPreference {
  return ALIGN_OPTIONS.some((option) => option === value)
}

/** Narrow a raw section value to the page-size field. */
function isPageSize(value: unknown): value is PageSize {
  return (PAGE_SIZE_OPTIONS as readonly unknown[]).includes(value)
}

/** The minimal face of the settings scope service this controller needs.
 * Kept structural (bind only) so the controller stays decoupled from the
 * full service and is unit-testable with a stub binder. */
export interface SettingsScopeBinderLike {
  bind<T>(spec: SettingsScopeSpec<T>): SettingsScope<T>
}

/** Wire section this plugin owns (the Host schema's fields). */
interface QuestionNavSection {
  align?: unknown
  pageSize?: unknown
}

/** Snapshot consumed by the strip and the settings rows. */
export interface QuestionNavSettingsState {
  /** Last accepted anchor edge (default while the scope is absent/loading). */
  align: AlignPreference
  /** Last accepted page size (default while the scope is absent/loading). */
  pageSize: PageSize
  /** Whether the user layer overrides the composition default. */
  overridden: boolean
}

/** Reactive handle over the plugin's durable settings section. */
export class QuestionNavSettingsController {
  private scope: SettingsScope<QuestionNavSection> | undefined
  private readonly listeners = new Set<() => void>()
  private unsubscribe: () => void = () => {}
  private state: QuestionNavSettingsState = { align: DEFAULT_ALIGN, pageSize: DEFAULT_PAGE_SIZE, overridden: false }

  /**
   * Bind the namespace scope once the settings surface is present. Called
   * from a fiber that injects `settingsScope`, so the scope subscription
   * lives on that fiber and is released with it. A no-op after the first
   * bind.
   * @param binder - the settings scope service.
   */
  attach(binder: SettingsScopeBinderLike): void {
    if (this.scope !== undefined) return
    this.scope = binder.bind<QuestionNavSection>({ namespace: QUESTION_NAV_SETTINGS_NS })
    this.state = this.derive(this.scope.getSnapshot())
    this.unsubscribe = this.scope.subscribe(() => {
      if (this.scope === undefined) return
      const next = this.derive(this.scope.getSnapshot())
      if (next.align === this.state.align && next.pageSize === this.state.pageSize
        && next.overridden === this.state.overridden) return
      this.state = next
      for (const listener of this.listeners) listener()
    })
  }

  private derive(snapshot: SettingsScopeSnapshot<QuestionNavSection>): QuestionNavSettingsState {
    const user = snapshot.user as QuestionNavSection | undefined
    return {
      align: snapshot.status === 'ready' && isAlignPreference(snapshot.value?.align)
        ? snapshot.value.align
        : DEFAULT_ALIGN,
      pageSize: snapshot.status === 'ready' && isPageSize(snapshot.value?.pageSize)
        ? snapshot.value.pageSize
        : DEFAULT_PAGE_SIZE,
      overridden: user !== undefined && (user.align !== undefined || user.pageSize !== undefined),
    }
  }

  /** Release the scope subscription (bound on the settings fiber's lifecycle). */
  dispose(): void {
    this.unsubscribe()
    this.listeners.clear()
  }

  /** @returns the current state (stable reference until the next change). */
  getSnapshot(): QuestionNavSettingsState {
    return this.state
  }

  /** Observe state replacements; returns the disposer. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Route the user's anchor-edge choice to the Host document. */
  setAlign(align: AlignPreference): void {
    if (this.scope === undefined) return
    void this.scope.set(ALIGN_FIELD, align)
  }

  /** Route the user's page-size choice to the Host document. */
  setPageSize(pageSize: PageSize): void {
    if (this.scope === undefined) return
    void this.scope.set(PAGE_SIZE_FIELD, pageSize)
  }
}
