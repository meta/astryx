// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file Playground.a11y.chromium.spec.ts
 * @input The built Storybook's RichText/RichTextEditor "Playground" story.
 * @output Real-browser proof that the playground is ONE editor carrying every
 *   feature at once: the seeded document brings every block type, each
 *   readout reports that same editor, switching a feature on or off leaves a
 *   single live editor behind, and the toolbar's endContent slot reaches the
 *   editor through the composer context.
 *
 * The playground exists so features can be combined; a story that silently
 * lost its toolbar, its plugins, or its single-editor shape would still look
 * fine in a screenshot. This holds the shape.
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
const STORY = 'richtext-richtexteditor--playground';

/** The one editable surface the whole page is about. */
const EDITOR = '[data-playground-editor] [role="textbox"]';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

async function openStory(
  page: Page,
  direction: 'ltr' | 'rtl' = 'ltr',
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
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:${direction}`,
    {waitUntil: 'load'},
  );
  await expect(page.locator(EDITOR)).toBeVisible();
  return errors;
}

const settings = (page: Page) => page.locator('[data-playground-settings]');

const toggle = (page: Page, label: string) =>
  settings(page).getByRole('switch', {name: label, exact: false}).first();

test('one editor holds the seeded document, with every block type in it', async ({
  page,
}) => {
  const errors = await openStory(page);
  // One editable surface on the page: the readouts beside it are read-only.
  await expect(
    page.locator('[role="textbox"][data-lexical-editor]'),
  ).toHaveCount(1);
  const editor = page.locator(EDITOR);
  await expect(editor.locator('h1')).toHaveCount(1);
  await expect(editor.locator('table')).toHaveCount(1);
  await expect(editor.locator('a')).not.toHaveCount(0);
  await expect(editor.locator('li')).not.toHaveCount(0);
  await expect(editor.locator('hr')).toHaveCount(1);
  // A task list draws real checkboxes, and a Markdown plugin node is adopted.
  await expect(
    page.locator('[data-playground-editor] input[type="checkbox"]'),
  ).not.toHaveCount(0);
  await expect(
    page.locator('[data-playground-editor] [data-markdown-extension]'),
  ).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test('every readout reports the editor beside it, and follows it as it is typed into', async ({
  page,
}) => {
  const errors = await openStory(page);
  const output = page.locator('[data-playground-output]');

  await page.getByRole('tab', {name: 'Markdown'}).click();
  await expect(output).toContainText('# Release notes');

  await page.getByRole('tab', {name: 'Node tree'}).click();
  await expect(output).toContainText('heading tag=h1');

  await page.getByRole('tab', {name: 'Editor state'}).click();
  await expect(output).toContainText('"root"');

  await page.getByRole('tab', {name: 'HTML'}).click();
  await expect(output).toContainText('<h1');

  await page.getByRole('tab', {name: 'RichTextView'}).click();
  await expect(output.locator('table')).toHaveCount(1);

  // Type into the one editor; the Markdown readout of that same editor moves.
  await page.getByRole('tab', {name: 'Markdown'}).click();
  await page.locator(EDITOR).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' A sentence typed by the spec.');
  await expect(output).toContainText('A sentence typed by the spec.');
  expect(errors).toEqual([]);
});

test('switching a feature leaves one live editor behind', async ({page}) => {
  const errors = await openStory(page);
  for (const label of [
    'Toolbar',
    'Toolbar',
    'Autolink',
    'Autolink',
    'Markdown plugins',
    'Markdown plugins',
    'Restricted transformers',
    'Restricted transformers',
    'Character limit',
  ]) {
    await toggle(page, label).click();
    await expect(page.locator(EDITOR)).toBeVisible();
  }
  // The character counter belongs to the editor that is still mounted.
  await expect(page.locator('[data-playground-editor]')).toContainText('/500');

  // Read-only keeps the content reachable but stops the editing.
  await toggle(page, 'Read-only').click();
  await expect(page.locator(EDITOR)).toHaveAttribute(
    'contenteditable',
    'false',
  );
  await toggle(page, 'Read-only').click();
  await expect(page.locator(EDITOR)).toHaveAttribute('contenteditable', 'true');
  expect(errors).toEqual([]);
});

test("the toolbar's endContent slot reaches the editor", async ({page}) => {
  const errors = await openStory(page);
  const editor = page.locator(EDITOR);
  const tables = await editor.locator('table').count();
  await editor.click();
  await page.getByRole('button', {name: 'Table', exact: true}).click();
  await expect(editor.locator('table')).toHaveCount(tables + 1);

  // A header ROW and no header column, in every table the editor holds. GFM
  // has no header column, so a table carrying one is dropped by the
  // playground's own Markdown readout and reads as a round-trip bug no real
  // document can produce — which is what Lexical's `includeHeaders: true`
  // would make here. Asserted across all tables rather than on the one just
  // inserted: the insert lands wherever the caret is, so position is not a
  // reliable handle on it. `:first-of-type`, not `:first-child` — Lexical's
  // table opens with a `<colgroup>` and puts the rows directly in `<table>`,
  // so no `tr` is ever a first child.
  await expect(editor.locator('table tr:first-of-type th')).not.toHaveCount(0);
  await expect(editor.locator('table tr:not(:first-of-type) th')).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
});

test("the endContent controls disable with the editor, like the toolbar's own", async ({
  page,
}) => {
  const errors = await openStory(page);
  const editor = page.locator(EDITOR);
  const inserts = ['Table', 'Rule', 'Mention', 'Image'].map(name =>
    page.getByRole('button', {name, exact: true}),
  );
  const bold = page.getByRole('button', {name: 'Bold', exact: true});
  for (const state of ['Read-only', 'Disabled']) {
    await toggle(page, state).click();
    await expect(editor).toHaveAttribute('contenteditable', 'false');
    // The toolbar's own controls are the reference this matches.
    await expect(bold).toBeDisabled();
    for (const insert of inserts) {
      await expect(insert, `${state}: insert control`).toBeDisabled();
    }
    // A forced click still changes nothing in a non-editable editor.
    const before = await editor.innerHTML();
    for (const insert of inserts) {
      await insert.click({force: true});
    }
    expect(await editor.innerHTML(), `${state}: editor content`).toBe(before);
    await toggle(page, state).click();
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    for (const insert of inserts) {
      await expect(insert, `${state} off: insert control`).toBeEnabled();
    }
  }
  expect(errors).toEqual([]);
});

test('the shortcut table lists Cmd/Ctrl+K only while the toolbar registers it', async ({
  page,
}) => {
  const errors = await openStory(page);
  const linkShortcut = settings(page).getByText('Insert or edit a link');
  await expect(linkShortcut).toBeVisible();

  // The toolbar registers that key, and only while its link button is on.
  await toggle(page, 'Link button').click();
  await expect(linkShortcut).toHaveCount(0);
  await toggle(page, 'Link button').click();
  await expect(linkShortcut).toBeVisible();

  await toggle(page, 'Toolbar').click();
  await expect(linkShortcut).toHaveCount(0);

  // The rows that core and the always-on plugins answer stay listed.
  await expect(settings(page).getByText('Bold', {exact: true})).toBeVisible();
  await expect(settings(page).getByText('Undo', {exact: true})).toBeVisible();
  expect(errors).toEqual([]);
});

/**
 * Every Markdown shortcut the settings panel may promise, and what typing it
 * must produce. The panel's description is read from the DOM and checked
 * against this table, so a shortcut added to that sentence has to be proven
 * here before the suite passes — the sentence is the part that goes stale
 * (it once promised `- [ ] `, which `- ` turns into a plain bullet first, and
 * `|`, which never converts while typing at all).
 */
const MARKDOWN_SHORTCUTS: ReadonlyArray<{
  token: string;
  type: string;
  produces: string;
}> = [
  {token: '# ', type: '# a heading', produces: 'h1'},
  {token: '- ', type: '- an item', produces: 'li'},
  {token: '> ', type: '> a quote', produces: 'blockquote'},
  {token: '```', type: '```ts\nconst a = 1;', produces: 'code'},
];

test('every Markdown shortcut the panel promises actually fires', async ({
  page,
}) => {
  const errors = await openStory(page);
  const description =
    (await settings(page)
      .getByText(/^Typing /)
      .textContent()) ?? '';

  // The sentence promises exactly the shortcuts this test proves.
  const promised = [...description.matchAll(/'([^']+)'/g)].map(
    match => match[1],
  );
  expect(promised).toEqual(MARKDOWN_SHORTCUTS.map(shortcut => shortcut.token));

  const editor = page.locator(EDITOR);
  for (const {type, produces} of MARKDOWN_SHORTCUTS) {
    await page.getByRole('button', {name: 'Clear', exact: true}).click();
    await editor.click();
    await page.keyboard.type(type);
    await expect(
      editor.locator(produces),
      `typing ${JSON.stringify(type)} should produce <${produces}>`,
    ).not.toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

// The repository's Storybook audit runs axe with these exemptions; a story
// renders inside the preview iframe, not as a whole page.
const AXE_DISABLED_RULES = [
  'html-has-lang',
  'document-title',
  'landmark-one-main',
  'page-has-heading-one',
  'region',
];

/* ------------------------------------------------------------------ *
 * The image plugin
 * ------------------------------------------------------------------ */

/** The image the editor holds, as the plugin draws it. */
const IMAGE = '[data-playground-editor] [data-playground-image] img';

/** Inserts the dialog's default sample image into the one editor. */
async function insertSampleImage(page: Page): Promise<void> {
  await page.locator(EDITOR).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.getByRole('button', {name: 'Image', exact: true}).click();
  // The dialog opens on its sample source, so this is one click away.
  await expect(page.getByRole('heading', {name: 'Insert image'})).toBeVisible();
  await page.getByRole('button', {name: 'Insert image', exact: true}).click();
  await expect(page.locator(IMAGE)).toHaveCount(1);
}

/** The image's rendered width, which is what a resize moves. */
async function imageWidth(page: Page): Promise<number> {
  const box = await page.locator(IMAGE).boundingBox();
  return box?.width ?? 0;
}

test('the image plugin inserts an image through the editor nodes prop', async ({
  page,
}) => {
  const errors = await openStory(page);
  await insertSampleImage(page);

  // The alt text the sample carries reaches the DOM, so the picture is not
  // silent to a screen reader.
  await expect(page.locator(IMAGE)).toHaveAttribute(
    'alt',
    /illustration of layered hills/,
  );
  // One editor still, with the image inside the editable surface.
  await expect(
    page.locator('[role="textbox"][data-lexical-editor]'),
  ).toHaveCount(1);
  await expect(page.locator('[data-playground-stats]')).toContainText(
    '1 image',
  );
  expect(errors).toEqual([]);
});

test('a selected image resizes by its handle and by its controls, and removes itself', async ({
  page,
}) => {
  const errors = await openStory(page);
  await insertSampleImage(page);
  const image = page.locator(IMAGE);
  // The width the image draws at before anything resizes it, which is what
  // "Reset size" must restore.
  const natural = await imageWidth(page);

  // Nothing is offered until the image is selected: the controls and the
  // resize handle belong to a selected image, like Lexical's own.
  await expect(page.locator('[data-playground-image-actions]')).toHaveCount(0);
  await image.click();
  await expect(page.locator('[data-playground-image-actions]')).toHaveCount(1);

  const started = await imageWidth(page);
  await page.getByRole('button', {name: 'Larger', exact: true}).click();
  await expect
    .poll(() => imageWidth(page), {message: 'Larger widens the image'})
    .toBeGreaterThan(started + 1);

  const widened = await imageWidth(page);
  await page.getByRole('button', {name: 'Smaller', exact: true}).click();
  await expect
    .poll(() => imageWidth(page), {message: 'Smaller narrows the image'})
    .toBeLessThan(widened - 1);

  // Dragging the handle resizes too, and commits the width to the node: the
  // editor state carries it after the pointer is lifted.
  const handle = page.locator('[data-playground-image-handle]');
  const box = await handle.boundingBox();
  const before = await imageWidth(page);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y, {steps: 8});
  await page.mouse.up();
  await expect
    .poll(() => imageWidth(page), {message: 'the handle widens the image'})
    .toBeGreaterThan(before + 40);

  await page.getByRole('tab', {name: 'Editor state'}).click();
  await expect(page.locator('[data-playground-output]')).toContainText(
    /"width":\s*\d+/,
  );

  // Reset size puts the image back to the width it drew at when it arrived.
  await page.getByRole('button', {name: 'Reset size', exact: true}).click();
  await expect
    .poll(() => imageWidth(page), {message: 'Reset size restores the image'})
    .toBeCloseTo(natural, 0);

  await page.getByRole('button', {name: 'Remove image', exact: true}).click();
  await expect(page.locator(IMAGE)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Enter opens a selected image's controls, activates them, and Escape leaves", async ({
  page,
}) => {
  const errors = await openStory(page);
  await insertSampleImage(page);
  await page.locator(IMAGE).click();

  // Tab indents inside the editor, so Enter is the keyboard route into the
  // controls of the selected image — without it they are mouse-only.
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', {name: 'Smaller', exact: true}),
  ).toBeFocused();

  // Enter pressed ON a control bubbles back to the editor, where the image is
  // still the selected node: the handler that opened the controls has to let
  // that keystroke through, or every control is dead to the keyboard.
  const before = await imageWidth(page);
  await page.keyboard.press('Enter');
  await expect
    .poll(() => imageWidth(page), {message: 'Enter on Smaller narrows it'})
    .toBeLessThan(before - 1);

  const narrowed = await imageWidth(page);
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', {name: 'Larger', exact: true}),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => imageWidth(page), {message: 'Enter on Larger widens it'})
    .toBeGreaterThan(narrowed + 1);

  await page.keyboard.press('Escape');
  await expect(page.locator(EDITOR)).toBeFocused();
  expect(errors).toEqual([]);
});

test('the resize handle follows the drag in a right-to-left document', async ({
  page,
}) => {
  // The handle sits on the inline end, which is the image's LEFT edge here,
  // so dragging it outward lowers clientX. A width that followed the axis
  // rather than the drag would shrink the image instead.
  const errors = await openStory(page, 'rtl');
  await insertSampleImage(page);
  await page.locator(IMAGE).click();
  // Narrow it first: at its own width the picture is already near the
  // measure, and `max-width: 100%` would absorb the drag.
  await page.getByRole('button', {name: 'Smaller', exact: true}).click();
  await page.getByRole('button', {name: 'Smaller', exact: true}).click();
  const before = await imageWidth(page);

  const handle = page.locator('[data-playground-image-handle]');
  const box = await handle.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 - 80, box!.y, {steps: 8});
  await page.mouse.up();
  await expect
    .poll(() => imageWidth(page), {message: 'dragging outward widens it'})
    .toBeGreaterThan(before + 40);
  expect(errors).toEqual([]);
});

test('an image reaches the state, the HTML and RichTextView, and says why it is not in the Markdown', async ({
  page,
}) => {
  const errors = await openStory(page);
  await insertSampleImage(page);
  const output = page.locator('[data-playground-output]');

  await page.getByRole('tab', {name: 'Editor state'}).click();
  await expect(output).toContainText('"playground-image"');

  await page.getByRole('tab', {name: 'Node tree'}).click();
  await expect(output).toContainText('playground-image alt=');

  await page.getByRole('tab', {name: 'HTML'}).click();
  await expect(output).toContainText('<img');

  await page.getByRole('tab', {name: 'RichTextView'}).click();
  await expect(output.locator('img')).toHaveCount(1);

  // The Markdown readout does NOT carry the image, because RichText's default
  // transformer array is internal and `transformers` replaces it whole. A
  // readout that silently dropped content would read as a bug, so the
  // playground says so where the content is missing.
  await page.getByRole('tab', {name: 'Markdown'}).click();
  await expect(output).not.toContainText('![');
  await expect(output).toContainText('missing from this Markdown');
  expect(errors).toEqual([]);
});

test('turning the image node off takes the document back through Markdown', async ({
  page,
}) => {
  const errors = await openStory(page);
  await insertSampleImage(page);
  await expect(page.locator(IMAGE)).toHaveCount(1);

  // Every switch that re-imports the document from Markdown drops the images
  // with it, so each one says so where a reader decides to flip it.
  await expect(settings(page)).toContainText(
    'Markdown, where images do not survive',
  );

  // `nodes` is read at construction, so the switch rebuilds the editor. State
  // holding an image cannot be parsed without the node registered, so the
  // document round-trips through Markdown — and the image does not survive.
  await toggle(page, 'Images').click();
  await expect(page.locator(EDITOR)).toBeVisible();
  await expect(page.locator(IMAGE)).toHaveCount(0);
  await expect(
    page.getByRole('button', {name: 'Image', exact: true}),
  ).toHaveCount(0);
  // The document itself is still here.
  await expect(page.locator(`${EDITOR} table`)).toHaveCount(1);

  await toggle(page, 'Images').click();
  await expect(
    page.getByRole('button', {name: 'Image', exact: true}),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('an image file dropped or pasted into the editor becomes an image', async ({
  page,
}) => {
  const errors = await openStory(page);
  await page.locator(EDITOR).click();
  await page.keyboard.press('ControlOrMeta+End');

  // A real drop and a real paste cannot be driven from the test runner, so the
  // events are built with the same shapes a browser delivers: a DragEvent and
  // a ClipboardEvent, each carrying one image file.
  const deliverFile = (type: 'drop' | 'paste') =>
    page.evaluate(async (eventType: string) => {
      const pixel =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const blob = await (await fetch(pixel)).blob();
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([blob], `${eventType}ped.png`, {type: 'image/png'}),
      );
      const target = document.querySelector(
        '[data-playground-editor] [role="textbox"]',
      );
      target?.dispatchEvent(
        eventType === 'drop'
          ? new DragEvent('drop', {
              bubbles: true,
              cancelable: true,
              dataTransfer: transfer,
            })
          : new ClipboardEvent('paste', {
              bubbles: true,
              cancelable: true,
              clipboardData: transfer,
            }),
      );
    }, type);

  await deliverFile('drop');
  await expect(page.locator(IMAGE)).toHaveCount(1);
  // The file's name is the alt text until someone says better.
  await expect(page.locator(IMAGE)).toHaveAttribute('alt', 'dropped.png');

  await deliverFile('paste');
  await expect(page.locator(IMAGE)).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('a dropped image lands where it was dropped, not at the caret', async ({
  page,
}) => {
  const errors = await openStory(page);
  // The caret is at the very start of the document…
  await page.locator(EDITOR).click();
  await page.keyboard.press('ControlOrMeta+Home');

  // …and the file is dropped on the last paragraph, far from it. The plugin
  // consumes DROP_COMMAND ahead of the rich-text handler that would have
  // moved the selection to the drop point, so it has to do that itself.
  const target = page.locator(`${EDITOR} > p`).last();
  // The drop point is a VIEWPORT coordinate, which is what the browser gives
  // a real drop and what `caretPositionFromPoint` reads; the seeded document
  // is taller than the viewport, so the target has to be on screen first.
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  const dropAt = {x: box!.x + box!.width / 2, y: box!.y + box!.height / 2};
  await page.evaluate(async ({x, y}: {x: number; y: number}) => {
    const pixel =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const blob = await (await fetch(pixel)).blob();
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'placed.png', {type: 'image/png'}));
    document
      .querySelector('[data-playground-editor] [role="textbox"]')
      ?.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          dataTransfer: transfer,
        }),
      );
  }, dropAt);

  await expect(page.locator(IMAGE)).toHaveCount(1);
  // Where it was dropped. Position, not block identity: inserting at a caret
  // inside a paragraph splits it, so the image lands in a paragraph of its
  // own between the halves — which is correct, and is not the element that
  // was dropped on.
  const landed = await page.locator(IMAGE).boundingBox();
  expect(
    Math.abs(landed!.y - dropAt.y),
    'the image is at the drop point, not at the caret',
  ).toBeLessThan(80);
  // The caret was in the heading, at the top of a document taller than this.
  const heading = await page.locator(`${EDITOR} h1`).boundingBox();
  expect(landed!.y - heading!.y).toBeGreaterThan(200);
  expect(errors).toEqual([]);
});

test('a file dropped onto a decorator lands beside it, not at the top', async ({
  page,
}) => {
  const errors = await openStory(page);
  // An image to drop onto, with the caret left near it rather than at the top
  // of the document, so "landed at the top" cannot pass by accident.
  await insertSampleImage(page);
  const existing = page.locator(IMAGE);
  await existing.scrollIntoViewIfNeeded();
  const box = await existing.boundingBox();

  // A point inside a decorator resolves to no Lexical position, and a fresh
  // range selection then sits at the root's offset 0 — the top of the
  // document, nowhere near the drop.
  await page.evaluate(
    async ({x, y}: {x: number; y: number}) => {
      const pixel =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const blob = await (await fetch(pixel)).blob();
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], 'beside.png', {type: 'image/png'}));
      document
        .querySelector('[data-playground-editor] [role="textbox"]')
        ?.dispatchEvent(
          new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            dataTransfer: transfer,
          }),
        );
    },
    {x: box!.x + box!.width / 2, y: box!.y + box!.height / 2},
  );

  await expect(page.locator(IMAGE)).toHaveCount(2);
  const dropped = page.locator(`${EDITOR} img[alt="beside.png"]`);
  await expect(dropped).toHaveCount(1);
  // Beside the image it was dropped on, not above the document's heading.
  const landed = await dropped.boundingBox();
  const heading = await page.locator(`${EDITOR} h1`).boundingBox();
  expect(
    landed!.y - heading!.y,
    'the file landed beside the decorator, not at the top',
  ).toBeGreaterThan(200);
  expect(errors).toEqual([]);
});

test('the insert dialog is tabbable, outside the toolbar roving tab stop', async ({
  page,
}) => {
  const errors = await openStory(page);
  const button = page.getByRole('button', {name: 'Image', exact: true});
  await button.focus();
  await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', {name: 'Insert image'})).toBeVisible();

  // A Toolbar is a roving tab stop: everything inside it is tabindex="-1", so
  // a dialog rendered in its endContent could not be tabbed through at all.
  // The dialog goes in the editor's plugins slot instead, beside the toolbar
  // — which is where RichTextEditorToolbar puts its own link dialog.
  const insert = page.getByRole('button', {name: 'Insert image', exact: true});
  for (let press = 0; press < 12; press += 1) {
    if (await insert.evaluate(el => el === document.activeElement)) {
      break;
    }
    await page.keyboard.press('Tab');
  }
  await expect(insert).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.locator(IMAGE)).toHaveCount(1);
  // And focus lands back in the editor, not on the button that opened the
  // dialog: a Dialog returns focus to its invoker as it closes, so the next
  // keystroke would otherwise reopen it instead of typing.
  await expect(page.locator(EDITOR)).toBeFocused();
  await page.keyboard.type('after the image');
  await expect(page.locator(EDITOR)).toContainText('after the image');
  expect(errors).toEqual([]);
});

test('the RichTextView readout survives the image node arriving under it', async ({
  page,
}) => {
  const errors = await openStory(page);
  const output = page.locator('[data-playground-output]');

  // The view reads `nodes` once, when it builds its own editor. Opened while
  // images are off, it would then fail to parse state holding one and render
  // its empty fallback — the whole document gone, not just the image.
  await toggle(page, 'Images').click();
  await page.getByRole('tab', {name: 'RichTextView'}).click();
  await expect(output.locator('table')).toHaveCount(1);

  await toggle(page, 'Images').click();
  await insertSampleImage(page);
  await page.getByRole('tab', {name: 'RichTextView'}).click();
  await expect(output.locator('img')).toHaveCount(1);
  // The document is still under it, not an empty fallback.
  await expect(output.locator('table')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('the story has no axe violations', async ({page}) => {
  const errors = await openStory(page);
  const results = await new AxeBuilder({page})
    .disableRules(AXE_DISABLED_RULES)
    .analyze();
  expect(
    results.violations.map(violation => [
      violation.id,
      violation.nodes.map(node => node.target.join(' ')),
    ]),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('the story has no axe violations with a selected image in it', async ({
  page,
}) => {
  const errors = await openStory(page);
  await insertSampleImage(page);
  await page.locator(IMAGE).click();
  await expect(page.locator('[data-playground-image-actions]')).toHaveCount(1);
  const results = await new AxeBuilder({page})
    .disableRules(AXE_DISABLED_RULES)
    .analyze();
  expect(
    results.violations.map(violation => [
      violation.id,
      violation.nodes.map(node => node.target.join(' ')),
    ]),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
