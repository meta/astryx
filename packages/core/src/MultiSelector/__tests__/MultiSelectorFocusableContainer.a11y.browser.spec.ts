// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(Selector|MultiSelector|Popover)/|apps/storybook/stories/(Multi)?Selector\.stories)

/**
 * @file MultiSelectorFocusableContainer.a11y.browser.spec.ts
 * @input The MultiSelector "Inside Focusable Container" story in a built
 *   Storybook: a Notes field and a MultiSelector inside a container with
 *   `tabIndex={-1}`, driven by a real mouse, a finger and the keyboard
 * @output Browser proof, in every engine, of where focus goes when the list
 *   closes. A close after a pick and a press on the container return focus
 *   to the combobox. A press on the Notes field leaves focus there.
 * @position Cross-browser proof for the MultiSelector's focus return with
 *   its built-in trigger; jsdom has no focus move to a pressed element's
 *   focusable container
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
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

async function openStory(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-multiselector--inside-focusable-container&viewMode=story`,
  );
  const container = page.getByTestId('focusable-container');
  const combobox = page.getByRole('combobox', {name: 'Fruits'});
  await expect(combobox).toBeVisible();
  // Counts each focus the container itself takes.
  await container.evaluate(element => {
    const record = {containerFocuses: 0};
    (window as unknown as {__focusRecord: typeof record}).__focusRecord =
      record;
    element.addEventListener('focus', () => {
      record.containerFocuses += 1;
    });
  });
  return {container, combobox, listbox: page.getByRole('listbox')};
}

async function containerFocuses(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as {__focusRecord: {containerFocuses: number}})
        .__focusRecord.containerFocuses,
  );
}

for (const input of ['mouse', 'finger'] as const) {
  test.describe(`under a ${input}`, () => {
    test.use({hasTouch: input === 'finger'});
    const press = async (
      target: Locator,
      position?: {x: number; y: number},
    ): Promise<void> => {
      if (input === 'finger') {
        await target.tap({position});
      } else {
        await target.click({position});
      }
    };

    test('a close after a pick returns focus to the combobox', async ({
      page,
    }) => {
      const {combobox, listbox} = await openStory(page);
      await press(combobox);
      await expect(listbox).toBeVisible();
      const banana = listbox.getByRole('option', {name: 'Banana'});
      await press(banana);
      // A pick keeps the list open.
      await expect(banana).toHaveAttribute('aria-selected', 'true');
      await expect(listbox).toBeVisible();
      test.info().annotations.push({
        type: 'container focuses',
        description: String(await containerFocuses(page)),
      });
      await page.keyboard.press('Escape');

      await expect(listbox).toBeHidden();
      await expect(combobox).toBeFocused();
    });

    test('a press on the container returns focus to the combobox', async ({
      page,
    }) => {
      const {container, combobox, listbox} = await openStory(page);
      await press(combobox);
      await expect(listbox).toBeVisible();
      // The container's padding, above the fields.
      await press(container, {x: 8, y: 8});

      await expect(listbox).toBeHidden();
      // The press moved focus to the container before the list closed.
      expect(await containerFocuses(page)).toBeGreaterThan(0);
      await expect(combobox).toBeFocused();
    });

    test('a press on another field leaves focus there', async ({page}) => {
      const {combobox, listbox} = await openStory(page);
      await press(combobox);
      await expect(listbox).toBeVisible();
      const notes = page.getByRole('textbox', {name: 'Notes'});
      await press(notes);

      await expect(listbox).toBeHidden();
      await expect(notes).toBeFocused();
    });
  });
}
