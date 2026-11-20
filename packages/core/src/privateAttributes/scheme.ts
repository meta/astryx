// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/scheme.ts
 * @input The scheme the root Theme draws in, when the Theme or the page names
 *   one.
 * @output `setRootScheme`, which writes it on `<html>`, and the selector text
 *   the theme engine builds a theme's color-mode blocks on.
 * @position Owner module of the private root-scheme attribute. The root Theme
 *   (theme/Theme.tsx) writes it; the theme engine (theme/) reads it. No
 *   package entry exports it.
 */

const ROOT_SCHEME = 'data-astryx-scheme';

/**
 * Marks `<html>` with the scheme the root Theme draws in, or removes the mark
 * when the reader's preference decides.
 */
export function setRootScheme(
  root: HTMLElement,
  scheme: 'light' | 'dark' | null,
): void {
  if (scheme === null) {
    root.removeAttribute(ROOT_SCHEME);
  } else {
    root.setAttribute(ROOT_SCHEME, scheme);
  }
}

/** Matches `<html>` while the root Theme names `scheme`. */
export function rootSchemeIs(scheme: 'light' | 'dark'): string {
  return `html[${ROOT_SCHEME}="${scheme}"]`;
}

/** Matches `<html>` while the root Theme names no scheme. */
export const ROOT_SCHEME_UNNAMED = `html:not([${ROOT_SCHEME}])`;
