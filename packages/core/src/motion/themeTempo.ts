// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeTempo.ts
 * @input An element on the page
 * @output `themeTempo(element)`: the tempo of the theme the element is in
 * @position Motion foundation; resolveMotion.ts scales a motion role by it,
 *   and the pager scales its settle by it, which no role names
 *
 * A theme that sets `tempo` writes it, clamped, to the private custom
 * property `--_astryx-motion-tempo` beside its duration tokens. An
 * adaptation rule writes it where its condition holds, and a nested theme
 * that sets no tempo inherits it. A layer whose durations come from a
 * duration scale writes a tempo of 1, so its springs keep its own pace. One
 * read of a custom property forces no layout.
 * Nothing here imports a theme module, runs on import or runs on the server.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/themeTempo.test.ts
 * - /packages/core/src/theme/themeMotion.ts (writes the property)
 */

/** The property a theme that sets `tempo` writes (theme/themeMotion.ts). */
const TEMPO_PROPERTY = '--_astryx-motion-tempo';

/**
 * The tempo motion on `element` plays at: the one its theme or an adaptation
 * rule sets, else 1. Without an element in a document, or with a value that
 * is not a positive number, it is 1.
 */
export function themeTempo(element: Element | null | undefined): number {
  const view = element?.ownerDocument?.defaultView;
  if (element == null || view == null) {
    return 1;
  }
  const text = view
    .getComputedStyle(element)
    .getPropertyValue(TEMPO_PROPERTY)
    .trim();
  const tempo = text === '' ? Number.NaN : Number(text);
  return Number.isFinite(tempo) && tempo > 0 ? tempo : 1;
}
