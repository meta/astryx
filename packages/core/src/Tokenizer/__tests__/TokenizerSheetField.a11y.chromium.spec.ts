// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Tokenizer ^apps/storybook/stories/Tokenizer

/**
 * @file TokenizerSheetField.a11y.chromium.spec.ts
 * @input The `Core/Tokenizer` sheet story with end content and custom tokens
 *   in a built Storybook.
 * @output Real-engine proof that the sheet field keeps its tokens clear of
 *   the end lane across widths and both writing directions, that the end
 *   content and a custom token's remove control act without opening the
 *   sheet, and that a tap on a token opens it.
 * @position Run with `pnpm test:a11y-contract`. The lane is absolutely
 *   positioned, so whether a token reaches it depends on how rows wrap at a
 *   given width, which only a shipping layout engine can show.
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

type Direction = 'ltr' | 'rtl';

const STORY = 'core-tokenizer--sheet-presentation-end-content';

async function open(page: Page, direction: Direction = 'ltr'): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=direction:${direction}`,
    {waitUntil: 'load'},
  );
  await page
    .getByRole('button', {name: 'Recipients'})
    .waitFor({state: 'visible'});
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

const trigger = (page: Page) => page.getByRole('button', {name: 'Recipients'});

/**
 * Sizes the story's grid column to `width` and returns every token that
 * paints under the end lane, plus a field whose content is wider than its
 * box.
 */
async function overlapsAt(page: Page, width: number): Promise<string[]> {
  return page.evaluate(async width => {
    const host = document.querySelector<HTMLElement>(
      '#storybook-root [style*="grid-template-columns"]',
    );
    if (host == null) {
      throw new Error('No sizing grid in the story');
    }
    host.style.gridTemplateColumns = `minmax(0, ${width}px)`;
    for (let frame = 0; frame < 4; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    const field = host.querySelector<HTMLElement>('.astryx-tokenizer');
    const cc = [...host.querySelectorAll('button')].find(button =>
      button.textContent?.startsWith('Cc'),
    );
    const lane = cc?.parentElement;
    if (field == null || lane == null) {
      throw new Error('The story has no sheet field with an end lane');
    }
    const l = lane.getBoundingClientRect();
    const found: string[] = [];
    for (const token of field.querySelectorAll('.astryx-token')) {
      const t = token.getBoundingClientRect();
      const crosses =
        t.right > l.left + 0.5 &&
        t.left < l.right - 0.5 &&
        t.bottom > l.top + 0.5 &&
        t.top < l.bottom - 0.5;
      if (crosses) {
        found.push(`${width}px: "${token.textContent}" paints under the lane`);
      }
    }
    if (field.scrollWidth > field.clientWidth + 1) {
      found.push(
        `${width}px: the field's content is ${field.scrollWidth}px in a ${field.clientWidth}px box`,
      );
    }
    return found;
  }, width);
}

for (const direction of ['ltr', 'rtl'] as const) {
  test(`${direction}: the sheet field's tokens stay clear of the end lane`, async ({
    page,
  }) => {
    await open(page, direction);
    const found: string[] = [];
    for (let width = 180; width <= 400; width += 20) {
      found.push(...(await overlapsAt(page, width)));
    }
    expect(found).toEqual([]);
  });
}

test("Tab moves from the trigger through the custom tokens' controls to the end content", async ({
  page,
}) => {
  await open(page);
  await trigger(page).focus();
  const names: string[] = [];
  for (let step = 0; step < 5; step++) {
    await page.keyboard.press('Tab');
    names.push(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.textContent ??
          '',
      ),
    );
  }
  expect(names.slice(0, 4).every(name => name.startsWith('Remove '))).toBe(
    true,
  );
  expect(names[4]).toBe('Cc (0)');
});

test("the trigger's description is the count and the custom tokens' labels, without their controls' names", async ({
  page,
}) => {
  await open(page);
  const labels = await page
    .locator('.astryx-tokenizer .astryx-token')
    .evaluateAll(tokens =>
      tokens.map(
        token =>
          token
            .querySelector('button')
            ?.getAttribute('aria-label')
            ?.replace(/^Remove /, '') ?? '',
      ),
    );
  expect(labels).toHaveLength(4);
  await expect(trigger(page)).toHaveAccessibleDescription(
    `4 selected ${labels.join(' ')}`,
  );
  // The label copies the description reads are hidden, so the
  // accessibility tree holds each label once: the custom token's own text.
  const tree = (await page.locator('#storybook-root').ariaSnapshot()).split(
    '\n',
  );
  for (const label of labels) {
    expect(
      tree.filter(line => line.trim() === `- text: ${label}`),
      label,
    ).toHaveLength(1);
  }
});

test('the end content acts without opening the sheet', async ({page}) => {
  await open(page);
  await page.getByRole('button', {name: 'Cc (0)'}).click();
  await expect(page.getByRole('button', {name: 'Cc (1)'})).toBeVisible();
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test("a custom token's remove control removes it without opening the sheet", async ({
  page,
}) => {
  await open(page);
  const remove = page.getByRole('button', {name: /^Remove /}).first();
  const label = (await remove.getAttribute('aria-label'))!.replace(
    /^Remove /,
    '',
  );
  await remove.click();
  await expect(page.getByRole('button', {name: `Remove ${label}`})).toHaveCount(
    0,
  );
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger(page)).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a tap on a token opens the sheet', async ({page}) => {
  await open(page);
  const token = page.locator('.astryx-tokenizer .astryx-token').first();
  const box = (await token.boundingBox())!;
  // The token's label, clear of its remove control at the inline end.
  await page.mouse.click(box.x + 8, box.y + box.height / 2);
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('dialog', {name: 'Recipients'})).toBeVisible();
});
