// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useLayoutEffect, type RefObject} from 'react';

/**
 * Publishes the rendered height of the AppShell header that contains `ref` as
 * `--appshell-header-height` on the root element, and keeps it current as the
 * header resizes (for example when the canary banner is dismissed).
 *
 * The docsite positions page chrome against that variable: the home hero's nav
 * backdrop and pinned layers, and the docs table of contents. AppShell only
 * measures its header into a private custom property, so the docsite measures
 * the whole header itself, banner included. Unmounting restores the `:root`
 * seed in globals.css.
 */
export function useAppShellHeaderHeight(
  ref: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    // A nav rendered into AppShell's mobile drawer sits outside the header,
    // so there is nothing to measure.
    const header = ref.current?.closest('.astryx-app-shell-header');
    if (header == null) {
      return;
    }
    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty(
        '--appshell-header-height',
        `${header.getBoundingClientRect().height}px`,
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--appshell-header-height');
    };
  }, [ref]);
}
