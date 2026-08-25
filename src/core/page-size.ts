/**
 * Page-size constants for the ▲/▼ paging buttons, shared by the host schema
 * and the browser settings scope. Pure data: no DSH imports, so the client
 * bundle may inline this module (a Host import here would leak into the
 * browser half).
 *
 * @module dsh-question-nav/page-size
 */

/** Selectable page sizes: how many hidden dots one ▲/▼ click reveals. */
export const PAGE_SIZE_OPTIONS = [3, 5, 8, 10] as const

/** Page-size preference (dots revealed per paging-button click). */
export type PageSize = typeof PAGE_SIZE_OPTIONS[number]

/** Default page size when the user-settings document has no override. */
export const DEFAULT_PAGE_SIZE: PageSize = 5

/** Field carrying the selected page size. */
export const PAGE_SIZE_FIELD = 'pageSize'
