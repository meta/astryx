// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file deferredTooltip.ts
 * @input Uses Testing Library
 * @output Exports `hoverForTooltip`, which hovers a trigger whose tooltip code
 *   loads on the first intent (a Button with `tooltip`) and resolves with the
 *   tooltip layer that holds the given text, once that layer has mounted
 * @position Shared test helper. A Button's closed tooltip layer is not in the
 *   document until the first hover, focus or press on the Button.
 */

import {fireEvent, screen, waitFor} from '@testing-library/react';

export async function hoverForTooltip(
  trigger: HTMLElement,
  text: string,
): Promise<HTMLElement> {
  fireEvent.pointerEnter(trigger, {pointerType: 'mouse'});
  fireEvent.mouseEnter(trigger);
  return waitFor(() => {
    const layer = screen
      .queryAllByRole('tooltip', {hidden: true})
      .find(element => element.textContent === text);
    if (layer == null) {
      throw new Error(`no tooltip layer holds "${text}"`);
    }
    return layer;
  });
}
