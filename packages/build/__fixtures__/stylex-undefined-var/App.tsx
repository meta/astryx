// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Reads a plain `.stylex.ts` export as if it were a token. The build must fail
 * and name the variable rather than ship a declaration every browser drops.
 */

import * as stylex from '@stylexjs/stylex';
import {plainTokens} from './plainTokens.stylex';

const styles = stylex.create({
  root: {rowGap: plainTokens.gap},
});

export function App() {
  return <div {...stylex.props(styles.root)}>gap</div>;
}
