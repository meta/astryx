// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Show a decorative preview that the build rendered to static HTML.
 * @input A preview id: 'themes-store', the themes card store.
 * @output The preview markup as server HTML. It follows the page's light or
 *   dark mode through CSS variables.
 * @position Client boundary whose only data is the id. The server render
 *   reads the markup from the generated map; the browser bundle gets an
 *   empty map (next.config.mjs), so the markup is not sent a second time in
 *   the page's RSC payload or scripts.
 */

'use client';

import {useEffect, useRef, useState, type CSSProperties} from 'react';
import {LANDING_PREVIEWS} from '@/generated/landingPreviews';
import styles from './FrozenPreview.module.css';

// A client-side navigation to the homepage has no server HTML. The generate
// step writes the same markup to this file for that case.
// SYNC: CLIENT_NAVIGATION_URL in scripts/generate-landing-template-previews.mjs
const CLIENT_NAVIGATION_URL = '/landing-previews.json';

let clientNavigationPreviews: Promise<Record<string, string>> | null = null;

function loadClientNavigationPreviews(): Promise<Record<string, string>> {
  clientNavigationPreviews ??= fetch(CLIENT_NAVIGATION_URL)
    .then(response => (response.ok ? response.json() : {}))
    .catch(() => ({}));
  return clientNavigationPreviews;
}

export function FrozenPreview({
  id,
  className,
  style,
}: {
  id: string;
  /** Styles for the element that holds the snapshot, so it can be the
   *  caller's own layout box instead of an extra wrapper. */
  className?: string;
  style?: CSSProperties;
}) {
  if (typeof window === 'undefined' && LANDING_PREVIEWS[id] == null) {
    throw new Error(
      `No landing preview "${id}". scripts/generate-landing-template-previews.mjs renders them.`,
    );
  }
  // In the browser the map is empty, so hydration keeps the server HTML: a
  // dangerouslySetInnerHTML mismatch does not replace the element's content.
  const [html, setHtml] = useState(() => LANDING_PREVIEWS[id] ?? '');
  const hostRef = useRef<HTMLDivElement>(null);

  // Effect: syncs the preview with the generated file after a client-side
  // navigation, the only case in which the server HTML is missing.
  useEffect(() => {
    if (hostRef.current?.firstChild != null) {
      return;
    }
    let isCurrent = true;
    void loadClientNavigationPreviews().then(previews => {
      if (isCurrent) {
        setHtml(previews[id] ?? '');
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [id]);

  return (
    <div
      ref={hostRef}
      className={[styles.snapshot, className].filter(Boolean).join(' ')}
      style={style}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{__html: html}}
    />
  );
}
