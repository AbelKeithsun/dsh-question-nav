/**
 * The plugin's settings page inside the shell's Plugins section
 * (`settings.plugins.tab`): two segmented controls — which edge of the
 * conversation column the dot rail anchors to, and how many hidden dots one
 * ▲/▼ paging-button click reveals. The choices are written to the
 * `question-nav` settings namespace (registered by the host half); the strip
 * re-anchors and re-steps live when the snapshot changes.
 *
 * @module dsh-question-nav/client/settings-tab
 */

import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings shell's SlotMap merge ('settings.plugins.tab').
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { ALIGN_OPTIONS } from '../core/align.ts'
import { PAGE_SIZE_OPTIONS } from '../core/page-size.ts'
import type { QuestionNavInjected } from './QuestionNavStrip.tsx'
import type { QuestionNavKey } from './locales.ts'
import styles from './question-nav.module.css'

type ComponentProps = PropsRuntime<'settings.plugins.tab'> & QuestionNavInjected & PropsLocale<'question-nav'>

/** Re-render on settings snapshot changes (the register inject face is static). */
function useSettingsTick(subscribe: QuestionNavInjected['subscribeSettings']): void {
  const [, bump] = useState(0)
  useEffect(() => subscribe(() => bump((n) => n + 1)), [subscribe])
}

export function QuestionNavSettingsTab(props: ComponentProps): React.JSX.Element | null {
  useSettingsTick(props.subscribeSettings)
  const align = props.align()
  const pageSize = props.pageSize()
  const t = props.t

  return (
    <div className={styles.settings}>
      <p className={styles.settingsTitle}>{t('settings.align.title')}</p>
      <p className={styles.settingsDesc}>{t('settings.align.desc')}</p>
      <div className={styles.segmented} role="radiogroup" aria-label={t('settings.align.title')}>
        {ALIGN_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={align === option}
            className={align === option ? `${styles.segment} ${styles.segmentActive}` : styles.segment}
            onClick={() => props.setAlign(option)}
          >
            {t(option === 'left' ? 'settings.align.left' : 'settings.align.right')}
          </button>
        ))}
      </div>
      <p className={styles.settingsTitle}>{t('settings.pagesize.title')}</p>
      <p className={styles.settingsDesc}>{t('settings.pagesize.desc')}</p>
      <div className={styles.segmented} role="radiogroup" aria-label={t('settings.pagesize.title')}>
        {PAGE_SIZE_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={pageSize === option}
            className={pageSize === option ? `${styles.segment} ${styles.segmentActive}` : styles.segment}
            onClick={() => props.setPageSize(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}
