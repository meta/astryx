// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file privateAttributes/nestedPress.stylex.ts
 * @input A clickable container, and a press that starts on an interactive
 *   element inside it
 * @output markNestedPress, which marks the container for that press, and
 *   nestedPressStyles, the containers' press overlay colour, which shows no
 *   mouse press while the mark is on
 * @position Owner module of the private nested-press attribute: the only
 *   file that writes its name. useClickableContainer marks its container in
 *   its pointerdown callback; ClickableCard and SelectableCard paint with
 *   nestedPressStyles. No package entry exports it.
 */

import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import {subscribeInput} from '../utils/inputStream';

const NESTED_PRESS = 'data-astryx-nested-press';

/**
 * Marks `container` until the press ends. A browser applies `:active` to
 * every ancestor of the pressed element, so the container's mouse press arm
 * reads the mark to stay at rest.
 */
export function markNestedPress(container: HTMLElement): void {
  const view = container.ownerDocument.defaultView;
  if (view == null) {
    return;
  }
  container.setAttribute(NESTED_PRESS, '');
  const stops = [
    subscribeInput(view, 'pointerup', unmark),
    subscribeInput(view, 'pointercancel', unmark),
  ];
  function unmark() {
    container.removeAttribute(NESTED_PRESS);
    for (const stop of stops) {
      stop();
    }
  }
}

export const nestedPressStyles = stylex.create({
  /**
   * The colour of a clickable card's hover and mouse press overlay, which
   * the card's `::after` paints. A mouse press that starts on an interactive
   * element inside the card does not activate the card, so the card shows
   * no press for it.
   */
  cardPressOverlay: {
    '--_press-overlay': {
      default: 'transparent',
      ':where(:not(:disabled,[aria-disabled="true"]))': {
        default: null,
        ':active:not([data-astryx-nested-press])': {
          default: colorVars['--color-overlay-pressed'],
          '@media (pointer: coarse)': 'transparent',
        },
        '@media (hover: hover)': {
          default: null,
          ':hover:where(:not(:disabled,[aria-disabled="true"]))':
            colorVars['--color-overlay-hover'],
          ':active:not([data-astryx-nested-press])':
            colorVars['--color-overlay-pressed'],
        },
      },
    },
  },
});
