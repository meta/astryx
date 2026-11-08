// Copyright (c) Meta Platforms, Inc. and affiliates.

/** A copy `astryx swizzle` wrote, for the layer-split build fixture. */

import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  badge: {padding: '13px', backgroundColor: 'rgb(10, 11, 12)'},
});

export function Badge() {
  return <span {...stylex.props(styles.badge)}>copy</span>;
}
