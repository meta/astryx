// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focusRings.ts
 * @input A Playwright page showing a built story
 * @output `ringedElements`: every element under a root that paints an outline
 *   right now, for browser specs proving `architecture:interaction-modality`
 *   INV3 (one focus move has one owning indicator)
 * @position Shared helper for focus-ring browser specs
 */

import type {Page} from '@playwright/test';

export interface RingedElement {
  /** The element's tag, its accessible label or text, and its role. */
  readonly description: string;
  /** Whether it is the focused element itself. */
  readonly isFocused: boolean;
}

/**
 * Every element under `root` whose computed outline paints (a style other
 * than `none` and a width above zero). Read after moving focus with the
 * keyboard, so `:focus-visible` applies.
 */
export async function ringedElements(
  page: Page,
  root = '#storybook-root',
): Promise<RingedElement[]> {
  return page.evaluate(rootSelector => {
    const scope = document.querySelector(rootSelector) ?? document.body;
    const out: {description: string; isFocused: boolean}[] = [];
    for (const element of [scope, ...scope.querySelectorAll('*')]) {
      const style = getComputedStyle(element);
      if (
        style.outlineStyle === 'none' ||
        Number.parseFloat(style.outlineWidth) <= 0
      ) {
        continue;
      }
      const label =
        element.getAttribute('aria-label') ??
        (element.textContent ?? '').trim().slice(0, 30);
      out.push({
        description: `${element.tagName.toLowerCase()} "${label}"`,
        isFocused: element === document.activeElement,
      });
    }
    return out;
  }, root);
}
