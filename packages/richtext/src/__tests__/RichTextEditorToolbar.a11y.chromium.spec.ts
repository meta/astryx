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
 *   link without the key reaching the editor as a new line. And that the link
 *   card sits under its link inside the editor without reflowing a block,
 *   renders beside the editable text, is reached with Escape then Tab, leaves
 *   with Escape, opens from the pointer, and that Ctrl-click follows a link
 *   whose pointer cursor shows only while Ctrl is held.
 *
 * Run after building Storybook:
 *   pnpm storybook:build
 *   pnpm exec playwright test packages/richtext --project chromium
 */

import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Locator, type Page} from '@playwright/test';
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

/**
 * Puts the page's selection in the editor's text run holding `words`, from
 * `from` to `to`, as a click or a drag would; the editor reads it from there.
 */
async function selectInEditor(
  page: Page,
  words: string,
  from: number,
  to = from,
) {
  await page.evaluate(
    ({words, from, to}) => {
      const root = document.querySelector('[contenteditable="true"]');
      if (root == null) {
        throw new Error('no editor');
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent?.includes(words)) {
          document.getSelection()?.setBaseAndExtent(node, from, node, to);
          return;
        }
      }
      throw new Error(`no text run holds "${words}"`);
    },
    {words, from, to},
  );
}

test('the link card overlays its link without reflowing the document', async ({
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
  await page.keyboard.press('Enter');
  await page.keyboard.type('The next paragraph stays where it is.');
  await selectInEditor(page, 'Ship the launch notes today.', 9, 21);
  await page.getByRole('button', {name: 'Link', exact: true}).click();
  await page.getByRole('textbox', {name: 'URL'}).fill('example.com/launch');
  await page.keyboard.press('Enter');
  const link = editor.getByRole('link', {name: 'launch notes'});
  await expect(link).toHaveAttribute('href', 'https://example.com/launch');

  // The caret outside the link: no card. Record where every block sits.
  await selectInEditor(page, ' today.', 7);
  const card = page.getByRole('group', {name: 'Link'});
  await expect(card).toBeHidden();
  const blocks = () =>
    editor
      .locator('p')
      .evaluateAll(paragraphs =>
        paragraphs.map(p => [
          p.getBoundingClientRect().top,
          p.getBoundingClientRect().height,
        ]),
      );
  const before = await blocks();

  // The caret in the link opens its card under the link's line.
  await selectInEditor(page, 'launch notes', 2);
  await expect(card).toBeVisible();
  await expect(
    card.getByRole('link', {name: 'example.com/launch'}),
  ).toBeVisible();
  expect(await blocks()).toEqual(before);
  const boxOf = async (locator: Locator) => {
    const box = await locator.boundingBox();
    if (box == null) {
      throw new Error('not rendered');
    }
    return box;
  };
  const linkBox = await boxOf(link);
  const cardBox = await boxOf(card);
  const editorBox = await boxOf(editor);
  expect(cardBox.y).toBeGreaterThanOrEqual(linkBox.y + linkBox.height);
  expect(Math.abs(cardBox.x - linkBox.x)).toBeLessThanOrEqual(1);
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(
    editorBox.x + editorBox.width + 1,
  );
  expect(
    await card.evaluate(element => {
      const root = document.querySelector('[contenteditable="true"]');
      return (
        root != null &&
        !root.contains(element) &&
        element.parentElement === root.parentElement
      );
    }),
  ).toBe(true);
  const axe = await new AxeBuilder({page})
    .include('[role="group"][aria-label="Link"]')
    .analyze();
  expect(axe.violations).toEqual([]);

  // Escape, then Tab, reaches the card; Escape in it returns to the editor
  // and the card stays away.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(
    card.getByRole('link', {name: 'example.com/launch'}),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(editor).toBeFocused();

  // The pointer resting on the link opens the card again.
  await link.hover();
  await expect(card).toBeVisible();
  expect(await blocks()).toEqual(before);

  // A link reads as text until Ctrl is held over it; then Ctrl-click opens it.
  const cursor = () =>
    link.evaluate(element => getComputedStyle(element).cursor);
  expect(await cursor()).toBe('text');
  await page.keyboard.down('Control');
  await link.hover({position: {x: 4, y: 4}});
  await expect.poll(cursor).toBe('pointer');
  await page.evaluate(() => {
    const opened: string[] = [];
    Object.assign(window, {opened});
    window.open = (url?: string | URL) => {
      opened.push(String(url));
      return null;
    };
  });
  await link.click({modifiers: ['Control']});
  await page.keyboard.up('Control');
  await expect.poll(cursor).toBe('text');
  expect(
    await page.evaluate(() => (window as unknown as {opened: string[]}).opened),
  ).toEqual(['https://example.com/launch']);
});
