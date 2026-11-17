// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Chat/(ChatComposerInput|chatComposerSelection|useChatComposerTokens)|apps/storybook/stories/ChatComposerInput)

/**
 * @file ChatComposerImeCaret.a11y.chromium.spec.ts
 * @input The `Core/ChatComposerInput` MentionTrigger story in a built
 *   Storybook, and Chromium's input-method protocol (`Input.imeSetComposition`
 *   and `Input.insertText`).
 * @output Real-browser proof that composing right after a mention pick commits
 *   only the composed text, not the first raw letter of the composition.
 * @position Runs in pr-a11y when the composer input, its selection helpers or
 *   their story change. jsdom has no input method, so only a browser shows
 *   where a composition anchors after the composer places the caret.
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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

test('a composition right after a mention pick commits only the composed text', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-chatcomposerinput--mention-trigger&viewMode=story`,
  );
  const textbox = page.getByRole('combobox');
  await textbox.click();
  await page.keyboard.type('@');
  const option = page.getByRole('option').first();
  await expect(option).toBeVisible();
  await page.keyboard.press('Enter');
  const value = page.getByText(/^Value: /);
  // The space after a token may be a no-break space.
  await expect(value).toHaveText(/^Value: "@\S+\s"$/);

  // A Japanese input method: the first key shows its raw letter as preedit
  // text, the next turns it into kana, and the commit inserts the kana.
  const session = await page.context().newCDPSession(page);
  await session.send('Input.imeSetComposition', {
    text: 'n',
    selectionStart: 1,
    selectionEnd: 1,
  });
  await session.send('Input.imeSetComposition', {
    text: 'な',
    selectionStart: 1,
    selectionEnd: 1,
  });
  await session.send('Input.insertText', {text: 'な'});

  await expect(value).toHaveText(/^Value: "@\S+\sな"$/);
});

test('a composition after one Backspace removes a just-picked mention commits only the composed text', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-chatcomposerinput--mention-trigger&viewMode=story`,
  );
  const textbox = page.getByRole('combobox');
  await textbox.click();
  await page.keyboard.type('hey @');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Enter');
  const value = page.getByText(/^Value: /);
  await expect(value).toHaveText(/^Value: "hey @\S+\s"$/);
  await page.keyboard.press('Backspace');
  await expect(value).toHaveText(/^Value: "hey\s"$/);

  const session = await page.context().newCDPSession(page);
  await session.send('Input.imeSetComposition', {
    text: 'k',
    selectionStart: 1,
    selectionEnd: 1,
  });
  await session.send('Input.imeSetComposition', {
    text: 'か',
    selectionStart: 1,
    selectionEnd: 1,
  });
  await session.send('Input.insertText', {text: 'か'});

  await expect(value).toHaveText(/^Value: "hey\sか"$/);
});

test('a composition after one Backspace removes a mention that starts a line stays on that line', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-chatcomposerinput--mention-trigger&viewMode=story`,
  );
  const textbox = page.getByRole('combobox');
  await textbox.click();
  await page.keyboard.type('hey');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('@');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Enter');
  const value = page.getByText(/^Value: /);
  await expect(value).toHaveText(/^Value: "hey\\n@\S+\s"$/);
  await page.keyboard.press('Backspace');

  const session = await page.context().newCDPSession(page);
  await session.send('Input.imeSetComposition', {
    text: 'k',
    selectionStart: 1,
    selectionEnd: 1,
  });
  await session.send('Input.imeSetComposition', {
    text: 'か',
    selectionStart: 1,
    selectionEnd: 1,
  });
  await session.send('Input.insertText', {text: 'か'});

  await expect(value).toHaveText('Value: "hey\\nか"');
});
