// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Markdown richtext/* ^(apps/storybook/stories/RichTextEditor\.(markdownParity|stories|playground)|packages/richtext/src/__tests__/(MarkdownParitySandbox|RichTextView|RichTextEditorToolbar)) ^packages/richtext/src/

/**
 * @file RichTextEditorToolbar.a11y.chromium.spec.ts
 * @input The built Storybook's "With toolbar", "With links", "With links no
 *   room above" and "Playground" RichTextEditor stories.
 * @output Real-browser proof of the toolbar's layout and link popover. The
 *   action row scrolls at phone widths instead of squeezing a control: the
 *   block-format selector keeps its whole label, no control overlaps its
 *   neighbour, and every control keeps a 24px target. Every separator spans
 *   the controls, the one before endContent too. The Link button's popover
 *   keeps the editor's selection through the keyboard: Escape returns focus
 *   and the selection to the editor, a refused URL keeps focus in the field,
 *   and Enter applies the link without the key reaching the editor as a new
 *   line. The popover opens above the toolbar, flips below the Link button
 *   with no room above, and at phone width fits the screen on one row.
 *
 * Run after building Storybook:
 *   pnpm storybook:build
 *   pnpm exec playwright test packages/richtext --project chromium
 */

import AxeBuilder from '@axe-core/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
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

const STORYBOOK_DIR = process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR;
const STORY = 'richtext-richtexteditor--with-toolbar';
const LINK_STORY = 'richtext-richtexteditor--with-links';
const NO_ROOM_STORY = 'richtext-richtexteditor--with-links-no-room-above';
const PLAYGROUND_STORY = 'richtext-richtexteditor--playground';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

for (const width of [320, 390, 1240]) {
  for (const direction of ['ltr', 'rtl'] as const) {
    test(`the action row scrolls instead of squeezing a control (${width}px, ${direction})`, async ({
      page,
    }) => {
      await page.setViewportSize({width, height: 700});
      await page.goto(
        `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:${direction}`,
        {waitUntil: 'load'},
      );
      const toolbar = page.getByRole('toolbar', {name: 'Text formatting'});
      await expect(toolbar).toBeVisible();

      const layout = await toolbar.evaluate(root => {
        const row = root.querySelector('[role="group"]') as HTMLElement;
        const combobox = root.querySelector('[role="combobox"]') as HTMLElement;
        const label = [...combobox.querySelectorAll('span')].find(
          span => span.textContent === 'Paragraph',
        );
        const controls = [...row.children]
          .filter(child => child.getAttribute('role') !== 'separator')
          .map(child => child.getBoundingClientRect())
          .filter(box => box.width > 0)
          .sort((a, b) => a.left - b.left);
        let overlap = 0;
        for (let index = 1; index < controls.length; index++) {
          overlap = Math.max(
            overlap,
            controls[index - 1].right - controls[index].left,
          );
        }
        return {
          labelWidth: label?.getBoundingClientRect().width ?? 0,
          labelNeeds: label?.scrollWidth ?? -1,
          overlap,
          rowOverflow: row.scrollWidth - row.clientWidth,
          rowRoom: row.clientWidth,
          pageOverflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          shortest: Math.min(...controls.map(box => box.height)),
        };
      });

      expect(layout.labelNeeds, 'label found').toBeGreaterThan(0);
      expect(
        layout.labelWidth,
        'the selector shows its whole label',
      ).toBeGreaterThanOrEqual(layout.labelNeeds - 0.5);
      expect(
        layout.overlap,
        'no control overlaps the next',
      ).toBeLessThanOrEqual(0.5);
      expect(
        layout.shortest,
        'every control is a 24px target',
      ).toBeGreaterThanOrEqual(24);
      expect(
        layout.pageOverflow,
        'the page never scrolls sideways',
      ).toBeLessThanOrEqual(0);
      if (width < 400) {
        expect(
          layout.rowOverflow,
          'at phone width the row scrolls',
        ).toBeGreaterThan(0);
      }

      const targets = await new AxeBuilder({page})
        .include('[role="toolbar"]')
        .withRules(['target-size'])
        .analyze();
      expect(targets.violations).toEqual([]);
    });
  }
}

test('the link popover keeps the selection through the keyboard', async ({
  page,
}) => {
  await page.setViewportSize({width: 900, height: 600});
  await page.goto(
    `${storybook.origin}/iframe.html?id=${LINK_STORY}&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:ltr`,
    {waitUntil: 'load'},
  );
  const editor = page.getByRole('textbox', {name: 'Notes'});
  await editor.click();
  await page.keyboard.type('Ship the launch notes today.');
  await page.keyboard.press('Home');
  for (let press = 0; press < 'Ship the '.length; press += 1) {
    await page.keyboard.press('ArrowRight');
  }
  for (let press = 0; press < 'launch notes'.length; press += 1) {
    await page.keyboard.press('Shift+ArrowRight');
  }
  const selected = () => page.evaluate(() => String(document.getSelection()));
  expect(await selected()).toBe('launch notes');

  const linkButton = page.getByRole('button', {name: 'Link', exact: true});
  const popover = page.getByRole('dialog', {name: 'Insert link'});
  const field = popover.getByRole('textbox', {name: 'URL'});
  await linkButton.click();
  await expect(popover).toBeVisible();
  await expect(popover).not.toHaveAttribute('aria-modal', 'true');
  await expect(linkButton).toHaveAttribute('aria-expanded', 'true');
  await expect(field).toBeFocused();
  const axe = await new AxeBuilder({page}).include('[role="dialog"]').analyze();
  expect(axe.violations).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(editor).toBeFocused();
  expect(await selected()).toBe('launch notes');

  await linkButton.click();
  await expect(field).toBeFocused();
  await field.fill('javascript:alert(1)');
  await page.keyboard.press('Enter');
  await expect(
    popover.getByText('Enter a valid http, https, mailto, or tel URL.'),
  ).toBeVisible();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toBeFocused();

  await field.fill('example.com/launch');
  await page.keyboard.press('Enter');
  await expect(popover).toBeHidden();
  await expect(editor).toBeFocused();
  await expect(
    editor.getByRole('link', {name: 'launch notes'}),
  ).toHaveAttribute('href', 'https://example.com/launch');
  await expect(editor.locator('p')).toHaveCount(1);
  await expect(editor).toHaveText('Ship the launch notes today.');
});

test('every separator spans the controls, the one before endContent too', async ({
  page,
}) => {
  await page.setViewportSize({width: 1240, height: 900});
  await page.goto(
    `${storybook.origin}/iframe.html?id=${PLAYGROUND_STORY}&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:ltr`,
    {waitUntil: 'load'},
  );
  await holdMotionStill(page);
  const toolbar = page.getByRole('toolbar', {name: 'Text formatting'});
  await expect(toolbar.getByRole('button', {name: 'Table'})).toBeVisible();
  const heights = await toolbar.evaluate(root =>
    [...root.querySelectorAll('[role="separator"]')].map(
      separator => separator.getBoundingClientRect().height,
    ),
  );
  expect(heights.length, 'history, format and endContent separators').toBe(3);
  for (const height of heights) {
    expect(height, `separator heights ${heights.join(', ')}`).toBe(heights[0]);
  }
  expect(heights[0]).toBeGreaterThanOrEqual(16);
});

async function openLinkPopover(page: Page, story: string, width: number) {
  await page.setViewportSize({width, height: 700});
  await page.goto(
    `${storybook.origin}/iframe.html?id=${story}&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:ltr`,
    {waitUntil: 'load'},
  );
  // The popover's open animation scales and moves it; hold it at its end
  // state so its box is final.
  await holdMotionStill(page);
  const editor = page.getByRole('textbox', {name: 'Notes'});
  await editor.click();
  await page.keyboard.type('Ship the notes.');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('ControlOrMeta+k');
  const popover = page.getByRole('dialog', {name: 'Insert link'});
  await expect(popover).toBeVisible();
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(animation => animation.playState !== 'running'),
  );
  const box = async (locator: Locator) => {
    const rect = await locator.boundingBox();
    if (rect == null) {
      throw new Error('the element has no rendered box');
    }
    return rect;
  };
  return {
    popover: await box(popover),
    toolbar: await box(page.getByRole('toolbar', {name: 'Text formatting'})),
    linkButton: await box(
      page.getByRole('button', {name: 'Link', exact: true}),
    ),
    field: await box(popover.getByRole('textbox', {name: 'URL'})),
    buttons: await Promise.all(
      (await popover.getByRole('button').all()).map(box),
    ),
  };
}

test('the link popover opens above the toolbar when there is room', async ({
  page,
}) => {
  const {popover, toolbar} = await openLinkPopover(page, LINK_STORY, 900);
  expect(popover.y + popover.height).toBeLessThanOrEqual(toolbar.y + 1);
});

test('the link popover flips below the Link button with no room above', async ({
  page,
}) => {
  const {popover, linkButton} = await openLinkPopover(page, NO_ROOM_STORY, 900);
  expect(popover.y).toBeGreaterThanOrEqual(
    linkButton.y + linkButton.height - 1,
  );
});

test('at phone width the link popover fits the screen on one row', async ({
  page,
}) => {
  const {popover, field, buttons} = await openLinkPopover(
    page,
    LINK_STORY,
    390,
  );
  expect(popover.width).toBeLessThanOrEqual(320.5);
  expect(popover.x).toBeGreaterThanOrEqual(0);
  expect(popover.x + popover.width).toBeLessThanOrEqual(390);
  const center = (rect: {y: number; height: number}) =>
    rect.y + rect.height / 2;
  expect(buttons.length).toBeGreaterThan(0);
  for (const button of buttons) {
    expect(Math.abs(center(button) - center(field))).toBeLessThanOrEqual(4);
  }
});
