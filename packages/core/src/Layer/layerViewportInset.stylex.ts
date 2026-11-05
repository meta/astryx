// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerViewportInset.stylex.ts
 * @input Uses the spacing token, the device safe-area insets, and the
 *   app-declared `--astryx-layer-inset-*` custom properties
 * @output Exports the one definition of an anchored layer's viewport gutter
 *   and the size caps derived from it
 * @position Layer runtime geometry; read by useLayer and by consumers that
 *   clamp a size of their own (spec:AST-059 FR1, FR7)
 *
 * An anchored layer keeps a gutter from each viewport edge: the spacing-4 step
 * or the device safe-area inset for that edge, whichever is larger, plus the
 * inset an app declares for a persistent bar floating over that edge. The
 * inline gutter reads the larger of the two physical safe-area insets, so a
 * layer that flips across the inline axis still clears a notch on either side.
 *
 * `defineConsts`, not plain exported strings: StyleX inlines a cross-file
 * value only through `defineVars`/`defineConsts` from a `.stylex.ts` file.
 * Nothing here is a theme variable: the gutter is geometry, not treatment.
 *
 * App declaration (once, usually on `:root`):
 *
 * ```css
 * :root { --astryx-layer-inset-block-end: var(--app-nav-bar-height, 0px); }
 * ```
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Layer/useLayer.tsx
 * - /packages/core/src/Layer/layerViewportInset.test.ts
 * - /docs/specs/AST-059-layer-viewport-inset/spec.md
 */

import * as stylex from '@stylexjs/stylex';

// `defineConsts` admits only static values, so the spacing token is named by
// its custom property rather than through `spacingVars`; it is the same
// `--spacing-4` every other gutter in core reads.
const SPACING = 'var(--spacing-4)';

const INSET_BLOCK_START = 'var(--astryx-layer-inset-block-start, 0px)';
const INSET_BLOCK_END = 'var(--astryx-layer-inset-block-end, 0px)';
const INSET_INLINE_START = 'var(--astryx-layer-inset-inline-start, 0px)';
const INSET_INLINE_END = 'var(--astryx-layer-inset-inline-end, 0px)';

const GUTTER_BLOCK_START = `calc(max(${SPACING}, env(safe-area-inset-top, 0px)) + ${INSET_BLOCK_START})`;
const GUTTER_BLOCK_END = `calc(max(${SPACING}, env(safe-area-inset-bottom, 0px)) + ${INSET_BLOCK_END})`;
const GUTTER_INLINE_LEFT = `calc(max(${SPACING}, env(safe-area-inset-left, 0px)) + ${INSET_INLINE_START})`;
const GUTTER_INLINE_RIGHT = `calc(max(${SPACING}, env(safe-area-inset-right, 0px)) + ${INSET_INLINE_END})`;
// A flipped layer may land on either inline side, so one gutter serves both
// edges: the larger safe-area inset plus the larger app inset.
const GUTTER_INLINE = `calc(max(${SPACING}, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px)) + max(${INSET_INLINE_START}, ${INSET_INLINE_END}))`;
// The positional gutter on the block axis is an inset the flip tactics mirror
// between the two edges, so one value serves both: the larger of the two.
const GUTTER_BLOCK = `calc(max(${SPACING}, env(safe-area-inset-top, 0px), env(safe-area-inset-bottom, 0px)) + max(${INSET_BLOCK_START}, ${INSET_BLOCK_END}))`;

/**
 * The viewport gutter and the caps derived from it. Every value has an
 * `env()`-less fallback for engines without safe-area support; pair them as
 * `stylex.firstThatWorks(`calc(${cap})`, `calc(${capFallback})`)`. Pass
 * each inside a `calc()` (or another function), never as a bare reference: a
 * constant reference compiles to a `var()`, and `firstThatWorks` folds two
 * `var()` arguments into one `var(cap, capFallback)` whose constant is never
 * inlined, so every engine would take the fallback.
 */
export const layerViewportInset = stylex.defineConsts({
  /** Gutter from the block-start viewport edge. */
  gutterBlockStart: GUTTER_BLOCK_START,
  /** Gutter from the block-end viewport edge. */
  gutterBlockEnd: GUTTER_BLOCK_END,
  /** Gutter from either inline viewport edge. */
  gutterInline: GUTTER_INLINE,
  /** Positional gutter from either block viewport edge: the larger of the two. */
  gutterBlock: GUTTER_BLOCK,
  gutterBlockFallback: `calc(${SPACING} + max(${INSET_BLOCK_START}, ${INSET_BLOCK_END}))`,
  gutterBlockStartFallback: `calc(${SPACING} + ${INSET_BLOCK_START})`,
  gutterBlockEndFallback: `calc(${SPACING} + ${INSET_BLOCK_END})`,
  gutterInlineFallback: `calc(${SPACING} + max(${INSET_INLINE_START}, ${INSET_INLINE_END}))`,
  /** The largest inline size a layer may take: the viewport minus both gutters. */
  maxInlineSize: `calc(100vi - ${GUTTER_INLINE_LEFT} - ${GUTTER_INLINE_RIGHT})`,
  maxInlineSizeFallback: `calc(100vw - ${SPACING} - ${SPACING} - ${INSET_INLINE_START} - ${INSET_INLINE_END})`,
  /** The largest block size a layer may take: the viewport minus both gutters. */
  maxBlockSize: `calc(100dvb - ${GUTTER_BLOCK_START} - ${GUTTER_BLOCK_END})`,
  maxBlockSizeFallback: `calc(100vh - ${SPACING} - ${SPACING} - ${INSET_BLOCK_START} - ${INSET_BLOCK_END})`,
});
