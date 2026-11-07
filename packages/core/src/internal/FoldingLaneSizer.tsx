// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FoldingLaneSizer.tsx
 * @input The extra width foldable content asks its Toolbar lane for
 * @output FoldingLaneSizer, an empty element that adds that width to the
 *   lane's preferred width and nothing to its minimum
 * @position Internal to Core: OverflowList and TabList render it after their
 *   root while they are a direct child of a Toolbar lane. Not exported.
 */

import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  sizer: {
    // A grid track sized `minmax(0, width)` asks for its width at the lane's
    // widest and for nothing at its narrowest. That lets a Toolbar that sizes
    // to its content still show every item, while a narrow Toolbar can fold.
    display: 'grid',
    gridTemplateColumns: 'minmax(0, var(--_folding-lane-sizer-width))',
    // A flex item that cannot grow gives its intrinsic width up to its zero
    // basis, so it grows by a negligible share instead.
    flexGrow: 0.0001,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    height: 0,
    overflow: 'hidden',
    visibility: 'hidden',
    // Takes back the lane gap before it, so the lane's spacing is unchanged.
    marginInlineStart: 'calc(-1 * var(--_toolbar-lane-gap, 0px))',
  },
  width: (px: number) => ({'--_folding-lane-sizer-width': `${px}px`}),
});

/** @internal Adds `width` to the surrounding Toolbar lane's preferred width. */
export function FoldingLaneSizer({width}: {width: number}) {
  return (
    <span
      aria-hidden="true"
      {...stylex.props(styles.sizer, styles.width(Math.max(0, width)))}
    />
  );
}
