// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MediaTokens.tsx
 * @input A media side and the content
 * @output Exports `MediaTokens`: the content with that side's tokens
 * @position Internal to Core, not exported from the package. A surface whose
 *   own text color is a theme target, such as the tooltip, wraps content in
 *   it. It imports no theme resolver, so the wrapper adds little code.
 */

import type {ReactElement, ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {dataAttr} from '../naming';

const styles = stylex.create({
  root: {
    display: 'contents',
  },
});

/**
 * A media side's tokens without MediaTheme's text color. Children that read
 * tokens, such as `Text`, take the side's values, and inherited text keeps
 * the color of the surface around it.
 */
export function MediaTokens({
  mode,
  children,
}: {
  mode: 'dark' | 'light' | 'off';
  children: ReactNode;
}): ReactElement {
  return (
    <div
      {...(mode === 'off' ? null : {[dataAttr('media')]: mode})}
      {...stylex.props(styles.root)}>
      {children}
    </div>
  );
}
