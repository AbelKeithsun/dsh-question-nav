/**
 * Locale dictionaries for the question-nav surface (zh/en). Registered under
 * the `question-nav` namespace; keys are consumed through the bound translator.
 */
export const zh = {
  'strip.empty': '本会话还没有提问',
  'strip.up': '向上翻出 5 个提问圆点',
  'strip.down': '向下翻出 5 个提问圆点',
  'jump.inactive': '聊天视图未激活',
  'jump.hidden': '目标无独立气泡，已定位到邻近内容',
  'jump.notfound': '目标未加载或不存在（可能已压缩）',
  'jump.timeout': '加载历史超时，可重试',
  'settings.tab': '提问导航',
  'settings.align.title': '导航条对齐',
  'settings.align.desc': '选择圆点导航条锚定在对话栏的哪一侧。',
  'settings.align.left': '左侧',
  'settings.align.right': '右侧',
} as const

export const en = {
  'strip.empty': 'No questions in this session yet',
  'strip.up': 'Reveal 5 question dots above',
  'strip.down': 'Reveal 5 question dots below',
  'jump.inactive': 'Chat view is not active',
  'jump.hidden': 'No dedicated bubble; landed on nearby content',
  'jump.notfound': 'Target not loaded or missing (maybe compacted)',
  'jump.timeout': 'Timed out loading history; retry',
  'settings.tab': 'Question Nav',
  'settings.align.title': 'Rail alignment',
  'settings.align.desc': 'Choose which edge of the conversation column the dot rail anchors to.',
  'settings.align.left': 'Left',
  'settings.align.right': 'Right',
} as const

export type QuestionNavKey = keyof typeof zh
