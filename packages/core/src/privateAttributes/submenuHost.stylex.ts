// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/submenuHost.stylex.ts
 * @input StyleX and the submenu host data attribute
 * @output The marker and layout style for a menu's surface host
 * @position Owner module of the private submenu-host attribute. Menu-family
 * components spread these exports; no package entry exports them.
 */

import * as stylex from '@stylexjs/stylex';

/** Marks the sibling where submenu surfaces and disabled explanations render. */
export const submenuHostProps = {'data-astryx-submenu-host': ''} as const;

const styles = stylex.create({
  root: {
    // The host owns no box, so adding it does not change the menu layout.
    display: 'contents',
  },
});

export const submenuHostStyles = styles.root;
