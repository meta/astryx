// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Tooltip/ ^packages/core/src/Button/ ^apps/storybook/stories/TooltipDescriptionA11y

/**
 * @file TooltipDescription.a11y.browser.spec.ts
 * @input The built "A11y/Tooltip Description" story in real Chromium and
 *   WebKit, the pointer and the keyboard
 * @output Browser evidence for Tooltip AR1: the trigger's accessible
 *   description is the tooltip text, from a hidden copy present before the
 *   first show, still once after the tooltip shows; a tooltip that repeats
 *   the name (Button FR12) and a cut label (Button FR18) add no description
 * @position Regression proof for Tooltip AR1 in every engine the contract runs
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

async function openPaths(page: Page): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=a11y-tooltip-description--paths&viewMode=story`,
  );
  await page.locator('[data-case="cut"] button').waitFor();
}

/** The element the trigger's aria-describedby names, read in the page. */
async function describedBy(page: Page, caseName: string) {
  return page.evaluate(name => {
    const trigger = document.querySelector(`[data-case="${name}"] button`);
    const id = trigger?.getAttribute('aria-describedby') ?? '';
    const target = id === '' ? null : document.getElementById(id);
    return target == null
      ? null
      : {
          isHidden: target.hasAttribute('hidden'),
          role: target.getAttribute('role'),
          text: target.textContent,
          isInsideTrigger: trigger?.contains(target) ?? false,
        };
  }, caseName);
}

test('a tooltip describes its trigger from a hidden copy before it first shows, then from its content, once', async ({
  page,
}) => {
  await openPaths(page);
  const save = page.locator('[data-case="wrapped"] button');
  await expect(page.getByRole('tooltip', {includeHidden: true})).toHaveCount(0);
  expect(await describedBy(page, 'wrapped')).toEqual({
    isHidden: true,
    role: null,
    text: 'Saves your changes to this draft',
    isInsideTrigger: false,
  });
  await expect(save).toHaveAccessibleDescription(
    'Saves your changes to this draft',
  );

  await save.hover();
  const tooltip = page.getByRole('tooltip', {includeHidden: true});
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText('Saves your changes to this draft');
  // Once the tooltip is mounted, its content is the description and the
  // copy is gone, so the text renders once and is read once.
  await expect(save).toHaveAccessibleDescription(
    'Saves your changes to this draft',
  );
  expect(await describedBy(page, 'wrapped')).toEqual({
    isHidden: false,
    role: null,
    text: 'Saves your changes to this draft',
    isInsideTrigger: false,
  });
  expect(
    await tooltip.evaluate(element => {
      const trigger = document.querySelector('[data-case="wrapped"] button');
      const id = trigger?.getAttribute('aria-describedby') ?? '';
      return element.contains(document.getElementById(id));
    }),
  ).toBe(true);
  await expect(
    page.locator('[data-case="wrapped"] [hidden][id$="-description"]'),
  ).toHaveCount(0);
});

test('a tooltip that adds to the name describes the button; one that repeats it does not', async ({
  page,
}) => {
  await openPaths(page);
  await expect(
    page.getByRole('button', {name: 'Close', exact: true}),
  ).toHaveAccessibleDescription('Close the panel');
  const dismiss = page.getByRole('button', {name: 'Dismiss', exact: true});
  await expect(dismiss).toHaveAccessibleDescription('');
  expect(await describedBy(page, 'repeats')).toBeNull();
  await expect(
    page.locator('[data-case="repeats"] [hidden][id$="-description"]'),
  ).toHaveCount(0);
});

test('a cut label shows its full text on keyboard focus and adds no description', async ({
  page,
}) => {
  await openPaths(page);
  const cut = page.locator('[data-case="cut"] button');
  await cut.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(cut).toBeFocused();
  // The Shift+Tab showed the previous button's tooltip, whose layer stays
  // mounted once it has shown, so the cut label's tooltip is found by text.
  const tooltip = page
    .getByRole('tooltip', {includeHidden: true})
    .filter({hasText: 'A very long button label that overflows its box'});
  await expect(tooltip).toBeVisible();
  await expect(cut).toHaveAccessibleDescription('');
  await expect(
    page.locator('[data-case="cut"] [hidden][id$="-description"]'),
  ).toHaveCount(0);
});
