// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file theme/MediaDarkPage.tsx
 * @input The media side a surface takes on a dark page, or null, and children
 * @output A box-less wrapper that names that side, so a dark page draws the
 *   children on it before any script measures the surface
 * @position Internal; Toast renders it inside its MediaTheme. Not exported
 *   from the theme barrel.
 */

import * as stylex from '@stylexjs/stylex';
import type {ReactNode} from 'react';
import {colorVars} from './tokens.stylex';
import {mediaDarkPageAttribute} from '../privateAttributes/mediaDarkPage';

const styles = stylex.create({
  // Draws no box. Its text color follows the side's own tokens, which the
  // theme writes on this element for a dark page.
  root: {
    display: 'contents',
    color: colorVars['--color-text-primary'],
  },
});

/** Names the side the children's surface takes on a dark page. */
export function MediaDarkPage({
  side,
  children,
}: {
  side: 'dark' | 'light' | null;
  children: ReactNode;
}): React.ReactElement {
  return (
    <div
      {...(side != null ? mediaDarkPageAttribute(side) : null)}
      {...stylex.props(styles.root)}>
      {children}
    </div>
  );
}
