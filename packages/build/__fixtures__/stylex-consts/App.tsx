// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Reads `defineConsts` values from other files, as a media-query key and as a
 * plain value, from both sides of the layer split and from a file compiled
 * with the library class-name prefix. Only the constants are
 * imported: once StyleX compiles `stylex.create`, nothing in this file uses
 * the imports at runtime any more.
 */

import * as stylex from '@stylexjs/stylex';
import {appConsts} from './appConsts.stylex';
import {libraryConsts} from './library/libraryConsts.stylex';
import {packageConsts} from './packages/core/packageConsts.stylex';

const styles = stylex.create({
  row: {
    minHeight: appConsts.rowHeight,
    transitionProperty: {default: 'color', [appConsts.narrow]: 'none'},
  },
  panel: {
    paddingTop: libraryConsts.inset,
    paddingBottom: packageConsts.gap,
    maxWidth: {default: null, [libraryConsts.wide]: '640px'},
  },
});

export function App() {
  return (
    <div {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.row)}>row</div>
    </div>
  );
}
