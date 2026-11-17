// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/hooks/useClipboard ^apps/storybook/stories/CodeBlock

/**
 * @file useClipboardFrame.a11y.chromium.spec.ts
 * @input The `Core/CodeBlock` Copy in a dialog story in a built Storybook,
 *   served from a second origin into a sandboxed frame, with and without
 *   `clipboard-write`, in Chromium.
 * @output Proof, read back from the clipboard, that Copy puts the exact code
 *   there with the copy command where the frame refuses the async API:
 *   outside a dialog, and inside an open modal Dialog, whose page the browser
 *   makes inert; and with the async API where the frame may use it.
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

/**
 * Show the story in a sandboxed frame from the other origin, and count the
 * copy commands it runs. `allow` delegates `clipboard-write` to the frame.
 */
async function openStory(
  page: Page,
  context: BrowserContext,
  allow: string,
): Promise<Frame> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: host.origin,
  });
  await page.goto(`${host.origin}/iframe.html`);
  await page.setContent(
    `<iframe id="frame" title="Story" sandbox="allow-scripts allow-same-origin" allow="${allow}" style="width: 900px; height: 700px; border: 0" src="${framed.origin}/iframe.html?id=core-codeblock--copy-in-a-dialog&viewMode=story"></iframe>`,
  );
  const story = await storyFrame(page);
  await story.getByRole('button', {name: 'Open dialog'}).waitFor();
  await story.evaluate(() => {
    const counted = window as Window & {copyCommands?: number};
    counted.copyCommands = 0;
    const run = document.execCommand.bind(document);
    document.execCommand = (...args: Parameters<Document['execCommand']>) => {
      counted.copyCommands = (counted.copyCommands ?? 0) + 1;
      return run(...args);
    };
  });
  return story;
}

/** Whether the frame's permissions policy lets it use the async Clipboard API. */
async function asyncClipboardAllowed(
  story: Frame,
): Promise<boolean | undefined> {
  return story.evaluate(() => {
    const doc = document as Document & {
      featurePolicy?: {allowsFeature: (feature: string) => boolean};
    };
    return doc.featurePolicy?.allowsFeature('clipboard-write');
  });
}

/** How many copy commands the frame ran. */
async function copyCommands(story: Frame): Promise<number | undefined> {
  return story.evaluate(
    () => (window as Window & {copyCommands?: number}).copyCommands,
  );
}

test('copies with the copy command in a sandboxed frame that refuses the async API, outside and inside an open dialog', async ({
  page,
  context,
}) => {
  const violations: string[] = [];
  page.on('console', message => {
    if (message.text().includes('Clipboard API has been blocked')) {
      violations.push(message.text());
    }
  });
  const story = await openStory(page, context, '');
  expect(await asyncClipboardAllowed(story)).toBe(false);

  await story.getByRole('button', {name: 'Copy code'}).first().click();
  expect(await readClipboard(context)).toBe('npm install outside');

  await page.bringToFront();
  await story.getByRole('button', {name: 'Open dialog'}).click();
  const dialog = story.getByRole('dialog');
  const copyInDialog = dialog.getByRole('button', {name: 'Copy code'});
  await copyInDialog.click();
  expect(await readClipboard(context)).toBe('npm install inside');
  // The copy moved no focus: the control that copied still has it.
  expect(
    await story.evaluate(
      () => document.activeElement?.closest('dialog[open]') != null,
    ),
  ).toBe(true);
  expect(await copyCommands(story)).toBe(2);
  // The refused API was never tried, so the browser logged no violation.
  expect(violations).toEqual([]);
});

test('copies with the async Clipboard API where the sandboxed frame is allowed to', async ({
  page,
  context,
}) => {
  const story = await openStory(page, context, 'clipboard-write');
  expect(await asyncClipboardAllowed(story)).toBe(true);

  await story.getByRole('button', {name: 'Copy code'}).first().click();
  expect(await readClipboard(context)).toBe('npm install outside');
  expect(await copyCommands(story)).toBe(0);
});
