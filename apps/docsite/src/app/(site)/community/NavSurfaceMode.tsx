// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * NavSurfaceMode — paints the docsite top nav opaque for the lifetime
 * of this page.
 *
 * Why: the docsite's top nav is `position: sticky` with a transparent
 * default background, so content scrolling underneath shows through.
 * On the community page the wall card carries the dominant brand
 * mark (the bold Astryx wordmark), and seeing it half-covered by the
 * see-through nav as you scroll past reads as broken.
 *
 * Setting `data-nav-mode="surface"` on body triggers the CSS rule in
 * globals.css that paints the nav with `--color-background-surface`,
 * so the wordmark cleanly disappears under an opaque nav rather than
 * looking sliced.
 *
 * Modeled on the same scroll-based toggle in apps/docsite/src/app/(site)/HomePage.tsx,
 * but flattened to "always on" since the community page has no full-
 * viewport hero that needs the transparent nav treatment.
 */

'use client';

import {useEffect} from 'react';

export function NavSurfaceMode() {
  useEffect(() => {
    document.body.setAttribute('data-nav-mode', 'surface');
    return () => {
      document.body.removeAttribute('data-nav-mode');
    };
  }, []);
  return null;
}
