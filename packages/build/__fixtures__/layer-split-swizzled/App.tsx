// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Product code beside a swizzled copy, for the layer-split build fixture. The
 * copy's folder holds the marker `astryx swizzle` writes, so its StyleX must
 * land in the library layer while this file's stays in the product layer.
 */

import * as stylex from '@stylexjs/stylex';
import {Badge} from './components/astryx/Badge/Badge';

const styles = stylex.create({
  productBox: {padding: '11px'},
});

export function App() {
  return (
    <div {...stylex.props(styles.productBox)}>
      <Badge />
    </div>
  );
}
