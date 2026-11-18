// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tooltipDescription.ts
 * @input The document a test rendered one tooltip into
 * @output getTooltipDescription — the element that describes the tooltip's
 *   trigger; getTooltip; tooltipTextOnHover — the text a trigger's tooltip
 *   shows when the pointer rests on it
 * @position Test helper for suites that read a tooltip's description
 */

import {waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect} from 'vitest';

/**
 * Returns every tooltip description in the document: the visually hidden
 * copy of a tooltip's text that its trigger's `aria-describedby` names,
 * rendered with the trigger whether or not the tooltip has shown.
 */
export function getTooltipDescriptions(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('span[hidden][id$="-description"]'),
  );
}

/**
 * Returns the element a tooltip's trigger names in `aria-describedby`.
 * Throws unless exactly one such element is in the document.
 */
export function getTooltipDescription(): HTMLElement {
  const found = getTooltipDescriptions();
  if (found.length !== 1) {
    throw new Error(
      `expected one tooltip description in the document, found ${found.length}`,
    );
  }
  return found[0];
}

/**
 * Returns the one tooltip in the document: its layer once it has shown, or
 * else its description, which holds the same text. Throws unless the
 * document holds exactly one.
 */
export function getTooltip(): HTMLElement {
  const layers = Array.from(
    document.querySelectorAll<HTMLElement>('[role="tooltip"]'),
  );
  if (layers.length > 1) {
    throw new Error(
      `expected one tooltip in the document, found ${layers.length}`,
    );
  }
  return layers[0] ?? getTooltipDescription();
}

/**
 * Rests the pointer on `trigger` until its tooltip mounts, then moves it
 * away, and returns the tooltip's text. A tooltip that repeats its trigger's
 * name renders no description, so a test reads it this way.
 */
export async function tooltipTextOnHover(
  trigger: HTMLElement,
): Promise<string> {
  const before = new Set(document.querySelectorAll('[role="tooltip"]'));
  await userEvent.hover(trigger);
  const text = await waitFor(() => {
    const mounted = Array.from(
      document.querySelectorAll<HTMLElement>('[role="tooltip"]'),
    ).find(tooltip => !before.has(tooltip));
    expect(mounted).toBeDefined();
    return mounted?.textContent ?? '';
  });
  await userEvent.unhover(trigger);
  return text;
}
