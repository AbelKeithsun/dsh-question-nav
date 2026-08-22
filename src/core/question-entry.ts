/**
 * One user question recorded by the `questionIndex` session projection.
 * Shared by the host fold (src/projection.ts) and the browser strip — the
 * wire value is an array of these entries, in seq order.
 */
export interface QuestionEntry {
  /** Turn that claimed this question (turn/start the event followed). */
  turn: number
  /** UserMessage id; the client derives the chat anchor key from it. */
  id: string
  /** Event seq of the user/message event (ordering + jump anchor seq). */
  seq: number
  /** Unix ms timestamp of the question. */
  time: number
  /** First text block of the question (hover tooltip body). */
  text: string
}
