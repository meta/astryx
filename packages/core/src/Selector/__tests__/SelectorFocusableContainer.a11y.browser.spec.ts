// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(Selector|MultiSelector|Popover)/|apps/storybook/stories/(Multi)?Selector\.stories)

/**
 * @file SelectorFocusableContainer.a11y.browser.spec.ts
 * @input The Selector "Inside Focusable Container" and "Inside Tab Stop
 *   Container" stories in a built Storybook: a Notes field and a Selector
 *   inside a container with `tabIndex={-1}` or `tabIndex={0}`, driven by a
 *   real mouse, a finger and the keyboard
 * @output Browser proof, in every engine, of where focus goes when the list
 *   closes. A pick returns focus to the combobox, in either container. A
 *   press on the `tabIndex={-1}` container returns it too. A press on the
 *   Notes field or on the Tab-stop container leaves focus there.
 * @position Cross-browser proof for the Selector's focus return; jsdom has
 *   no focus move to a pressed element's focusable container
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

async function openStory(page: Page, story = 'inside-focusable-container') {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--${story}&viewMode=story`,
  );
  const container = page.getByTestId('focusable-container');
  const combobox = page.getByRole('combobox', {name: 'Fruit'});
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

/**
 * Returns a wait for the open list's close to finish. The close returns
 * focus in the popover's `toggle` handler, a task after the list hides, so a
 * check that focus stayed put waits for it.
 */
async function watchClose(page: Page): Promise<() => Promise<void>> {
  await page.evaluate(() => {
    const popover = document.querySelector('[popover]');
    (window as unknown as {__closed: Promise<void>}).__closed = new Promise(
      resolve => {
        popover?.addEventListener('toggle', event => {
          if ((event as ToggleEvent).newState === 'closed') {
            setTimeout(resolve, 0);
          }
        });
      },
    );
  });
  return async () => {
    await page.evaluate(async () => {
      await (window as unknown as {__closed: Promise<void>}).__closed;
    });
  };
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

    test('a pick returns focus to the combobox', async ({page}) => {
      const {combobox, listbox} = await openStory(page);
      await press(combobox);
      await expect(listbox).toBeVisible();
      const closed = await watchClose(page);
      await press(listbox.getByRole('option', {name: 'Cherry'}));

      await closed();

      await expect(listbox).toBeHidden();
      await expect(combobox).toHaveText(/Cherry/);
      test.info().annotations.push({
        type: 'container focuses',
        description: String(await containerFocuses(page)),
      });
      await expect(combobox).toBeFocused();
    });

    test('a press on the container returns focus to the combobox', async ({
      page,
    }) => {
      const {container, combobox, listbox} = await openStory(page);
      await press(combobox);
      await expect(listbox).toBeVisible();
      const closed = await watchClose(page);
      // The container's padding, above the fields.
      await press(container, {x: 8, y: 8});

      await closed();

      await expect(listbox).toBeHidden();
      // The press moved focus to the container before the list closed.
      expect(await containerFocuses(page)).toBeGreaterThan(0);
      await expect(combobox).toBeFocused();
    });

    test('a press on another field leaves focus there', async ({page}) => {
      const {combobox, listbox} = await openStory(page);
      await press(combobox);
      await expect(listbox).toBeVisible();
      const closed = await watchClose(page);
      const notes = page.getByRole('textbox', {name: 'Notes'});
      await press(notes);

      await closed();

      await expect(listbox).toBeHidden();
      await expect(notes).toBeFocused();
    });

    test('a press on a control outside the list that is no Tab stop leaves focus there', async ({
      page,
    }) => {
      const {combobox, listbox} = await openStory(page);
      await press(combobox);
      await expect(listbox).toBeVisible();
      const closed = await watchClose(page);
      const nextTab = page.getByRole('button', {name: 'Next tab'});
      await press(nextTab);

      await closed();
      await expect(listbox).toBeHidden();
      await expect(nextTab).toBeFocused();
    });

    test('a press on a Tab-stop container leaves focus there', async ({
      page,
    }) => {
      const {container, combobox, listbox} = await openStory(
        page,
        'inside-tab-stop-container',
      );
      await press(combobox);
      await expect(listbox).toBeVisible();
      const closed = await watchClose(page);
      await press(container, {x: 8, y: 8});

      await closed();

      await expect(listbox).toBeHidden();
      await expect(container).toBeFocused();
    });

    test('a pick inside a Tab-stop container returns focus to the combobox', async ({
      page,
    }) => {
      const {combobox, listbox} = await openStory(
        page,
        'inside-tab-stop-container',
      );
      await press(combobox);
      await expect(listbox).toBeVisible();
      const closed = await watchClose(page);
      await press(listbox.getByRole('option', {name: 'Cherry'}));

      await closed();

      await expect(listbox).toBeHidden();
      await expect(combobox).toHaveText(/Cherry/);
      await expect(combobox).toBeFocused();
    });
  });
}

test('a keyboard pick returns focus to the combobox', async ({page}) => {
  const {combobox, listbox} = await openStory(page);
  await combobox.focus();
  await page.keyboard.press('ArrowDown');
  await expect(listbox).toBeVisible();
  const closed = await watchClose(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await closed();

  await expect(listbox).toBeHidden();
  await expect(combobox).toHaveText(/Apple|Banana|Cherry/);
  await expect(combobox).toBeFocused();
});
