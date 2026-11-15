// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeTimingBundle.ts
 * @input themeTiming.ts and the press release clock that reads it
 * @output Re-exports them as one entry point
 * @position The esbuild entry the theme-timing proof bundles into its page
 *   (global `ThemeTiming`), and the type of that global
 */

export {readThemeTiming, readThemeTokens, resolveTiming} from '../themeTiming';
export {pressFadeMs} from '../../utils/pressFeedback';
