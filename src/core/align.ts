/**
 * Rail anchor-edge constants shared by the host schema and the browser
 * settings scope. Pure data: no DSH imports, so the client bundle may inline
 * this module (a Host import here would leak into the browser half).
 *
 * @module dsh-question-nav/align
 */

/** Supported rail anchor edges. */
export const ALIGN_OPTIONS = ['left', 'right'] as const

/** Rail anchor edge preference. */
export type AlignPreference = typeof ALIGN_OPTIONS[number]

/** Default anchor edge when the user-settings document has no override. */
export const DEFAULT_ALIGN: AlignPreference = 'left'

/** Settings namespace owned by this plugin (spelled here rather than
 * imported: the client bundle must not depend on a Host package). */
export const QUESTION_NAV_SETTINGS_NS = 'question-nav'

/** Field carrying the selected anchor edge. */
export const ALIGN_FIELD = 'align'
