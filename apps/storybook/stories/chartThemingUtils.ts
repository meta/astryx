// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useLayoutEffect, useState} from 'react';

/** Resolve a concrete CSS length before passing it to a numeric renderer API. */
function cssLengthToPixels(value: string): number {
  if (typeof document === 'undefined' || !document.body) {
    return 0;
  }

  const probe = document.createElement('div');
  probe.style.blockSize = '0';
  probe.style.inlineSize = value;
  probe.style.pointerEvents = 'none';
  probe.style.position = 'fixed';
  probe.style.visibility = 'hidden';
  if (!probe.style.inlineSize) {
    return 0;
  }

  document.body.appendChild(probe);
  const pixels = probe.getBoundingClientRect().width;
  probe.remove();
  return Number.isFinite(pixels) ? pixels : 0;
}

export function useCssLengthInPixels(value: string): number {
  const [pixels, setPixels] = useState(0);

  // Measure the hidden probe's laid-out inline size before the renderer paints.
  useLayoutEffect(() => {
    setPixels(cssLengthToPixels(value));
  }, [value]);

  return pixels;
}
