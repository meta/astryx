// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tooltipLayer.ts
 * @input Testing Library
 * @output Exports hoverTooltipLayer
 * @position Test helper. A Button or Link tooltip mounts its layer on the
 *   first hover, tap or focus, so a test that inspects the layer hovers the
 *   trigger first.
 */

import {expect} from 'vitest';
import {fireEvent, screen, waitFor} from '@testing-library/react';

/** Hovers `trigger` and returns its mounted tooltip layer holding `text`. */
export async function hoverTooltipLayer(
  trigger: HTMLElement,
  text: string,
): Promise<HTMLElement> {
  fireEvent.pointerEnter(trigger, {pointerType: 'mouse'});
  fireEvent.mouseEnter(trigger);
  let layer: HTMLElement | undefined;
  await waitFor(
    () => {
      layer = screen
        .getAllByRole('tooltip', {hidden: true})
        .find(element => element.textContent === text);
      expect(layer).toBeDefined();
    },
    {timeout: 5000},
  );
  return layer!;
}
