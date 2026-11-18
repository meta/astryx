// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file theme/MediaDarkPage.tsx
 * @input The media side a surface takes on a dark page, or null, and children
 * @output A provider the nearest MediaTheme inside reads, which then names
 *   that side beside its own, so a dark page draws the surface on it before
 *   any script measures it
 * @position Internal; Toast renders it around its MediaTheme. Not exported
 *   from the theme barrel.
 */

import type {ReactNode} from 'react';
import {use} from 'react';
import {createSharedContext} from '../utils/sharedContext';
import {mediaDarkPageAttribute} from '../privateAttributes/mediaDarkPage';

const MediaDarkPageContext = createSharedContext<'dark' | 'light' | null>(
  'MediaDarkPageContext',
  1,
  null,
);

/** Names the side the MediaTheme inside takes on a dark page. */
export function MediaDarkPage({
  side,
  children,
}: {
  side: 'dark' | 'light' | null;
  children: ReactNode;
}): React.ReactElement {
  return <MediaDarkPageContext value={side}>{children}</MediaDarkPageContext>;
}

/** For MediaTheme: the attribute naming its dark-page side, or null. */
export function useMediaDarkPageAttribute(): Record<string, string> | null {
  const side = use(MediaDarkPageContext);
  return side == null ? null : mediaDarkPageAttribute(side);
}
