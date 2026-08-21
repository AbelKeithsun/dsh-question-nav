/**
 * Standalone tsdown config for the dsh-question-nav plugin.
 *
 * Uses the vendored client-bundle preset (tsdown.client.ts — closure-factory
 * artifact for window.__ModuleLoader__, CSS Modules inlined, externals
 * resolved through the loader module table). The node half builds from src
 * (tsdown compiles TS directly) and types ship from lib/types (tsc).
 */
import { clientBundle } from './tsdown.client.ts'

export default clientBundle('dsh-question-nav', ['src/index.ts'])
