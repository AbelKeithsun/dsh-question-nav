/**
 * Pure node-indexing logic for the question-nav plugin. No React, no DOM, no
 * Cordis — every function here is a pure transform over chat-node data so it
 * can be unit-tested in isolation (and reused by the browser half).
 */

/** One user question as shown in the strip and targeted by a jump. */
export interface QuestionNode {
  /** Chat anchor key, matches a `[data-chat-anchor-key]` row in the scrollport. */
  key: string
  /** Monotone anchor sequence for ordering and window-min detection. */
  anchorSeq: number
  /** Event seq of the user message. */
  seq: number
  /** Unix ms timestamp. */
  time: number
  /** Full question text — shown in the hover tooltip (not truncated). */
  text: string
}

/** Minimal shape a chat node must expose for indexing (structural, not SDK-bound). */
export interface ChatNodeLike {
  key: string
  anchorSeq: number
  visibility?: string
  kind?: string
  /** Kind-specific payload (a UserMessageNode for `user`/`steering`). */
  data?: unknown
}

/** Kinds counted as a user question (turn-opening and steering admissions). */
export const QUESTION_KINDS = ['user', 'steering'] as const

/** Narrow `node.data` to the user-message payload we read. */
interface UserDataLike {
  content?: readonly { type?: string; text?: string }[]
  seq?: number
  time?: number
}

function userData(data: unknown): UserDataLike | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  return data as UserDataLike
}

/** First text block of a user message; falls back to the raw first block. */
export function messageText(content: readonly { type?: string; text?: string }[] | undefined): string {
  if (content === undefined || content.length === 0) return ''
  const first = content[0]
  if (typeof first?.text === 'string') return first.text
  return ''
}

/** Extract the user questions from a chat-node window, ordered by anchorSeq. */
export function extractQuestions(nodes: Iterable<ChatNodeLike>): QuestionNode[] {
  const out: QuestionNode[] = []
  for (const node of nodes) {
    if (!QUESTION_KINDS.includes(node.kind as (typeof QUESTION_KINDS)[number])) continue
    const payload = userData(node.data)
    out.push({
      key: node.key,
      anchorSeq: node.anchorSeq,
      seq: payload?.seq ?? -1,
      time: payload?.time ?? 0,
      // Full question text: shown in the hover tooltip (not truncated).
      text: messageText(payload?.content),
    })
  }
  out.sort((a, b) => a.anchorSeq - b.anchorSeq)
  return out
}

/** Whether a node is actually rendered (visible rows only are scroll targets). */
export function isRenderable(node: ChatNodeLike): boolean {
  return node.visibility !== 'hidden'
}

/** The row of the window that renders the given key (exact match). */
export function findQuestionRow(nodes: Iterable<ChatNodeLike>, key: string): ChatNodeLike | null {
  for (const node of nodes) {
    if (node.key === key) return node
  }
  return null
}

/** Nearest renderable row for a key that is absent or hidden (compaction, windowing). */
export function nearestRenderable(
  nodes: Iterable<{ key: string; anchorSeq: number; visibility?: string }>,
  excludeKey: string | undefined,
): { key: string; anchorSeq: number } | null {
  let best: { key: string; anchorSeq: number } | null = null
  for (const node of nodes) {
    if (node.visibility === 'hidden') continue
    if (node.key === excludeKey) continue
    if (best === null || node.anchorSeq < best.anchorSeq) best = { key: node.key, anchorSeq: node.anchorSeq }
  }
  return best
}
