// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file MarkdownPluginsImportExport.a11y.chromium.spec.ts
 * @input The built Storybook's "Markdown plugins: import and export" story.
 * @output Real-browser proof for spec:AST-064 FR4, FR5, and FR10: plugin
 *   syntax is recognized as core recognizes it, nodes keep the marks around
 *   them, a block after a paragraph line becomes its own block, the export is
 *   byte for byte, edits keep every node's source, and a transform plugin is
 *   refused.
 *
 * Run after building Storybook:
 *   pnpm storybook:build
 *   pnpm exec playwright test packages/richtext --project chromium
 */

import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORYBOOK_DIR = process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR;
const STORY = 'richtext-richtexteditor--markdown-plugins-import-export';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

async function openStory(
  page: Page,
  colorMode: 'light' | 'dark' = 'light',
): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('404')) {
      errors.push(message.text());
    }
  });
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:neutral;colorMode:${colorMode};direction:ltr`,
    {waitUntil: 'load'},
  );
  await expect(page.locator('[data-plugins-identical]')).toBeVisible();
  return errors;
}

test('the story imports plugin syntax, keeps marks, and exports byte for byte', async ({
  page,
}) => {
  const errors = await openStory(page);
  await expect(page.locator('[data-plugins-identical]')).toHaveText(
    '— identical, byte for byte',
  );
  const input = await page.locator('[data-plugins-input]').inputValue();
  await expect(page.locator('[data-plugins-output]')).toHaveText(input);
  const rows = page.locator('[data-plugins-nodes] tbody tr');
  await expect(rows).toHaveText([
    /story-mentions\s*inline\s*@\{ada\}\s*none/,
    /story-mentions\s*inline\s*@\{grace\}\s*italic/,
    /story-mentions\s*inline\s*@\{linus\}\s*bold/,
    /story-mentions\s*inline\s*@\{old\}\s*strikethrough/,
    /story-notes\s*block\s*:::note[\s\S]*:::\s*none/,
  ]);
  await expect(page.locator('[data-plugins-refusal]')).toContainText(
    'RichTextExtensionError: RichText cannot adopt Markdown plugin "story-shouting"',
  );
  expect(errors).toEqual([]);
});

test('editing the text beside the nodes keeps every node and its marks', async ({
  page,
}) => {
  const errors = await openStory(page);
  const editor = page.locator('[contenteditable="true"]');
  await editor.getByText('Ping', {exact: false}).first().click();
  await page.keyboard.press('Home');
  await page.keyboard.type('Please ');
  await page.getByRole('button', {name: 'Export'}).click();
  const edited =
    (await page.locator('[data-plugins-edited]').textContent()) ?? '';
  expect(edited).toContain('Please Ping @{ada} about the review.');
  expect(edited).toContain('*see @{grace} here*');
  expect(edited).toContain('**ask @{linus}**');
  expect(edited).toContain('~~not @{old}~~');
  expect(edited).toContain(
    ':::note\nand this note starts on the next line.\n:::',
  );
  expect(errors).toEqual([]);
});

// spec:AST-061 FR3: the first block's leading margin and the last block's
// trailing margin are zero, a plugin block included. Lexical puts a zero-size
// caret boundary element beside a decorator at either edge of the document, so
// a plugin block there is not literally the first or last child.
test('a plugin block at either edge of the document adds no outer margin', async ({
  page,
}) => {
  const errors = await openStory(page);
  await page
    .locator('[data-plugins-input]')
    .fill(':::note\nfirst\n:::\n\nBetween the notes.\n\n:::note\nlast\n:::');
  const editor = page.locator('[contenteditable="true"]');
  await expect(editor.getByText('Between the notes.')).toBeVisible();
  const margins = await editor.evaluate(root => {
    const blocks = [...root.children].filter(
      child => !child.hasAttribute('data-lexical-decorator-boundary'),
    );
    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    return {
      first: first?.hasAttribute('data-lexical-decorator') ?? false,
      last: last?.hasAttribute('data-lexical-decorator') ?? false,
      start: first == null ? null : getComputedStyle(first).marginTop,
      end: last == null ? null : getComputedStyle(last).marginBottom,
    };
  });
  // Both edge blocks are the plugin's note blocks.
  expect(margins.first).toBe(true);
  expect(margins.last).toBe(true);
  expect(margins.start).toBe('0px');
  expect(margins.end).toBe('0px');
  expect(errors).toEqual([]);
});

for (const colorMode of ['light', 'dark'] as const) {
  test(`the story meets text contrast in ${colorMode} mode`, async ({page}) => {
    const errors = await openStory(page, colorMode);
    await page.getByRole('button', {name: 'Export'}).click();
    const results = await new AxeBuilder({page})
      .include('#storybook-root')
      .withRules(['color-contrast'])
      .analyze();
    expect(
      results.violations.flatMap(violation =>
        violation.nodes.map(node => node.target.join(' ')),
      ),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
}
