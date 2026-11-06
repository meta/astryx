// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file uikitTypography.ts
 * @input Nothing; data only
 * @output Exports `typography`: the point size of each UIKit text style at each
 *   content size category (Dynamic Type), from xSmall to AX5
 * @position Theme data: theme/dynamicType.ts scales a theme's own type scale
 *   on these curves when the reader changes their text size.
 *
 * Every row lists the twelve content size categories in order: xSmall, Small,
 * Medium, Large (the default), xLarge, xxLarge, xxxLarge, then the five
 * accessibility sizes AX1–AX5 that Larger Accessibility Sizes unlocks. A row
 * is what `UIFont.preferredFont(forTextStyle:compatibleWith:)` returns for that
 * style, and what Mobile Safari computes for the matching
 * `font: -apple-system-*` keyword (`title0` is Large Title, `title1`–`title3`
 * are Title 1–3).
 *
 * Only the styles a theme role scales on are listed (theme/dynamicType.ts maps
 * each raw font-size step to one of them).
 *
 * Every row carries one or more `@source`: Apple's documentation, a WWDC
 * session, WebKit's own source, or a measurement naming its subject, the iOS
 * version and the date. dynamicType.test.ts enforces it.
 *
 * SYNC: When modified, update /packages/core/src/theme/dynamicType.ts
 */

export const typography = {
  /**
   * Large Title, in points per content size category (xSmall … AX5).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIFont.preferredFont(forTextStyle:compatibleWith:) at
   *   each content size category, Oct 23 2026
   * @source measured: Mobile Safari, iOS 26.2 simulator, iPhone 17 Pro,
   *   computed font-size of `font: -apple-system-title0` at each category,
   *   Oct 24 2026
   * @source apple-docs https://developer.apple.com/design/human-interface-guidelines/typography
   */
  largeTitle: [31, 32, 33, 34, 36, 38, 40, 44, 48, 52, 56, 60],
  /**
   * Title 1, in points per content size category (xSmall … AX5).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIFont.preferredFont(forTextStyle:compatibleWith:) at
   *   each content size category, Oct 23 2026
   * @source measured: Mobile Safari, iOS 26.2 simulator, iPhone 17 Pro,
   *   computed font-size of `font: -apple-system-title1` at each category,
   *   Oct 24 2026
   * @source apple-docs https://developer.apple.com/design/human-interface-guidelines/typography
   */
  title1: [25, 26, 27, 28, 30, 32, 34, 38, 43, 48, 53, 58],
  /**
   * Title 2, in points per content size category (xSmall … AX5).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIFont.preferredFont(forTextStyle:compatibleWith:) at
   *   each content size category, Oct 23 2026
   * @source measured: Mobile Safari, iOS 26.2 simulator, iPhone 17 Pro,
   *   computed font-size of `font: -apple-system-title2` at each category,
   *   Oct 24 2026
   * @source apple-docs https://developer.apple.com/design/human-interface-guidelines/typography
   */
  title2: [19, 20, 21, 22, 24, 26, 28, 34, 39, 44, 50, 56],
  /**
   * Title 3, in points per content size category (xSmall … AX5).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIFont.preferredFont(forTextStyle:compatibleWith:) at
   *   each content size category, Oct 23 2026
   * @source measured: Mobile Safari, iOS 26.2 simulator, iPhone 17 Pro,
   *   computed font-size of `font: -apple-system-title3` at each category,
   *   Oct 24 2026
   * @source apple-docs https://developer.apple.com/design/human-interface-guidelines/typography
   */
  title3: [17, 18, 19, 20, 22, 24, 26, 31, 37, 43, 49, 55],
  /**
   * Body, in points per content size category (xSmall … AX5). Every
   * category has its own Body size, so Body alone identifies the category.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIFont.preferredFont(forTextStyle:compatibleWith:) at
   *   each content size category, Oct 23 2026
   * @source measured: Mobile Safari, iOS 26.2 simulator, iPhone 17 Pro,
   *   computed font-size of `font: -apple-system-body` at each category,
   *   Oct 24 2026
   * @source apple-docs https://developer.apple.com/design/human-interface-guidelines/typography
   */
  body: [14, 15, 16, 17, 19, 21, 23, 28, 33, 40, 47, 53],
  /**
   * Footnote, in points per content size category (xSmall … AX5).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIFont.preferredFont(forTextStyle:compatibleWith:) at
   *   each content size category, Oct 23 2026
   * @source measured: Mobile Safari, iOS 26.2 simulator, iPhone 17 Pro,
   *   computed font-size of `font: -apple-system-footnote` at each category,
   *   Oct 24 2026
   * @source apple-docs https://developer.apple.com/design/human-interface-guidelines/typography
   */
  footnote: [12, 12, 12, 13, 15, 17, 19, 23, 27, 33, 38, 44],
  /**
   * Caption 1, in points per content size category (xSmall … AX5).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIFont.preferredFont(forTextStyle:compatibleWith:) at
   *   each content size category, Oct 23 2026
   * @source measured: Mobile Safari, iOS 26.2 simulator, iPhone 17 Pro,
   *   computed font-size of `font: -apple-system-caption1` at each category,
   *   Oct 24 2026
   * @source apple-docs https://developer.apple.com/design/human-interface-guidelines/typography
   */
  caption1: [11, 11, 11, 12, 14, 16, 18, 22, 26, 32, 37, 43],
  /**
   * Caption 2, in points per content size category (xSmall … AX5).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIFont.preferredFont(forTextStyle:compatibleWith:) at
   *   each content size category, Oct 23 2026
   * @source measured: Mobile Safari, iOS 26.2 simulator, iPhone 17 Pro,
   *   computed font-size of `font: -apple-system-caption2` at each category,
   *   Oct 24 2026
   * @source apple-docs https://developer.apple.com/design/human-interface-guidelines/typography
   */
  caption2: [11, 11, 11, 11, 13, 15, 17, 20, 24, 29, 34, 40],
} as const;
