// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Markdown richtext/* ^(apps/storybook/stories/RichTextEditor\.(markdownParity|stories)|packages/richtext/src/__tests__/(MarkdownParitySandbox|RichTextView|RichTextEditorToolbar)) ^packages/richtext/src/

/**
 * @file RichTextEditorToolbar.a11y.chromium.spec.ts
 * @input The built Storybook's "With toolbar" and "With links" RichTextEditor
 *   stories.
 * @output Real-browser proof that the toolbar's action row scrolls at phone
 *   widths instead of squeezing a control: the block-format selector keeps its
 *   whole label, no control overlaps its neighbour, and every control keeps a
 *   24px target. And that the Link button's popover keeps the editor's
 *   selection through the keyboard: Escape returns focus and the selection to
 *   the editor, a refused URL keeps focus in the field, and Enter applies the
 *   link without the key reaching the editor as a new line.
 *
 * Run after building Storybook:
 *   pnpm storybook:build
 *   pnpm exec playwright test packages/richtext --project chromium
 */

import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORYBOOK_DIR = process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR;
const STORY = 'richtext-richtexteditor--with-toolbar';
const LINK_STORY = 'richtext-richtexteditor--with-links';

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
