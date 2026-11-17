// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/appShellUnread.stylex.ts
 * @input The mobile breakpoint width of an AppShell that has not read the
 *   window yet
 * @output unreadShellProps, unreadWideOnlyProps and unreadWidthStyle
 * @position Owner module of AppShell's private unread attribute: the only
 *   file that writes its name or its rule. AppShell spreads the
 *   props and renders the style while its server-rendered wide layout can be
 *   on a narrow screen. No public entry exports it.
 */

import {createElement, type ReactElement} from 'react';

/**
 * Set only while the shell has not read the window, and always with the
 * breakpoint width: `shell-<width>` on the root, `wide-only-<width>` on a part
 * of the wide layout that the phone layout does not show. The width in each
 * value keeps a rule for one width away from a shell with another.
 */
const UNREAD = 'data-astryx-app-shell-unread';

/** Props for the root of a shell that has not read the window yet. */
export function unreadShellProps(width: number): Record<string, string> {
  return {[UNREAD]: `shell-${width}`};
}

/** Props for a part of the wide layout that the phone layout does not show. */
export function unreadWideOnlyProps(width: number): Record<string, string> {
  return {[UNREAD]: `wide-only-${width}`};
}

/**
 * The rule that makes an unread shell's wide layout paint as the phone layout
 * below `width`, before any script runs. A media query cannot read a custom
 * property, so the width is in the rule's text. React hoists the element into
 * the document head and keeps one copy per width. The rule stops applying
 * when the shell drops the attribute after it reads the window.
 */
export function unreadWidthStyle(width: number): ReactElement {
  return createElement(
    'style',
    {href: `astryx-app-shell-unread-${width}`, precedence: 'astryx-app-shell'},
    `@media (width < ${width}px) {` +
      `[${UNREAD}="wide-only-${width}"] { display: none; }` +
      `[${UNREAD}="shell-${width}"] { --_app-shell-page-corner: 0px; }` +
      `}`,
  );
}
