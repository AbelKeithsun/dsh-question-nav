/**
 * Locale dictionaries for the question-nav surface (zh/en). Registered under
 * the `question-nav` namespace; keys are consumed through the bound translator.
 */
export const zh = {
  'strip.empty': '本会话还没有提问',
  'jump.inactive': '聊天视图未激活',
  'jump.hidden': '目标无独立气泡，已定位到邻近内容',
  'jump.notfound': '目标未加载或不存在（可能已压缩）',
  'jump.timeout': '加载历史超时，可重试',
} as const

export const en = {
  'strip.empty': 'No questions in this session yet',
  'jump.inactive': 'Chat view is not active',
  'jump.hidden': 'No dedicated bubble; landed on nearby content',
  'jump.notfound': 'Target not loaded or missing (maybe compacted)',
  'jump.timeout': 'Timed out loading history; retry',
} as const

export type QuestionNavKey = keyof typeof zh
