/**
 * Host-side durable settings for the question-nav plugin, registered into the
 * DSH user-settings document. Two fields: which edge of the conversation
 * column the rail anchors to (`align`) and how many hidden dots one ▲/▼
 * paging-button click reveals (`pageSize`). The browser half reads the same
 * namespace through the settings scope (`ctx.settingsScope.bind`) and routes
 * the user's choice back through `scope.set`.
 *
 * @module dsh-question-nav/settings
 */

import z from '@deepseek-ai/schemastery'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  ALIGN_FIELD, ALIGN_OPTIONS, DEFAULT_ALIGN, QUESTION_NAV_SETTINGS_NS,
  type AlignPreference,
} from './core/align.ts'
import {
  DEFAULT_PAGE_SIZE, PAGE_SIZE_FIELD, PAGE_SIZE_OPTIONS,
  type PageSize,
} from './core/page-size.ts'

/** Durable settings section shared by the Host schema and the browser scope. */
export interface QuestionNavSettings {
  /** Anchor edge of the rail. */
  align: AlignPreference
  /** Dots revealed per ▲/▼ paging-button click. */
  pageSize: PageSize
}

/** Durable settings schema; also the wire envelope the browser scope validates against. */
export const QuestionNavSettingsSchema: z<QuestionNavSettings> = z.object({
  [ALIGN_FIELD]: z.union([...ALIGN_OPTIONS]).default(DEFAULT_ALIGN),
  [PAGE_SIZE_FIELD]: z.union([...PAGE_SIZE_OPTIONS]).default(DEFAULT_PAGE_SIZE),
})

/** The settings namespace this plugin owns, branded for the Host registry.
 * `question-nav` matches the registry pattern (`^[a-z][a-z0-9-]*$`), so the
 * constant needs no runtime validator — keeping this module type-only on the
 * settings package avoids inlining it (and cosmokit) into the host bundle. */
export const questionNavSettingsNamespace = QUESTION_NAV_SETTINGS_NS as SettingsNamespace
