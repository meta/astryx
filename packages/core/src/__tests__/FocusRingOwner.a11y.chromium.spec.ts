// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/(Item|Token|ClickableCard|SelectableCard|Thumbnail|Selector|MultiSelector)/ ^packages/core/src/utils/focusOutline ^apps/storybook/stories/(Item|Token|ClickableCard|SelectableCard|Thumbnail|Selector|MultiSelector)

/**
 * @file FocusRingOwner.a11y.chromium.spec.ts
 * @input The built Item "With End Actions", Token "Clickable With Remove",
 *   ClickableCard "Nested Interactive Elements", SelectableCard "With
 *   Nested Button", Thumbnail "With Remove", and ghost and secondary
 *   Selector and MultiSelector "Clearable" stories in real Chromium, focus moved with Tab, at desktop and phone
 *   widths
 * @output Browser evidence for `architecture:interaction-modality` INV3: each
 *   tab stop in a row, token or card shows exactly one focus ring. A wrapper
 *   rings for its own action only; a control inside it (an end action, a
 *   remove button, a button in a card) rings itself, and the wrapper stays
 *   unringed
 * @position Regression proof for focusWithinOwner in Item, Token,
 *   ClickableCard, SelectableCard, Thumbnail, Selector and MultiSelector
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {ringedElements} from './focusRings';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

async function open(page: Page, story: string, width: number, args = '') {
  await page.setViewportSize({width, height: 600});
  await page.goto(
    `${storybook.origin}/iframe.html?id=${story}&viewMode=story${args}`,
  );
  await page
    .locator('#storybook-root button, #storybook-root a')
    .first()
    .waitFor();
}

/** Tabs through every stop, returning the rings painted at each. */
async function ringsAtEachStop(page: Page, stops: number) {
  const out: {focused: string; rings: string[]}[] = [];
  for (let i = 0; i < stops; i += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(
      () =>
        document.activeElement?.getAttribute('aria-label') ??
        (document.activeElement?.textContent ?? '').trim().slice(0, 30),
    );
    const rings = (await ringedElements(page)).map(ring => ring.description);
    out.push({focused, rings});
  }
  return out;
}

for (const width of [1280, 390]) {
  test(`at ${width} px, each tab stop in an Item shows one ring`, async ({
    page,
  }) => {
    await open(page, 'core-item--with-end-actions', width);
    // The first row's action, its Share button, then the second row's
    // Restore button (that row has no action).
    for (const {focused, rings} of await ringsAtEachStop(page, 3)) {
      expect(rings, `rings while "${focused}" is focused`).toHaveLength(1);
    }
  });

  test(`at ${width} px, a numbered row's own action shows its ring`, async ({
    page,
  }) => {
    await open(page, 'core-item--numbered-with-actions', width);
    // The button row, then the link row: each rings once, beside its marker.
    for (const {focused, rings} of await ringsAtEachStop(page, 2)) {
      expect(rings, `rings while "${focused}" is focused`).toHaveLength(1);
    }
  });

  test(`at ${width} px, a Token inside an Item rings itself, not the row`, async ({
    page,
  }) => {
    await open(page, 'core-item--with-token-action', width);
    // The row's own action, then the Token's: one ring at each.
    for (const {focused, rings} of await ringsAtEachStop(page, 2)) {
      expect(rings, `rings while "${focused}" is focused`).toHaveLength(1);
    }
  });

  test(`at ${width} px, each tab stop in a Token shows one ring`, async ({
    page,
  }) => {
    await open(page, 'core-token--clickable-with-remove', width);
    // Design, Remove Design, Docs, Remove Docs.
    for (const {focused, rings} of await ringsAtEachStop(page, 4)) {
      expect(rings, `rings while "${focused}" is focused`).toHaveLength(1);
    }
  });

  test(`at ${width} px, each tab stop in a ClickableCard shows one ring`, async ({
    page,
  }) => {
    await open(page, 'core-clickablecard--nested-button', width);
    // The card's link, then Add to cart.
    for (const {focused, rings} of await ringsAtEachStop(page, 2)) {
      expect(rings, `rings while "${focused}" is focused`).toHaveLength(1);
    }
  });

  test(`at ${width} px, each tab stop in a SelectableCard shows one ring`, async ({
    page,
  }) => {
    await open(page, 'core-selectablecard--with-nested-button', width);
    // The card's checkbox, then Details.
    for (const {focused, rings} of await ringsAtEachStop(page, 2)) {
      expect(rings, `rings while "${focused}" is focused`).toHaveLength(1);
    }
  });

  test(`at ${width} px, a Thumbnail's remove button shows one ring`, async ({
    page,
  }) => {
    await open(page, 'core-thumbnail--with-remove', width);
    for (const {focused, rings} of await ringsAtEachStop(page, 1)) {
      expect(rings, `rings while "${focused}" is focused`).toHaveLength(1);
    }
  });

  for (const variant of ['ghost', 'secondary']) {
    for (const component of ['selector', 'multiselector']) {
      test(`at ${width} px, each tab stop in a ${variant} ${component} with a clear button shows one ring`, async ({
        page,
      }) => {
        await open(
          page,
          `core-${component}--clearable`,
          width,
          `&args=variant:${variant}`,
        );
        // The trigger, then its clear button.
        for (const {focused, rings} of await ringsAtEachStop(page, 2)) {
          expect(rings, `rings while "${focused}" is focused`).toHaveLength(1);
        }
      });
    }
  }
}
