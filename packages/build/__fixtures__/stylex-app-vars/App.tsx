// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Reads the app's own custom properties, declared in its own CSS rather than
 * by StyleX. Their names happen to start with the product prefix (`x`): one
 * short (`--xl`), one as long as a StyleX hash (`--xlarge`). Neither is a
 * dropped declaration.
 */

import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  root: {paddingTop: 'var(--xlarge)', marginTop: 'var(--xl)'},
});

export function App() {
  return <div {...stylex.props(styles.root)}>app vars</div>;
}
