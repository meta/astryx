// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/utils/(focusOutline|interactionModality)|packages/core/src/privateAttributes/focusOwner|packages/core/src/Field/|apps/storybook/stories/(TextInput|BottomSheet))

/**
 * @file FocusRingModality.a11y.browser.spec.ts
 * @input The `Core/TextInput` Disabled story and the `Core/BottomSheet`
 *   data-autofocus row story in a built Storybook, in each browser project.
 * @output Real-browser proof of architecture:interaction-modality INV1 and
 *   spec:AST-085 FR6 for the shared rings: a mouse press or a tap that focuses
 *   a disabled field, or that opens a sheet whose row takes focus, shows no
 *   ring; keyboard focus shows it.
 * @position Runs in pr-a11y when the shared ring switch, the modality store,
 *   the field rings or these stories change. Browsers match `:focus-visible`
 *   on a text field, and WebKit on an element focused by script, whatever the
 *   input, so only a real engine shows which ring paints.
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

async function mount(page: Page, story: string) {
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
}

/** The disabled field's ring: its wrapper's inset shadow width, in px. */
async function fieldRing(input: Locator): Promise<number> {
  return input.evaluate(element => {
    const wrapper = element.parentElement;
    if (wrapper == null) {
      return 0;
    }
    const shadow = getComputedStyle(wrapper).boxShadow;
    const lengths = shadow.match(/(-?[\d.]+)px/g) ?? [];
    return lengths.length >= 4 ? parseFloat(lengths[3]) : 0;
  });
}

/** An element's own outline width, in px, or 0 when it draws none. */
async function outlineWidth(element: Locator): Promise<number> {
  return element.evaluate(node => {
    const style = getComputedStyle(node);
    return style.outlineStyle === 'none' ? 0 : parseFloat(style.outlineWidth);
  });
}

test.describe('a disabled text field', () => {
  test('a mouse press focuses it with no ring', async ({page}) => {
    await mount(page, 'core-textinput--disabled');
    const input = page.locator('input[aria-disabled="true"]').first();
    const box = await input.boundingBox();
    if (box == null) {
      throw new Error('The disabled field has no box');
    }
    await page.mouse.click(box.x + 4, box.y + box.height / 2);
    await expect(input).toBeFocused();
    expect(await fieldRing(input)).toBe(0);
  });

  test('keyboard focus rings it', async ({page, browserName}) => {
    await mount(page, 'core-textinput--disabled');
    const input = page.locator('input[aria-disabled="true"]').first();
    await input.waitFor();
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(input).toBeFocused();
    // The field's border and shadow ease in.
    await expect.poll(async () => fieldRing(input)).toBeGreaterThan(0);
  });

  test('keyboard focus rings it in forced colors', async ({
    page,
    browserName,
  }) => {
    await page.emulateMedia({forcedColors: 'active'});
    await mount(page, 'core-textinput--disabled');
    const input = page.locator('input[aria-disabled="true"]').first();
    await input.waitFor();
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(input).toBeFocused();
    // Forced colors keep the border, repainted in the system Highlight.
    await expect
      .poll(async () =>
        input.evaluate(element => {
          const probe = document.createElement('span');
          probe.style.color = 'Highlight';
          document.body.append(probe);
          const highlight = getComputedStyle(probe).color;
          probe.remove();
          const wrapper = element.parentElement;
          return (
            wrapper != null &&
            getComputedStyle(wrapper).borderTopColor === highlight
          );
        }),
      )
      .toBe(true);
  });

  test.describe('under touch', () => {
    test.use({hasTouch: true, viewport: {width: 390, height: 844}});

    test('a tap focuses it with no ring', async ({page}) => {
      await mount(page, 'core-textinput--disabled');
      const input = page.locator('input[aria-disabled="true"]').first();
      const box = await input.boundingBox();
      if (box == null) {
        throw new Error('The disabled field has no box');
      }
      await page.touchscreen.tap(box.x + 4, box.y + box.height / 2);
      await expect(input).toBeFocused();
      expect(await fieldRing(input)).toBe(0);
    });
  });
});

test.describe('keyboard focus that arrives from a child frame', () => {
  test('shows the ring after a mouse press on the page', async ({
    page,
    browserName,
  }) => {
    await mount(page, 'core-bottomsheet--modal-autofocus-row');
    const opener = page.getByRole('button', {name: 'Open actions'});
    await opener.waitFor();
    // A frame with a text field just before the opener in the page order.
    await opener.evaluate(button => {
      const frame = document.createElement('iframe');
      frame.title = 'Notes';
      frame.srcdoc = '<input aria-label="Note">';
      button.before(frame);
    });
    const field = page.frameLocator('iframe[title="Notes"]').getByLabel('Note');
    await field.waitFor();
    // A mouse press on the page turns the rings off; one in the frame does
    // not reach the page.
    const box = await opener.boundingBox();
    if (box == null) {
      throw new Error('The opener has no box');
    }
    await page.mouse.move(box.x - 40, box.y - 40);
    await page.mouse.down();
    await page.mouse.up();
    await field.click();
    await page.keyboard.type('a');
    // Tab leaves the frame for the opener, with no key event in the page.
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(opener).toBeFocused();
    await expect.poll(async () => outlineWidth(opener)).toBeGreaterThan(0);
  });
});

test.describe('a sheet row that takes focus when the sheet opens', () => {
  const STORY = 'core-bottomsheet--modal-autofocus-row';

  test('opened by a mouse press, the row shows no ring', async ({page}) => {
    await mount(page, STORY);
    await page.getByRole('button', {name: 'Open actions'}).click();
    const row = page.getByRole('button', {name: 'Copy link'});
    await expect(row).toBeFocused();
    expect(await outlineWidth(row)).toBe(0);
  });

  test('after a mouse press, Tab shows the ring again', async ({
    page,
    browserName,
  }) => {
    await mount(page, STORY);
    await page.getByRole('button', {name: 'Open actions'}).click();
    await expect(page.getByRole('button', {name: 'Copy link'})).toBeFocused();
    // Safari moves focus to a button with Option+Tab.
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    const next = page.getByRole('button', {name: 'Share'});
    await expect(next).toBeFocused();
    await expect.poll(async () => outlineWidth(next)).toBeGreaterThan(0);
  });

  test('opened with the keyboard, the row rings', async ({
    page,
    browserName,
  }) => {
    await mount(page, STORY);
    const opener = page.getByRole('button', {name: 'Open actions'});
    await opener.waitFor();
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(opener).toBeFocused();
    await page.keyboard.press('Enter');
    const row = page.getByRole('button', {name: 'Copy link'});
    await expect(row).toBeFocused();
    await expect.poll(async () => outlineWidth(row)).toBeGreaterThan(0);
  });
});
