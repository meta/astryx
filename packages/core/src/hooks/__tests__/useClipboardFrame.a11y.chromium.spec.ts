// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/hooks/useClipboard ^apps/storybook/stories/CodeBlock

/**
 * @file useClipboardFrame.a11y.chromium.spec.ts
 * @input The `Core/CodeBlock` Copy in a dialog story in a built Storybook,
 *   served from a second origin into a frame whose permissions policy does
 *   not allow `clipboard-write`, in Chromium.
 * @output Proof, read back from the clipboard, that Copy puts the exact code
 *   there through a selection: outside a dialog, and inside an open modal
 *   Dialog, whose page the browser makes inert.
 * @position Run with `pnpm test:a11y-contract`. The clipboard, a frame's
 *   permissions policy and a modal's inert page need a real browser.
 */

import {
  expect,
  test,
  type BrowserContext,
  type Frame,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

/** The page that holds the frame. */
let host: StaticServer;
/** Another origin for the frame, so its permissions policy refuses the clipboard. */
let framed: StaticServer;
test.beforeAll(async () => {
  const dir = process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR;
  host = await serveStorybook(dir);
  framed = await serveStorybook(dir);
});
test.afterAll(async () => {
  await host?.close();
  await framed?.close();
});

/** The clipboard's text, read from a page of the host's origin. */
async function readClipboard(context: BrowserContext): Promise<string> {
  const reader = await context.newPage();
  try {
    await reader.goto(`${host.origin}/iframe.html`);
    await reader.bringToFront();
    return await reader.evaluate(async () => navigator.clipboard.readText());
  } finally {
    await reader.close();
  }
}

/** The frame that shows the story, once it has loaded. */
async function storyFrame(page: Page): Promise<Frame> {
  const element = await page.locator('#frame').elementHandle();
  const frame = await element?.contentFrame();
  if (frame == null) {
    throw new Error('The story frame did not load.');
  }
  return frame;
}

test('copies the exact code in a frame without clipboard access, outside and inside an open dialog', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: host.origin,
  });
  await page.goto(`${host.origin}/iframe.html`);
  await page.setContent(
    `<iframe id="frame" title="Story" style="width: 900px; height: 700px; border: 0" src="${framed.origin}/iframe.html?id=core-codeblock--copy-in-a-dialog&viewMode=story"></iframe>`,
  );
  const story = await storyFrame(page);
  await story.getByRole('button', {name: 'Open dialog'}).waitFor();
  // The frame may not use the async Clipboard API.
  expect(
    await story.evaluate(() => {
      const doc = document as Document & {
        featurePolicy?: {allowsFeature: (feature: string) => boolean};
      };
      return doc.featurePolicy?.allowsFeature('clipboard-write');
    }),
  ).toBe(false);

  await story.getByRole('button', {name: 'Copy code'}).first().click();
  expect(await readClipboard(context)).toBe('npm install outside');

  await page.bringToFront();
  await story.getByRole('button', {name: 'Open dialog'}).click();
  const dialog = story.getByRole('dialog');
  await dialog.getByRole('button', {name: 'Copy code'}).click();
  expect(await readClipboard(context)).toBe('npm install inside');
  // Focus stays in the dialog after the copy.
  expect(
    await story.evaluate(
      () => document.activeElement?.closest('dialog[open]') != null,
    ),
  ).toBe(true);
});
