// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file AnnounceRenderedText.tsx
 * @input Uses React, useAnnounceRenderedText
 * @output Exports AnnounceRenderedText (internal; not re-exported from
 *   hooks/index.ts, so it ships no public API without `spec:AST-002`)
 * @position Internal client island that lets a presentational, server-safe
 *   component announce its own content; rendered by EmptyState around its
 *   message. On the server it only renders its `div`: effects never run there.
 */

import {useRef, type HTMLAttributes} from 'react';
import {useAnnounceRenderedText} from './useAnnounceRenderedText';

/**
 * A `div` whose rendered text is announced once through the shared polite
 * live region when it appears or changes after the page loaded, and never for
 * text present when the page first rendered (`spec:AST-086` FR11).
 */
export function AnnounceRenderedText(props: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useAnnounceRenderedText(ref, true, '', {skipFirstRender: true});
  return <div ref={ref} {...props} />;
}
