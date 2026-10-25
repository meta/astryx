// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Markdown richtext/* ^(apps/storybook/stories/RichTextEditor\.(markdownParity|stories)|packages/richtext/src/__tests__/(MarkdownParitySandbox|RichTextView|RichTextEditorToolbar)) ^packages/richtext/src/

/**
 * @file MarkdownParitySandbox.a11y.chromium.spec.ts
 * @input The RichTextEditor "Markdown parity" stories in a built Storybook
 * @output Real-Chromium proof that the parity sandbox works, plus screenshots
 *   and a geometry manifest of today's Markdown/RichText differences under
 *   test-results/richtext-markdown-parity/
 * @position Evidence for a Storybook diagnostic, not a parity contract. It
 *   asserts that the sandbox renders one fixture on both surfaces, keeps the
 *   source across a read/edit/read switch, follows direction and phone widths,
 *   fills in its measurements, logs no console errors, and has no axe
 *   violations. Every Markdown/RichText difference is recorded; none is
 *   asserted.
 *
 * Build the Storybook first:
 *
 *   pnpm storybook:build
 *   pnpm exec playwright test MarkdownParitySandbox.a11y.chromium.spec.ts
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('test-results/richtext-markdown-parity');

const STORY = {
  sideBySide: 'richtext-richtexteditor--markdown-parity',
  toggle: 'richtext-richtexteditor--markdown-parity-toggle',
  overlay: 'richtext-richtexteditor--markdown-parity-overlay',
  longDocument: 'richtext-richtexteditor--markdown-parity-long-document',
} as const;

/** The exemptions the repository's Storybook axe audit already makes. */
const AXE_DISABLED_RULES = [
  'html-has-lang',
  'document-title',
  'landmark-one-main',
  'page-has-heading-one',
  'region',
];

const DESKTOP = {width: 1440, height: 900} as const;
const PHONE = {width: 390, height: 844} as const;

type Viewport = {readonly width: number; readonly height: number};

interface BlockGeometry {
  readonly key: string;
  readonly copy: number;
  readonly tag: string;
  readonly direction: string;
  readonly top: number;
  readonly height: number;
  readonly width: number;
}

interface SurfaceGeometry {
  readonly height: number;
  readonly width: number;
  readonly direction: string;
  readonly blocks: readonly BlockGeometry[];
}

const STORYBOOK_DIR = process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR;

let storybook: StaticServer;
let browserVersion = '';

test.beforeAll(async ({browser}) => {
  // Not wiped: a worker restarted after a failure must keep earlier frames.
  fs.mkdirSync(OUTPUT, {recursive: true});
  browserVersion = browser.version();
  storybook = await serveStorybook(STORYBOOK_DIR);
});

test.afterAll(async () => {
  const captures = fs
    .readdirSync(OUTPUT)
    .filter(name => name.endsWith('.json') && name !== 'manifest.json')
    .sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(OUTPUT, name), 'utf8')));
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(
      {
        version: 1,
        headSha: process.env.ASTRYX_HEAD_SHA ?? null,
        // CI stamps the commit a Storybook artifact was built from.
        storybookSha: storybookStamp(),
        browser: browserVersion,
        captures,
      },
      null,
      2,
    )}\n`,
  );
  await storybook?.close();
});

function storybookStamp(): string | null {
  const stamp = path.join(STORYBOOK_DIR, 'astryx-build-sha.txt');
  return fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8').trim() : null;
}

/** Opens a story and returns the console errors it logs from then on. */
async function openStory(
  page: Page,
  story: string,
  viewport: Viewport,
  globals = 'colorMode:light;direction:ltr',
): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', message => {
    const source = message.location().url;
    // Chromium asks the static server for /favicon.ico on its own, and a built
    // Storybook ships none; that 404 is not something the page did.
    if (message.type() === 'error' && !source.endsWith('/favicon.ico')) {
      errors.push(`${message.text()} (${source})`);
    }
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) {
      errors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  await page.setViewportSize(viewport);
  await page.goto(
    `${storybook.origin}/iframe.html?id=${story}&viewMode=story&globals=astryxTheme:neutral;${globals}`,
    {waitUntil: 'load'},
  );
  await page.locator('[data-parity-sandbox]').waitFor();
  await holdMotionStill(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return errors;
}

/** The toggle story's one control: pressed means the edit surface is up. */
const editMode = (page: Page) => page.getByRole('button', {name: 'Edit mode'});

async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** The fixture's block keys, in order, from the sandbox's measurement rows. */
async function fixtureKeys(page: Page): Promise<string[]> {
  const keys = await page
    .locator('[data-parity-row]')
    .evaluateAll(rows =>
      rows.map(row => row.getAttribute('data-parity-row') ?? ''),
    );
  return keys.filter(key => key !== 'surface');
}

/**
 * Waits until a surface has painted the last block of the last copy: only a
 * fully rendered document gets that far.
 */
async function waitForDocument(page: Page, surface: string): Promise<void> {
  const keys = await fixtureKeys(page);
  const copies = await page
    .locator('[data-parity-sandbox]')
    .getAttribute('data-parity-copies');
  await page
    .locator(
      `${surface} [data-parity-block="${keys.at(-1)}"][data-parity-copy="${copies}"]`,
    )
    .waitFor();
  await settle(page);
}

async function surfaceGeometry(
  page: Page,
  surface: string,
): Promise<SurfaceGeometry> {
  return page.locator(`${surface} > [data-parity-body]`).evaluate(body => {
    const origin = body.getBoundingClientRect();
    const blocks = Array.from(
      body.querySelectorAll<HTMLElement>('[data-parity-block]'),
      element => {
        const rect = element.getBoundingClientRect();
        return {
          key: element.dataset.parityBlock ?? '',
          copy: Number(element.dataset.parityCopy),
          tag: element.tagName.toLowerCase(),
          direction: getComputedStyle(element).direction,
          top: rect.top - origin.top,
          height: rect.height,
          width: rect.width,
        };
      },
    );
    return {
      height: origin.height,
      width: origin.width,
      direction: getComputedStyle(body).direction,
      blocks,
    };
  });
}

const pairedKeys = (geometry: SurfaceGeometry): string[] =>
  geometry.blocks.filter(block => block.copy === 1).map(block => block.key);

async function axeViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({page})
    .include('#storybook-root')
    .disableRules(AXE_DISABLED_RULES)
    .analyze();
  return results.violations.map(
    violation =>
      `${violation.id}: ${violation.nodes
        .map(node => node.target.join(' '))
        .join(', ')}`,
  );
}

/** Banks a screenshot with its receipt; receipts are merged in afterAll. */
async function capture(
  page: Page,
  name: string,
  details: Record<string, unknown>,
  {fullPage = true}: {fullPage?: boolean} = {},
): Promise<void> {
  const file = `${name}.png`;
  const png = await page.screenshot({path: path.join(OUTPUT, file), fullPage});
  fs.writeFileSync(
    path.join(OUTPUT, `${name}.json`),
    `${JSON.stringify(
      {
        file,
        sha256: crypto.createHash('sha256').update(png).digest('hex'),
        ...details,
      },
      null,
      2,
    )}\n`,
  );
}

const MARKDOWN = '[data-parity-surface="markdown"]';
const RICH_TEXT = '[data-parity-surface="richtext"]';
const TOGGLE = '[data-parity-surface="toggle"]';

// A table must stay inside its own wrapper in the editor and the view, however
// the host lays them out. Grid and flex items default to their content's
// min-content width, so a wrapper that reports its table's width widens the
// page; a shrink-to-fit host (a chat bubble, an inline-block) must still give
// a small table its natural width. The Markdown Serializers story renders the
// editor and the view; each case restyles the story's layout into one host.
// `surfaces` names which of the story's two surfaces stay in the host: a flex
// row holds one at a time, because the editor's toolbar has its own minimum
// width that has nothing to do with tables.
const TABLE_HOSTS = {
  grid: {
    layout: 'display:grid;gap:24px;max-width:720px',
    view: '',
    surfaces: 'both',
  },
  'flex row with the editor': {
    layout: 'display:flex;flex-direction:row;max-width:720px',
    view: '',
    surfaces: 'editor',
  },
  'flex row with the view': {
    layout: 'display:flex;flex-direction:row;max-width:720px',
    view: '',
    surfaces: 'view',
  },
  'fit-content bubble': {
    layout: 'display:block;max-width:720px',
    view: 'width:fit-content;max-width:100%',
    surfaces: 'both',
  },
  'inline-block': {
    layout: 'display:block;max-width:720px',
    view: 'display:inline-block;width:auto;max-width:100%;vertical-align:top',
    surfaces: 'both',
  },
} as const;

const tableSource = (columnCount: number) => {
  const columns = Array.from(
    {length: columnCount},
    (_, index) => `Column ${index + 1}`,
  );
  return [
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    `| ${columns.map((_, index) => `value-${index + 1}`).join(' | ')} |`,
  ].join('\n');
};

// spec:AST-061 FR3: a rule at the start or end of a document adds no margin
// at that edge, like every other block, in the editor and the view.
test('a rule at either edge of the document adds no outer margin', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto(
    `${storybook.origin}/iframe.html?id=richtext-richtexteditor--markdown-serializers&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:ltr`,
    {waitUntil: 'load'},
  );
  await page.locator('textarea').fill('---\n\nBetween the rules.\n\n---');
  await expect(page.locator('hr:visible')).toHaveCount(4);
  const margins = await page.evaluate(() =>
    [...document.querySelectorAll('[data-lexical-editor]')]
      .filter(root => root.querySelector('hr') != null)
      .map(root => {
        const rules = root.querySelectorAll('hr');
        const first = getComputedStyle(rules[0]);
        const last = getComputedStyle(rules[rules.length - 1]);
        return [
          first.marginTop,
          first.marginBottom,
          last.marginTop,
          last.marginBottom,
        ];
      }),
  );
  // Editor and view: no margin at the outer edges, the full 24px inside.
  expect(margins).toEqual([
    ['0px', '24px', '24px', '0px'],
    ['0px', '24px', '24px', '0px'],
  ]);
});

// component:Markdown FR23 and spec:AST-061 FR5: in a list that mixes task
// and plain items, each task item keeps its checked state as a checkbox where
// its marker would be, each plain item keeps its marker, and the list stays
// one list — on both surfaces, in the same places.
test('side by side: a list of task and plain items keeps each task checkbox and each marker', async ({
  page,
}) => {
  const errors = await openStory(page, STORY.sideBySide, DESKTOP);
  await waitForDocument(page, MARKDOWN);
  await waitForDocument(page, RICH_TEXT);
  const layout = (selector: string) =>
    page.evaluate(surface => {
      const block = document.querySelector(
        `${surface} [data-parity-block="list-task-mixed"]`,
      );
      const origin = block?.getBoundingClientRect().left ?? 0;
      const items = [...(block?.querySelectorAll('li') ?? [])];
      const left = (element: Element | null | undefined) =>
        element == null
          ? null
          : Math.round(element.getBoundingClientRect().left - origin);
      // An item's visible text nodes: not its checkbox's label, which names
      // the checkbox for assistive technology.
      const visibleText = (item: Element) => {
        const nodes: Text[] = [];
        const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (
            node.textContent?.trim() &&
            node.parentElement?.closest('label') == null
          ) {
            nodes.push(node as Text);
          }
        }
        return nodes;
      };
      // Where an item's first rendered line of text starts.
      const textStart = (item: Element) => {
        const [first] = visibleText(item);
        if (first == null) {
          return null;
        }
        const range = document.createRange();
        range.selectNodeContents(first);
        return Math.round(range.getBoundingClientRect().left - origin);
      };
      // RichText draws each task checkbox beside the editable text and gives
      // the item it belongs to through aria-owns.
      const checkboxOf = (item: Element) => {
        const owned = item.getAttribute('aria-owns');
        const target = owned == null ? null : document.getElementById(owned);
        return (
          item.querySelector<HTMLInputElement>('input[type="checkbox"]') ??
          (target instanceof HTMLInputElement
            ? target
            : (target?.querySelector<HTMLInputElement>(
                'input[type="checkbox"]',
              ) ?? null))
        );
      };
      return {
        // RichText marks the list itself; Markdown, the block around it.
        lists:
          (block?.matches('ul, ol') ? 1 : 0) +
          (block?.querySelectorAll('ul, ol').length ?? 0),
        items: items.map(item => {
          const box = checkboxOf(item);
          return {
            text: visibleText(item)
              .map(node => node.textContent)
              .join('')
              .trim(),
            checked: box?.checked ?? null,
            box: left(box),
            textStart: textStart(item),
          };
        }),
      };
    }, selector);
  const markdown = await layout(MARKDOWN);
  const richText = await layout(RICH_TEXT);
  expect(markdown.lists).toBe(1);
  expect(richText.lists).toBe(1);
  expect(markdown.items.map(({text, checked}) => [text, checked])).toEqual([
    ['Mixed open task', false],
    ['Mixed plain item', null],
    ['Mixed done task', true],
  ]);
  expect(richText.items.map(({text, checked}) => [text, checked])).toEqual(
    markdown.items.map(({text, checked}) => [text, checked]),
  );
  markdown.items.forEach((item, index) => {
    const other = richText.items[index];
    expect(
      Math.abs((other?.textStart ?? 0) - (item.textStart ?? 0)),
      `text of ${item.text}`,
    ).toBeLessThanOrEqual(1);
    if (item.box != null) {
      expect(
        Math.abs((other?.box ?? 0) - item.box),
        `checkbox of ${item.text}`,
      ).toBeLessThanOrEqual(1);
    }
  });
  expect(errors).toEqual([]);
});

// spec:AST-061 FR5: each task item has one real checkbox where core
// Markdown's is, the item stays a list item, and every list row has one
// marker.
test('side by side: task items have one checkbox each, and list rows one marker each', async ({
  page,
}) => {
  const errors = await openStory(page, STORY.sideBySide, DESKTOP);
  await waitForDocument(page, MARKDOWN);
  await waitForDocument(page, RICH_TEXT);
  // Two in the task list, two in the list that mixes task and plain items.
  await expect(
    page.locator(`${RICH_TEXT} [data-richtext-task-checkbox] input`),
  ).toHaveCount(4);
  const layout = (selector: string) =>
    page.evaluate(surface => {
      const block = document.querySelector(
        `${surface} [data-parity-block="list-task"]`,
      );
      const origin = block?.getBoundingClientRect();
      // Each item's checkbox: inside it in Markdown; in RichText, beside the
      // editable text, given to the item through aria-owns.
      const boxes = [...(block?.querySelectorAll('li') ?? [])].flatMap(item => {
        const owned = item.getAttribute('aria-owns');
        const target = owned == null ? null : document.getElementById(owned);
        const box =
          item.querySelector<HTMLInputElement>('input[type="checkbox"]') ??
          (target instanceof HTMLInputElement
            ? target
            : (target?.querySelector<HTMLInputElement>(
                'input[type="checkbox"]',
              ) ?? null));
        return box == null ? [] : [box];
      });
      const label = [...(block?.querySelectorAll('li span') ?? [])].find(span =>
        span.textContent?.startsWith('Open task'),
      );
      const rows = [
        ...(document
          .querySelector(`${surface} [data-parity-block="list-unordered"]`)
          ?.querySelectorAll('li') ?? []),
      ];
      return {
        checked: boxes.map(box => box.checked),
        box: boxes[0]
          ? Math.round(
              (boxes[0].parentElement?.getBoundingClientRect().left ?? 0) -
                (origin?.left ?? 0),
            )
          : null,
        textStart: Math.round(
          (label?.getBoundingClientRect().left ?? 0) - (origin?.left ?? 0),
        ),
        checkboxItems: block?.querySelectorAll('li[role="checkbox"]').length,
        rowMarkers: rows.filter(
          row => getComputedStyle(row).listStyleType !== 'none',
        ).length,
        rowsWithText: rows.filter(row => row.querySelector('ul, ol') == null)
          .length,
      };
    }, selector);
  const markdown = await layout(MARKDOWN);
  const richText = await layout(RICH_TEXT);
  expect(richText.checked).toEqual([false, true]);
  expect(richText.checked).toEqual(markdown.checked);
  // The checkbox and the text sit where core Markdown's do.
  expect(
    Math.abs((richText.box ?? 0) - (markdown.box ?? 0)),
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(richText.textStart - markdown.textStart)).toBeLessThanOrEqual(
    1,
  );
  // The item is a list item, not a checkbox of its own.
  expect(richText.checkboxItems).toBe(0);
  // One marker per row with text; a wrapper around a nested list has none.
  expect(richText.rowMarkers).toBe(richText.rowsWithText);
  // The editor's checkbox checks its item.
  const first = page
    .locator(`${RICH_TEXT} [data-richtext-task-checkbox] input`)
    .first();
  await first.click();
  await expect(first).toBeChecked();
  expect(errors).toEqual([]);
});

// spec:AST-061 FR5: each task item exposes its checkbox and state inside
// the item in the accessibility tree, the read-only checkboxes take no tab
// stop between the view's links, and the editor checks an item by keyboard
// (Mod+Enter) and undoes it.
test('task items own their checkboxes, keep link tab order, and toggle by keyboard', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto(
    `${storybook.origin}/iframe.html?id=richtext-richtexteditor--markdown-serializers&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:ltr`,
    {waitUntil: 'load'},
  );
  await page
    .locator('textarea')
    .fill(
      '[before](https://example.com/before)\n\n- [ ] Open task\n- [x] Done task\n    - [ ] Nested task\n\n[after](https://example.com/after)',
    );
  await expect(page.locator('[data-richtext-task-checkbox] input')).toHaveCount(
    6,
  );
  // Chrome's accessibility tree: each task item holds one checkbox with the
  // item's state, in document order, in the editor and the view.
  const client = await page.context().newCDPSession(page);
  const {nodes} = (await client.send('Accessibility.getFullAXTree')) as {
    nodes: Array<{
      nodeId: string;
      role?: {value?: string};
      childIds?: Array<string>;
      properties?: Array<{name: string; value: {value?: unknown}}>;
    }>;
  };
  const byId = new Map(nodes.map(node => [node.nodeId, node]));
  const checkedOf = (node: (typeof nodes)[number]) =>
    node.properties?.find(property => property.name === 'checked')?.value.value;
  // The checkboxes inside one item, not inside the items nested in it.
  const checkboxesIn = (id: string): Array<unknown> => {
    const node = byId.get(id);
    if (node == null || node.role?.value === 'listitem') {
      return [];
    }
    if (node.role?.value === 'checkbox') {
      return [checkedOf(node)];
    }
    return (node.childIds ?? []).flatMap(checkboxesIn);
  };
  const itemStates = nodes
    .filter(node => node.role?.value === 'listitem')
    .map(node => (node.childIds ?? []).flatMap(checkboxesIn))
    .filter(states => states.length > 0);
  // Six task items (three per surface), each holding exactly one checkbox;
  // two are checked. Which item owns which checkbox is unit-tested.
  expect(itemStates.map(states => states.length)).toEqual([1, 1, 1, 1, 1, 1]);
  expect(itemStates.flat().map(String).sort()).toEqual([
    'false',
    'false',
    'false',
    'false',
    'true',
    'true',
  ]);
  // In the view, Tab goes from the link before the list to the link after it.
  const view = page.locator('[contenteditable="false"]').filter({
    has: page.locator('a'),
  });
  await view.getByRole('link', {name: 'before'}).focus();
  await page.keyboard.press('Tab');
  await expect(view.getByRole('link', {name: 'after'})).toBeFocused();
  // In the editor, Mod+Enter checks the item holding the caret; undo reverts.
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.getByText('Open task').click();
  await page.keyboard.press('ControlOrMeta+Enter');
  const editorBoxes = page
    .locator('[data-richtext-task-checkbox] input')
    .first();
  await expect(editorBoxes).toBeChecked();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editorBoxes).not.toBeChecked();
  // Task and plain items written together are one list: one marker for each
  // plain item, one checkbox for each task, and no gap between them.
  await page
    .locator('textarea')
    .fill('- [ ] Task one\n- Plain item\n- [x] Task two');
  await expect(page.locator('[data-richtext-task-checkbox] input')).toHaveCount(
    4,
  );
  const mixed = await page.evaluate(() =>
    [...document.querySelectorAll('[data-lexical-editor]')].map(root => {
      const lists = root.querySelectorAll(':scope > ul');
      const rows = [...root.querySelectorAll(':scope > ul > li')];
      return {
        lists: lists.length,
        markers: rows.map(row => getComputedStyle(row).listStyleType),
        owned: rows.map(row => row.hasAttribute('aria-owns')),
        pitch: rows
          .slice(1)
          .map(
            (row, index) =>
              row.getBoundingClientRect().top -
              rows[index].getBoundingClientRect().top,
          ),
      };
    }),
  );
  for (const surface of mixed) {
    expect(surface.lists).toBe(1);
    expect(surface.markers).toEqual(['none', 'disc', 'none']);
    expect(surface.owned).toEqual([true, false, true]);
    // Every row the same pitch: no block gap splits the list.
    expect(new Set(surface.pitch.map(Math.round)).size).toBe(1);
  }
  // Enter at the end of a checked task makes a new, unchecked task the list
  // owns; undo removes it and redo brings it back unchecked.
  const boxes = page.locator('[data-richtext-task-checkbox] input');
  await editor.getByText('Task two').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Task three');
  await expect(boxes).toHaveCount(5);
  await expect(boxes.nth(1)).toBeChecked();
  await expect(boxes.nth(2)).not.toBeChecked();
  await expect(editor.locator('li[aria-owns]')).toHaveCount(3);
  for (let undo = 0; undo < 3 && (await boxes.count()) > 4; undo++) {
    await page.keyboard.press('ControlOrMeta+z');
  }
  await expect(boxes).toHaveCount(4);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(boxes).toHaveCount(5);
  await expect(boxes.nth(2)).not.toBeChecked();
  // The view's checkboxes are read-only.
  const viewBox = page.locator('[data-richtext-task-checkbox] input').nth(3);
  await expect(viewBox).toHaveAttribute('aria-readonly', 'true');
});

// spec:AST-061 FR8: a fenced code block has the same frame and header on
// both surfaces, so the code sits at the same place; the header is not part
// of the editable text.
/**
 * Whether core Markdown scrolls a fence's lines sideways. Under spec:AST-061
 * FR5 / DEC-9 it never does: both surfaces wrap long code lines.
 */
async function markdownFenceScrolls(page: Page, key: string): Promise<boolean> {
  return page.evaluate(
    ({surface, block}) =>
      [
        ...document.querySelectorAll<HTMLElement>(
          `${surface} [data-parity-block="${block}"] *`,
        ),
      ].some(element => element.scrollWidth > element.clientWidth + 1),
    {surface: MARKDOWN, block: key},
  );
}

for (const viewport of [PHONE, DESKTOP, {width: 2200, height: 900}] as const) {
  test(`side by side: a fenced code block has core Markdown's frame and header (${viewport.width}px)`, async ({
    page,
  }) => {
    const errors = await openStory(page, STORY.sideBySide, viewport);
    await waitForDocument(page, MARKDOWN);
    await waitForDocument(page, RICH_TEXT);
    const markdown = await surfaceGeometry(page, MARKDOWN);
    const richText = await surfaceGeometry(page, RICH_TEXT);
    // Fenced code wraps on both surfaces (spec:AST-061 FR5, DEC-9): no fence
    // scrolls sideways.
    for (const key of ['code-fence', 'code-long']) {
      expect(await markdownFenceScrolls(page, key), `${key} scrolls`).toBe(
        false,
      );
    }
    // Each frame is sized like core Markdown's: as wide as its longest line,
    // at least the 680px measure (or the whole width when narrower), and no
    // wider than the surface. Each surface is measured against its own width.
    const frames = await page.evaluate(
      ({markdownSurface, richTextSurface, keys}) =>
        keys.map(key => {
          const markdownBlock = document.querySelector<HTMLElement>(
            `${markdownSurface} [data-parity-block="${key}"]`,
          );
          const markdownFrame = [
            markdownBlock,
            ...(markdownBlock?.querySelectorAll<HTMLElement>('*') ?? []),
          ].find(element => {
            const style = element == null ? null : getComputedStyle(element);
            return (
              style != null &&
              style.borderTopStyle !== 'none' &&
              parseFloat(style.borderTopWidth) > 0
            );
          });
          const richTextFrame = document.querySelector<HTMLElement>(
            `${richTextSurface} [data-parity-block="${key}"]`,
          );
          const editable = richTextFrame?.parentElement;
          const editableStyle =
            editable == null ? null : getComputedStyle(editable);
          return {
            key,
            markdown: markdownFrame?.getBoundingClientRect().width ?? 0,
            markdownRoom: markdownBlock?.getBoundingClientRect().width ?? 0,
            richText: richTextFrame?.getBoundingClientRect().width ?? 0,
            richTextRoom:
              editable == null || editableStyle == null
                ? 0
                : editable.clientWidth -
                  parseFloat(editableStyle.paddingLeft) -
                  parseFloat(editableStyle.paddingRight),
          };
        }),
      {
        markdownSurface: MARKDOWN,
        richTextSurface: RICH_TEXT,
        keys: ['code-fence', 'code-plain', 'code-unknown', 'code-long'],
      },
    );
    // The editor's frame is 18px narrower than the reader's at every width
    // (the field inset). Above phone width `code-long` still wraps to the same
    // number of lines on both surfaces (two at 1440px), so the block is as
    // tall in read as in edit mode (DEC-9). At phone width it takes one more
    // line in the editor: the known editor-frame gap that AST-061's
    // Current-state impact records, so the check skips that width.
    if (viewport.width !== PHONE.width) {
      for (const key of ['code-fence', 'code-long']) {
        const block = (geometry: SurfaceGeometry) =>
          geometry.blocks.find(candidate => candidate.key === key);
        expect(
          Math.abs(
            (block(richText)?.height ?? 0) - (block(markdown)?.height ?? 0),
          ),
          `${key} height`,
        ).toBeLessThanOrEqual(2);
      }
    }
    for (const frame of frames) {
      if (frame.key === 'code-long') {
        // A long line widens the frame past the measure, up to the room.
        const markdownWide = Math.min(frame.markdownRoom, frame.markdown);
        expect(frame.markdown, frame.key).toBeGreaterThan(
          Math.min(680, frame.markdownRoom) - 1,
        );
        expect(frame.richText, frame.key).toBeLessThanOrEqual(
          frame.richTextRoom + 1,
        );
        if (frame.markdown < frame.markdownRoom - 1) {
          // Room to spare on both surfaces: the same width as core's frame.
          expect(
            Math.abs(frame.richText - markdownWide),
            frame.key,
          ).toBeLessThanOrEqual(2);
        } else {
          // Both fill their surface and wrap.
          expect(
            Math.abs(frame.richText - frame.richTextRoom),
            frame.key,
          ).toBeLessThanOrEqual(1);
        }
      } else {
        // A short block is the measure wide, or the whole width if narrower.
        expect(
          Math.abs(frame.markdown - Math.min(680, frame.markdownRoom)),
          `${frame.key} markdown`,
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(frame.richText - Math.min(680, frame.richTextRoom)),
          `${frame.key} rich text`,
        ).toBeLessThanOrEqual(1);
      }
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
    // One header per fenced block; the first is the `ts` block's.
    await expect(
      page.locator(`${RICH_TEXT} [data-richtext-code-header]`),
    ).toHaveCount(7);
    const header = page
      .locator(`${RICH_TEXT} [data-richtext-code-header]`)
      .first();
    await expect(header).toContainText('ts');
    await expect(header.getByRole('button', {name: 'Copy code'})).toBeVisible();
    expect(
      await header.evaluate(element => element.closest('[contenteditable]')),
    ).toBeNull();
    // The header spans the block, inside its border.
    const widths = await page.evaluate(selector => {
      const block = document.querySelector(`${selector} code[data-language]`);
      const head = document.querySelector(
        `${selector} [data-richtext-code-header]`,
      );
      return [
        (block as HTMLElement | null)?.clientWidth,
        head?.getBoundingClientRect().width,
      ];
    }, RICH_TEXT);
    expect(widths[1]).toBe(widths[0]);
    expect(errors).toEqual([]);
  });
}

// A long unbroken line wraps inside the code frame at phone width instead of
// widening the page, and the copy button copies the block from the keyboard,
// in the editor and the view.
test('code blocks wrap long lines at phone width and copy from the keyboard', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize(PHONE);
  await page.goto(
    `${storybook.origin}/iframe.html?id=richtext-richtexteditor--markdown-serializers&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:ltr`,
    {waitUntil: 'load'},
  );
  const token = 'x'.repeat(160);
  await page
    .locator('textarea')
    .fill(`\`\`\`ts\nconst id = "${token}";\n\`\`\``);
  await expect(page.locator('[data-richtext-code-header]')).toHaveCount(2);
  const layout = await page.evaluate(() => ({
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    blocks: [...document.querySelectorAll('[data-lexical-editor] code')].map(
      code => code.scrollWidth - code.clientWidth,
    ),
  }));
  expect(layout.pageOverflow).toBeLessThanOrEqual(0);
  expect(layout.blocks).toEqual([0, 0]);
  const copy = page
    .locator('[data-richtext-code-header]')
    .last()
    .getByRole('button', {name: 'Copy code'});
  await copy.focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `const id = "${token}";`,
  );
});

// spec:AST-061 FR8: a fence names a language exactly when core CodeBlock
// does — not with no info string, a blank one, or `plaintext` — and only a
// named block reserves the header row, so every fence is as tall as core
// Markdown's on both surfaces, in both color modes and directions.
for (const globals of [
  'colorMode:light;direction:ltr',
  'colorMode:dark;direction:rtl',
]) {
  test(`side by side: fences without a language have no label row (${globals})`, async ({
    page,
  }) => {
    const errors = await openStory(page, STORY.sideBySide, DESKTOP, globals);
    await waitForDocument(page, MARKDOWN);
    await waitForDocument(page, RICH_TEXT);
    const fences = {
      'code-fence': 'ts',
      'code-plain': '',
      'code-blank': '',
      'code-plaintext': '',
      'code-unknown': 'notalanguage',
      'code-long': 'sh',
      'code-plain-long': '',
    } as const;
    const markdown = await surfaceGeometry(page, MARKDOWN);
    const richText = await surfaceGeometry(page, RICH_TEXT);
    for (const key of Object.keys(fences)) {
      if (await markdownFenceScrolls(page, key)) {
        continue;
      }
      const height = (geometry: SurfaceGeometry) =>
        geometry.blocks.find(block => block.key === key)?.height ?? 0;
      expect(
        Math.abs(height(richText) - height(markdown)),
        `${key} height`,
      ).toBeLessThanOrEqual(2);
    }
    // A fence that names no language keeps its corner copy button beside the
    // code, never over it: the text ends as far from the frame's inline end
    // on both surfaces.
    const textInset = (surface: string, key: string) =>
      page.evaluate(
        ({selector}) => {
          const block = document.querySelector<HTMLElement>(selector);
          const frame = block?.matches('pre, code')
            ? block
            : block?.querySelector<HTMLElement>('pre, code');
          if (frame == null) {
            return -1;
          }
          const rect = frame.getBoundingClientRect();
          const style = getComputedStyle(frame);
          const rtl = style.direction === 'rtl';
          const line = frame.querySelector('[data-line="1"]');
          if (line != null) {
            const text = line.getBoundingClientRect();
            return rtl ? text.left - rect.left : rect.right - text.right;
          }
          return rtl
            ? parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
            : parseFloat(style.borderRightWidth) +
                parseFloat(style.paddingRight);
        },
        {selector: `${surface} [data-parity-block="${key}"]`},
      );
    for (const key of ['code-plain', 'code-plain-long']) {
      const markdownInset = await textInset(MARKDOWN, key);
      expect(markdownInset, `${key} markdown inset`).toBeGreaterThan(40);
      expect(
        Math.abs((await textInset(RICH_TEXT, key)) - markdownInset),
        `${key} text inset`,
      ).toBeLessThanOrEqual(2);
    }
    // The label core Markdown shows for each fence.
    const markdownLabels = await page.evaluate(
      ({selector, names}) =>
        Object.keys(names).map(key => {
          const block = document.querySelector(
            `${selector} [data-parity-block="${key}"]`,
          );
          const label = [...(block?.querySelectorAll('*') ?? [])].find(
            element =>
              element.childElementCount === 0 &&
              ['ts', 'notalanguage', 'plaintext', 'sh'].includes(
                element.textContent?.trim() ?? '',
              ),
          );
          return label?.textContent?.trim() ?? '';
        }),
      {selector: MARKDOWN, names: fences},
    );
    expect(markdownLabels).toEqual(Object.values(fences));
    // RichText draws one header per fence, in order, each with a copy button
    // and the same label.
    const headers = page.locator(`${RICH_TEXT} [data-richtext-code-header]`);
    await expect(headers).toHaveCount(7);
    const richTextLabels = await headers.evaluateAll(elements =>
      elements.map(element =>
        (element.textContent ?? '').replace('Copy code', '').trim(),
      ),
    );
    expect(richTextLabels).toEqual(Object.values(fences));
    for (const index of [0, 1, 2, 3, 4, 5, 6]) {
      await expect(
        headers.nth(index).getByRole('button', {name: 'Copy code'}),
      ).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

// spec:AST-061 DEC-6: a list nested inside n lists, of either kind, draws
// disc, circle, or square, or writes decimal, lower-alpha, or lower-roman
// numbers, for n modulo 3 = 0, 1, 2, in the editor and the view alike.
const BULLET_MARKERS = ['disc', 'circle', 'square'];
const NUMBER_MARKERS = ['decimal', 'lower-alpha', 'lower-roman'];

for (const globals of [
  'colorMode:light;direction:ltr',
  'colorMode:dark;direction:rtl',
]) {
  test(`list markers cycle by depth (${globals})`, async ({page}) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(
      `${storybook.origin}/iframe.html?id=richtext-richtexteditor--markdown-serializers&viewMode=story&globals=astryxTheme:neutral;${globals}`,
      {waitUntil: 'load'},
    );
    const depths = Array.from({length: 9}, (_, depth) => depth);
    const bullets = depths
      .map(depth => `${'  '.repeat(depth)}- bullet ${depth}`)
      .join('\n');
    const numbers = depths
      .map(depth => `${'   '.repeat(depth)}1. number ${depth}`)
      .join('\n');
    const mixed = [
      '- mixed 0',
      '  1. mixed 1',
      '     - mixed 2',
      '       1. mixed 3',
    ].join('\n');
    await page.locator('textarea').fill([bullets, numbers, mixed].join('\n\n'));
    await expect(page.getByText('mixed 3', {exact: true})).toHaveCount(2);
    const surfaces = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-lexical-editor]')]
        // The story keeps some sections hidden until a test shows them.
        .filter(root => root.checkVisibility())
        .map(root =>
          [...root.querySelectorAll('ul, ol')].map(list => {
            let depth = 0;
            for (
              let ancestor = list.parentElement;
              ancestor != null && ancestor !== root;
              ancestor = ancestor.parentElement
            ) {
              if (ancestor.tagName === 'UL' || ancestor.tagName === 'OL') {
                depth++;
              }
            }
            return {
              tag: list.tagName,
              depth,
              marker: getComputedStyle(list).listStyleType,
              // The list's own first item's text; none when that item only
              // holds a nested list.
              text: (() => {
                const first = list.querySelector(':scope > li');
                const only =
                  first?.children.length === 1 ? first.children[0] : null;
                return only != null && /^(UL|OL)$/.test(only.tagName)
                  ? ''
                  : (first?.textContent ?? '');
              })(),
            };
          }),
        ),
    );
    expect(surfaces).toHaveLength(2);
    for (const lists of surfaces) {
      for (const list of lists) {
        const markers = list.tag === 'UL' ? BULLET_MARKERS : NUMBER_MARKERS;
        expect(list.marker, `${list.tag} at depth ${list.depth}`).toBe(
          markers[list.depth % 3],
        );
      }
      // Every depth from 0 to 8 of each kind, and the mixed nesting.
      for (const tag of ['UL', 'OL']) {
        expect(
          [
            ...new Set(
              lists
                .filter(
                  list => list.tag === tag && !list.text.startsWith('mixed'),
                )
                .map(list => list.depth),
            ),
          ].sort((a, b) => a - b),
        ).toEqual(depths);
      }
      // Depth counts lists of either kind.
      const mixed = (text: string) => lists.find(list => list.text === text);
      expect(mixed('mixed 1')?.marker).toBe('lower-alpha');
      expect(mixed('mixed 2')?.marker).toBe('square');
      expect(mixed('mixed 3')?.marker).toBe('decimal');
    }
  });
}
// spec:AST-061 FR7: struck-through text is a deletion on both surfaces, as
// core Markdown's <del> is, and nothing else is.
test('side by side: strikethrough is a deletion on both surfaces', async ({
  page,
}) => {
  const errors = await openStory(page, STORY.sideBySide, DESKTOP);
  await waitForDocument(page, MARKDOWN);
  await waitForDocument(page, RICH_TEXT);
  const markdown = page.locator(MARKDOWN).getByRole('deletion');
  const richText = page.locator(RICH_TEXT).getByRole('deletion');
  await expect(markdown).toHaveCount(1);
  await expect(richText).toHaveCount(1);
  expect(await richText.textContent()).toBe(await markdown.textContent());
  expect(errors).toEqual([]);
});

// spec:AST-061 FR7: struck text is a deletion around the strong, emphasis,
// or link text it also is, in the editor and the view, and stays one as it
// is edited.
test('struck text is a deletion around its other marks, and stays one while edited', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto(
    `${storybook.origin}/iframe.html?id=richtext-richtexteditor--markdown-serializers&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:ltr`,
    {waitUntil: 'load'},
  );
  await page
    .locator('textarea')
    .fill(
      'Keep ~~plain~~, **~~bold~~**, *~~italic~~*, ***~~both~~***, and [~~link~~](https://example.com).',
    );
  const surfaces = page.locator('[data-lexical-editor]:visible');
  await expect(surfaces).toHaveCount(2);
  for (const surface of [surfaces.nth(0), surfaces.nth(1)]) {
    const deletions = surface.getByRole('deletion');
    await expect(deletions).toHaveCount(5);
    await expect(deletions).toHaveText([
      'plain',
      'bold',
      'italic',
      'both',
      'link',
    ]);
    // Each deletion keeps the role of what is inside it.
    await expect(deletions.nth(1).getByRole('strong')).toHaveText('bold');
    await expect(deletions.nth(2).getByRole('emphasis')).toHaveText('italic');
    await expect(deletions.nth(3).getByRole('strong')).toHaveText('both');
    await expect(deletions.nth(3).getByRole('emphasis')).toHaveText('both');
    await expect(
      surface.getByRole('link', {name: 'link'}).getByRole('deletion'),
    ).toHaveText('link');
    // Nothing is a deletion by role in place of its own role.
    await expect(surface.locator('[role="deletion"]')).toHaveCount(0);
  }
  // Typing in struck text, at its end or inside it, stays struck; undo
  // takes it back.
  const editor = page.locator('[data-lexical-editor][contenteditable="true"]');
  // The caret, at the end of the struck word; Lexical reads the selection
  // when the browser reports it changed, so wait for the browser to have it.
  const caret = () =>
    page.evaluate(() => {
      const selection = getSelection();
      return `${selection?.anchorNode?.textContent}@${selection?.anchorOffset}`;
    });
  await editor.getByText('plain', {exact: true}).dblclick();
  await expect(editor).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(caret).toBe('plain@5');
  await page.waitForTimeout(50);
  await page.keyboard.type('er');
  await expect(editor.getByRole('deletion').first()).toHaveText('plainer');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor.getByRole('deletion').first()).toHaveText('plain');
  await editor.getByText('plain', {exact: true}).dblclick();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(caret).toBe('plain@2');
  await page.waitForTimeout(50);
  await page.keyboard.type('XY');
  await expect(editor.getByRole('deletion').first()).toHaveText('plXYain');
});

// spec:AST-061 DEC-6 in core Markdown: each level draws the marker for its
// depth modulo 3, counting lists of either kind; numbering keeps its start.
for (const globals of [
  'colorMode:light;direction:ltr',
  'colorMode:dark;direction:rtl',
]) {
  test(`core Markdown list markers cycle by depth (${globals})`, async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-markdown--nested-lists&viewMode=story&globals=astryxTheme:neutral;${globals}`,
      {waitUntil: 'load'},
    );
    await expect(page.getByText('Start 0', {exact: true})).toBeVisible();
    const lists = await page.evaluate(() => {
      const document_ = document.querySelector('[role="document"]');
      if (document_ == null) {
        throw new Error('No Markdown document');
      }
      const markerOf = (item: Element): string => {
        for (const span of item.querySelectorAll('span')) {
          if (span.closest('li') !== item) {
            continue;
          }
          const before = getComputedStyle(span, '::before').content;
          if (before.includes('counter(')) {
            return before.includes('lower-alpha')
              ? 'lower-alpha'
              : before.includes('lower-roman')
                ? 'lower-roman'
                : 'decimal';
          }
          const style = getComputedStyle(span);
          if (style.width === '6px') {
            if (style.borderTopLeftRadius === '0px') {
              return 'square';
            }
            return style.backgroundColor === 'rgba(0, 0, 0, 0)'
              ? 'circle'
              : 'disc';
          }
        }
        return 'none';
      };
      return [...document_.querySelectorAll('ul, ol')].map(list => {
        let depth = 0;
        for (
          let ancestor = list.parentElement;
          ancestor != null && ancestor !== document_;
          ancestor = ancestor.parentElement
        ) {
          if (ancestor.tagName === 'UL' || ancestor.tagName === 'OL') {
            depth++;
          }
        }
        const items = [...list.querySelectorAll(':scope > li')];
        return {
          tag: list.tagName,
          depth,
          markers: [...new Set(items.map(markerOf))],
          text: items[0]?.textContent ?? '',
          counterReset: getComputedStyle(list).counterReset,
        };
      });
    });
    for (const list of lists) {
      const markers = list.tag === 'UL' ? BULLET_MARKERS : NUMBER_MARKERS;
      expect(list.markers, `${list.tag} at depth ${list.depth}`).toEqual([
        markers[list.depth % 3],
      ]);
    }
    // Every depth from 0 to 8 of each kind.
    for (const tag of ['UL', 'OL']) {
      expect(
        lists
          .filter(
            list =>
              list.tag === tag &&
              (list.text.startsWith('Bullet') ||
                list.text.startsWith('Number')),
          )
          .map(list => list.depth),
      ).toEqual(Array.from({length: 9}, (_, depth) => depth));
    }
    // Numbering keeps its start.
    const startOf = (text: string) =>
      lists.find(list => list.text.startsWith(text));
    expect(startOf('Start 26')?.counterReset).toBe('astryx-list 25');
    expect(startOf('Start 0')?.counterReset).toBe('astryx-list -1');
  });
}

// spec:AST-061 FR1: fenced code takes the same syntax colors on both
// surfaces — the same tokenizer finds the same tokens, and each token type
// takes its `--color-syntax-*` token.
/** Each block's highlighted tokens on one surface, as `type:text`. */
async function syntaxTokens(
  page: Page,
  surface: string,
): Promise<Record<string, Array<string>>> {
  return page.evaluate(selector => {
    const tokens: Record<string, Array<string>> = {};
    for (const [name, highlight] of CSS.highlights) {
      if (!name.startsWith('astryx-')) {
        continue;
      }
      for (const range of highlight) {
        const element = range.startContainer.parentElement;
        const block = element?.closest(selector)?.contains(element)
          ? element.closest('[data-parity-block]')
          : null;
        if (block == null || !(range instanceof Range)) {
          continue;
        }
        const key = block.getAttribute('data-parity-block') ?? '';
        (tokens[key] ??= []).push(
          `${name.slice('astryx-'.length)}:${range.toString()}`,
        );
      }
    }
    for (const list of Object.values(tokens)) {
      list.sort();
    }
    return tokens;
  }, surface);
}

for (const globals of [
  'colorMode:light;direction:ltr',
  'colorMode:dark;direction:rtl',
]) {
  test(`side by side: fenced code takes core Markdown's syntax colors (${globals})`, async ({
    page,
  }) => {
    const errors = await openStory(page, STORY.sideBySide, DESKTOP, globals);
    await waitForDocument(page, MARKDOWN);
    await waitForDocument(page, RICH_TEXT);
    await expect
      .poll(async () => (await syntaxTokens(page, RICH_TEXT))['code-fence'])
      .toBeDefined();
    const markdown = await syntaxTokens(page, MARKDOWN);
    const richText = await syntaxTokens(page, RICH_TEXT);
    for (const key of ['code-fence', 'code-long']) {
      expect(markdown[key]?.length ?? 0, key).toBeGreaterThan(0);
      expect(richText[key], key).toEqual(markdown[key]);
    }
    // A fence with no language core CodeBlock knows stays plain on both.
    for (const key of ['code-plain', 'code-plaintext', 'code-unknown']) {
      expect(richText[key], key).toBeUndefined();
      expect(markdown[key], key).toBeUndefined();
    }
    // Each token type takes the same syntax color token as core CodeBlock.
    const rules = await page.evaluate(
      () =>
        document.querySelector('style[data-astryx-richtext-code-syntax]')
          ?.textContent ?? '',
    );
    expect(rules).toContain(
      '::highlight(astryx-keyword) { color: var(--color-syntax-keyword); }',
    );
    expect(rules).toContain(
      '::highlight(astryx-string) { color: var(--color-syntax-string); }',
    );
    expect(errors).toEqual([]);
  });
}

test('edited code is colored again as it changes', async ({page}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto(
    `${storybook.origin}/iframe.html?id=richtext-richtexteditor--markdown-serializers&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:ltr`,
    {waitUntil: 'load'},
  );
  await page.locator('textarea').fill('```ts\nlet value = 1;\n```');
  const editor = page.locator('[data-lexical-editor][contenteditable="true"]');
  const editorTokens = () =>
    page.evaluate(() => {
      const root = document.querySelector(
        '[data-lexical-editor][contenteditable="true"]',
      );
      const tokens: Array<string> = [];
      for (const [name, highlight] of CSS.highlights) {
        for (const range of highlight) {
          if (range instanceof Range && root?.contains(range.startContainer)) {
            tokens.push(`${name}:${range.toString()}`);
          }
        }
      }
      return tokens.sort();
    });
  await expect.poll(editorTokens).toContain('astryx-keyword:let');
  // Type a keyword on a new line: it is colored, and the first line keeps
  // its colors.
  await editor.getByText('let value = 1;').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('return value;');
  await expect.poll(editorTokens).toContain('astryx-keyword:return');
  expect(await editorTokens()).toContain('astryx-keyword:let');
});

// spec:AST-061 FR7: bold italic text is emphasis and strong in the editor
// and the view, as core Markdown's `<strong><em>` is.
test('bold italic text is emphasis and strong in the editor and the view', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto(
    `${storybook.origin}/iframe.html?id=richtext-richtexteditor--markdown-serializers&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:ltr`,
    {waitUntil: 'load'},
  );
  await page.locator('textarea').fill('Keep ***both*** and **bold** here.');
  const surfaces = page.locator('[data-lexical-editor]:visible');
  await expect(surfaces).toHaveCount(2);
  for (const surface of [surfaces.nth(0), surfaces.nth(1)]) {
    const emphasis = surface.getByRole('emphasis');
    await expect(emphasis).toHaveText(['both']);
    await expect(emphasis.getByRole('strong')).toHaveText('both');
    await expect(surface.getByRole('strong')).toHaveText(['both', 'bold']);
  }
});

// spec:AST-061 DEC-6: a nested numbered list keeps its start, so `27.`
// under `1.` reads as item 27 at its depth's marker ("aa." in lower-alpha).
test('nested numbered lists keep their start in the editor and the view', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto(
    `${storybook.origin}/iframe.html?id=richtext-richtexteditor--markdown-serializers&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:ltr`,
    {waitUntil: 'load'},
  );
  await page
    .locator('textarea')
    // `28. ` puts its content at column seven, so `0.` nests under it.
    .fill('1. one\n   27. twenty-seven\n   28. twenty-eight\n       0. zero\n');
  const surfaces = page.locator('[data-lexical-editor]:visible');
  await expect(surfaces).toHaveCount(2);
  for (const surface of [surfaces.nth(0), surfaces.nth(1)]) {
    await expect(surface.getByText('zero', {exact: true})).toBeVisible();
    const starts = await surface.evaluate(root =>
      [...root.querySelectorAll('ol')].map(list => list.start),
    );
    expect(starts).toEqual([1, 27, 0]);
  }
  // The accessibility tree names each item by its own number.
  const cdp = await page.context().newCDPSession(page);
  const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
    nodes: Array<{role?: {value?: string}; name?: {value?: string}}>;
  };
  const markers = nodes
    .filter(node => node.role?.value === 'ListMarker')
    .map(node => (node.name?.value ?? '').trim());
  // Two surfaces, each: 1. / aa. ab. / 0. (the tree is not in DOM order).
  expect(markers.sort()).toEqual([
    '0.',
    '0.',
    '1.',
    '1.',
    'aa.',
    'aa.',
    'ab.',
    'ab.',
  ]);
});

for (const viewport of [PHONE, {width: 1280, height: 900}] as const) {
  for (const globals of [
    'colorMode:light;direction:ltr',
    'colorMode:dark;direction:rtl',
  ]) {
    test(`tables stay inside their wrappers in grid, flex, and shrink-to-fit hosts (${viewport.width}px, ${globals})`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(
        `${storybook.origin}/iframe.html?id=richtext-richtexteditor--markdown-serializers&viewMode=story&globals=astryxTheme:neutral;${globals}`,
        {waitUntil: 'load'},
      );
      for (const columnCount of [2, 20]) {
        // Show every section so the story's textarea can take the table.
        await page.evaluate(() => {
          const layout = document.querySelector('[data-table-host-layout]');
          for (const section of Array.from(layout?.children ?? [])) {
            section.setAttribute('style', '');
          }
        });
        await page.locator('textarea').fill(tableSource(columnCount));
        await expect(page.locator('table:visible')).toHaveCount(2);
        for (const [host, styles] of Object.entries(TABLE_HOSTS)) {
          await page.evaluate(
            ({layout: layoutStyle, view: viewStyle, surfaces}) => {
              // The story lays its sections out in a grid; mark it once so later
              // cases find it after its style changes.
              let layout = document.querySelector<HTMLElement>(
                '[data-table-host-layout]',
              );
              if (layout == null) {
                layout =
                  document
                    .querySelector('textarea')
                    ?.closest<HTMLElement>('div[style*="grid"]') ?? null;
                layout?.setAttribute('data-table-host-layout', '');
              }
              if (layout == null) {
                throw new Error('Story layout not found');
              }
              layout.setAttribute('style', layoutStyle);
              // Only the surfaces this host holds stay in it.
              for (const section of Array.from(layout.children)) {
                const table = section.querySelector('table');
                const isView =
                  table?.closest('[contenteditable="false"]') != null;
                const keep =
                  table != null &&
                  (surfaces === 'both' || (surfaces === 'view') === isView);
                section.setAttribute('style', keep ? '' : 'display:none');
              }
              // The view itself is the shrink-to-fit box, as in a chat bubble.
              const viewRoot = document
                .querySelector('[contenteditable="false"] table')
                ?.closest('[contenteditable]')?.parentElement;
              viewRoot?.setAttribute('style', viewStyle);
            },
            styles,
          );
          await settle(page);
          const layout = await page.evaluate(() => ({
            pageOverflow:
              document.documentElement.scrollWidth - window.innerWidth,
            wrappers: [...document.querySelectorAll('table')]
              .filter(element => element.getBoundingClientRect().width > 0)
              .map(element => {
                const wrapper = element.parentElement as HTMLElement;
                // The table's own width: its max-content width, measured
                // with the inline width restored right after.
                const previousWidth = element.style.width;
                let intrinsic: number;
                try {
                  element.style.width = 'max-content';
                  intrinsic = element.getBoundingClientRect().width;
                } finally {
                  element.style.width = previousWidth;
                }
                // The widest the wrapper could be: the view's containing
                // block, less the space between the view's edge and the
                // wrapper.
                const view = element.closest('[contenteditable]')
                  ?.parentElement as HTMLElement | null;
                const host = view?.parentElement;
                const hostStyle = host == null ? null : getComputedStyle(host);
                const available =
                  host == null || hostStyle == null || view == null
                    ? 0
                    : host.clientWidth -
                      parseFloat(hostStyle.paddingLeft) -
                      parseFloat(hostStyle.paddingRight) -
                      (view.offsetWidth - wrapper.clientWidth);
                return {
                  inView: element.closest('[contenteditable="false"]') != null,
                  clientWidth: wrapper.clientWidth,
                  scrollWidth: wrapper.scrollWidth,
                  intrinsic,
                  available,
                  restored: element.style.width === previousWidth,
                };
              }),
          }));
          const label = `${columnCount} columns, ${host} host`;
          expect(layout.pageOverflow, label).toBeLessThanOrEqual(0);
          expect(layout.wrappers, label).toHaveLength(
            styles.surfaces === 'both' ? 2 : 1,
          );
          for (const wrapper of layout.wrappers) {
            expect(wrapper.clientWidth, label).toBeGreaterThan(0);
            expect(wrapper.clientWidth, label).toBeLessThanOrEqual(
              viewport.width,
            );
            if (columnCount === 20 && viewport.width === PHONE.width) {
              // A table wider than the phone scrolls inside its wrapper.
              expect(wrapper.scrollWidth, label).toBeGreaterThan(
                wrapper.clientWidth,
              );
            } else if (columnCount === 2) {
              // A small table fits without scrolling.
              expect(wrapper.scrollWidth, label).toBeLessThanOrEqual(
                wrapper.clientWidth + 1,
              );
            }
          }
          for (const wrapper of layout.wrappers) {
            // Measuring the table left its style as it was.
            expect(wrapper.restored, label).toBe(true);
          }
          if (styles.view !== '') {
            // A shrink-to-fit host gives the view's table its natural width,
            // up to the room it has: neither stretched nor collapsed. A small
            // table is narrower than the room, so stretching it fails here.
            const view = layout.wrappers.find(wrapper => wrapper.inView);
            if (columnCount === 2) {
              expect(view?.intrinsic ?? 0, label).toBeLessThan(
                (view?.available ?? 0) - 8,
              );
            }
            expect(
              Math.abs(
                (view?.clientWidth ?? 0) -
                  Math.min(view?.intrinsic ?? 0, view?.available ?? 0),
              ),
              label,
            ).toBeLessThanOrEqual(1);
          }
        }
      }
    });
  }
}

// spec:AST-061 FR2–FR4: the same blocks use the same type scale, spacing,
// and measure on both surfaces. Geometry still differs where structure does
// (lists, code, rules); these blocks already share their structure.
test('side by side: shared blocks match core Markdown typography, spacing, and measure', async ({
  page,
}) => {
  const errors = await openStory(page, STORY.sideBySide, DESKTOP);
  await waitForDocument(page, MARKDOWN);
  await waitForDocument(page, RICH_TEXT);
  const read = (surface: string) =>
    page.evaluate(selector => {
      const properties = [
        'fontFamily',
        'fontSize',
        'lineHeight',
        'fontWeight',
        'marginTop',
        'marginBottom',
        'maxWidth',
        'paddingLeft',
        'borderLeftWidth',
      ] as const;
      const styleOf = (element: Element | null | undefined) => {
        if (element == null) {
          return null;
        }
        const computed = getComputedStyle(element);
        return Object.fromEntries(
          properties.map(property => [property, computed[property]]),
        );
      };
      const block = (key: string, inner?: string) => {
        const element = document.querySelector(
          `${selector} [data-parity-block="${key}"]`,
        );
        if (inner == null || element?.matches(inner)) {
          return element;
        }
        return element?.querySelector(inner);
      };
      // RichText draws the inline-code chip on the text inside <code>.
      const code = block('paragraph-inline')?.querySelector('code');
      return {
        heading1: styleOf(block('heading-1', 'h1')),
        heading2: styleOf(block('heading-2', 'h2')),
        heading3: styleOf(block('heading-3', 'h3')),
        heading4: styleOf(block('heading-4', 'h4')),
        paragraph: styleOf(block('paragraph-escapes', 'p, div')),
        lastParagraph: styleOf(block('paragraph-final', 'p, div')),
        blockquote: styleOf(block('blockquote', 'blockquote')),
        strong: getComputedStyle(
          block('paragraph-inline')?.querySelector('strong') as Element,
        ).fontWeight,
        inlineCode: styleOf(code?.firstElementChild ?? code),
        // The distance from one list row to the next, and a row's padding.
        listRows: (() => {
          // The list's first two rows, both single lines on each surface.
          const rows = [
            ...(block('list-unordered', 'ul')?.querySelectorAll(
              ':scope > li',
            ) ?? []),
          ].slice(0, 2);
          return rows.length < 2
            ? null
            : {
                pitch:
                  rows[1].getBoundingClientRect().top -
                  rows[0].getBoundingClientRect().top,
                padding: getComputedStyle(rows[0]).paddingTop,
              };
        })(),
        rule: styleOf(block('thematic-break', 'hr')),
        // Each column's readable width floor, set on its header cell.
        tableFloors: [
          ...(block('table', 'table')?.querySelectorAll('th') ?? []),
        ].map(cell => getComputedStyle(cell).minWidth),
        // The text inside a header cell, where each surface draws it.
        tableHeader: (() => {
          const cell = block('table', 'table')?.querySelector('th');
          const text = cell?.querySelector('p') ?? cell;
          return text == null
            ? null
            : [getComputedStyle(text).fontWeight, getComputedStyle(text).color];
        })(),
      };
    }, surface);
  const markdown = await read(MARKDOWN);
  const richText = await read(RICH_TEXT);
  for (const key of [
    'heading1',
    'heading2',
    'heading3',
    'heading4',
    'paragraph',
    'lastParagraph',
  ] as const) {
    expect(richText[key], key).toEqual(markdown[key]);
  }
  for (const property of [
    'marginTop',
    'marginBottom',
    'maxWidth',
    'paddingLeft',
    'borderLeftWidth',
  ] as const) {
    expect(richText.blockquote?.[property], `blockquote ${property}`).toBe(
      markdown.blockquote?.[property],
    );
  }
  expect(richText.strong).toBe(markdown.strong);
  expect(richText.listRows, 'list rows').toEqual(markdown.listRows);
  for (const property of [
    'marginTop',
    'marginBottom',
    'borderLeftWidth',
  ] as const) {
    expect(richText.rule?.[property], `rule ${property}`).toBe(
      markdown.rule?.[property],
    );
  }
  expect(richText.tableFloors, 'table column floors').toEqual(
    markdown.tableFloors,
  );
  expect(richText.tableHeader, 'table header text').toEqual(
    markdown.tableHeader,
  );
  for (const property of ['fontSize', 'lineHeight', 'paddingLeft'] as const) {
    expect(richText.inlineCode?.[property], `inline code ${property}`).toBe(
      markdown.inlineCode?.[property],
    );
  }
  expect(errors).toEqual([]);
});

test('side by side: one fixture renders on both surfaces', async ({page}) => {
  const errors = await openStory(page, STORY.sideBySide, DESKTOP);
  await waitForDocument(page, MARKDOWN);
  await waitForDocument(page, RICH_TEXT);
  const keys = await fixtureKeys(page);
  const markdown = await surfaceGeometry(page, MARKDOWN);
  const richText = await surfaceGeometry(page, RICH_TEXT);

  // Markdown is the reference renderer: every fixture block pairs, in order.
  expect(pairedKeys(markdown)).toEqual(keys);
  // The editor loaded the whole document: its first and last blocks pair.
  const richTextKeys = pairedKeys(richText);
  expect(richTextKeys[0]).toBe(keys[0]);
  expect(richTextKeys.at(-1)).toBe(keys.at(-1));
  // The edit surface is a real editor with an accessible name.
  await expect(page.getByRole('textbox', {name: 'Document'})).toHaveCount(1);
  // The diagnostic table measured both surfaces.
  const surfaceRow = page.locator('[data-parity-row="surface"]');
  await expect(surfaceRow).toHaveAttribute('data-parity-left', /\d/);
  await expect(surfaceRow).toHaveAttribute('data-parity-right', /\d/);

  expect(await axeViolations(page)).toEqual([]);
  await capture(page, 'side-by-side--1440--light-ltr', {
    story: STORY.sideBySide,
    viewport: DESKTOP,
    globals: 'neutral light ltr',
    unpairedInRichText: keys.filter(key => !richTextKeys.includes(key)),
    markdown,
    richText,
  });
  expect(errors).toEqual([]);
});

for (const viewport of [DESKTOP, PHONE]) {
  for (const colorMode of ['light', 'dark'] as const) {
    test(`toggle keeps the source across read, edit, read (${viewport.width}px, ${colorMode})`, async ({
      page,
    }) => {
      const errors = await openStory(
        page,
        STORY.toggle,
        viewport,
        `colorMode:${colorMode};direction:ltr`,
      );
      const read = `${TOGGLE}[data-parity-mode="read"]`;
      const edit = `${TOGGLE}[data-parity-mode="edit"]`;
      const name = `toggle--${viewport.width}--${colorMode}`;

      await waitForDocument(page, read);
      const readText = await page
        .locator(`${read} > [data-parity-body]`)
        .innerText();
      const readGeometry = await surfaceGeometry(page, read);
      await capture(page, `${name}--read`, {
        story: STORY.toggle,
        viewport,
        globals: `neutral ${colorMode} ltr`,
        mode: 'read',
        geometry: readGeometry,
      });

      await editMode(page).click();
      await waitForDocument(page, edit);
      await expect(editMode(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('textbox', {name: 'Document'})).toHaveCount(
        1,
      );
      await expect(page.locator('[data-parity-row="surface"]')).toHaveAttribute(
        'data-parity-right',
        /\d/,
      );
      const anchor = await page
        .locator('[data-parity-anchor]')
        .evaluate(element => ({...(element as HTMLElement).dataset}));
      expect(await axeViolations(page)).toEqual([]);
      await capture(page, `${name}--edit`, {
        story: STORY.toggle,
        viewport,
        globals: `neutral ${colorMode} ltr`,
        mode: 'edit',
        anchor,
        geometry: await surfaceGeometry(page, edit),
      });

      // Back to read with the keyboard: the control is reachable without a pointer.
      await editMode(page).focus();
      await page.keyboard.press('Enter');
      await waitForDocument(page, read);
      await expect(editMode(page)).toHaveAttribute('aria-pressed', 'false');
      // Read mode re-renders the source as authored: same text, same layout.
      expect(
        await page.locator(`${read} > [data-parity-body]`).innerText(),
      ).toBe(readText);
      expect((await surfaceGeometry(page, read)).height).toBe(
        readGeometry.height,
      );
      expect(errors).toEqual([]);
    });
  }
}

for (const [viewport, colorMode] of [
  [PHONE, 'dark'],
  [DESKTOP, 'light'],
] as const) {
  test(`right-to-left reaches both surfaces (${viewport.width}px, ${colorMode})`, async ({
    page,
  }) => {
    const errors = await openStory(
      page,
      STORY.sideBySide,
      viewport,
      `colorMode:${colorMode};direction:rtl`,
    );
    await waitForDocument(page, MARKDOWN);
    await waitForDocument(page, RICH_TEXT);
    const markdown = await surfaceGeometry(page, MARKDOWN);
    const richText = await surfaceGeometry(page, RICH_TEXT);
    expect(markdown.direction).toBe('rtl');
    expect(richText.direction).toBe('rtl');
    if (viewport === PHONE) {
      // At a phone width the surfaces stack instead of squeezing side by side.
      const markdownBox = await page.locator(MARKDOWN).boundingBox();
      const richTextBox = await page.locator(RICH_TEXT).boundingBox();
      expect(richTextBox?.y ?? 0).toBeGreaterThanOrEqual(
        (markdownBox?.y ?? 0) + (markdownBox?.height ?? 0),
      );
    }

    expect(await axeViolations(page)).toEqual([]);
    await capture(page, `side-by-side--${viewport.width}--${colorMode}-rtl`, {
      story: STORY.sideBySide,
      viewport,
      globals: `neutral ${colorMode} rtl`,
      pageOverflowX: await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
      leftToRightBlocks: {
        markdown: markdown.blocks
          .filter(block => block.direction === 'ltr')
          .map(block => block.key),
        richText: richText.blocks
          .filter(block => block.direction === 'ltr')
          .map(block => block.key),
      },
      markdown,
      richText,
    });
    expect(errors).toEqual([]);
  });
}

// spec:AST-061 FR6: every block takes the direction of the surface around
// it, whatever its first strong character, on both surfaces.
for (const direction of ['ltr', 'rtl'] as const) {
  test(`blocks take the provider direction (${direction})`, async ({page}) => {
    const errors = await openStory(
      page,
      STORY.sideBySide,
      DESKTOP,
      `colorMode:light;direction:${direction}`,
    );
    await waitForDocument(page, MARKDOWN);
    await waitForDocument(page, RICH_TEXT);
    for (const surface of [MARKDOWN, RICH_TEXT]) {
      const geometry = await surfaceGeometry(page, surface);
      const otherDirection = geometry.blocks
        .filter(block => block.direction !== direction)
        .map(block => block.key);
      expect(otherDirection, surface).toEqual([]);
      // Inside blocks too: table rows and cells, list items, and paragraphs.
      const nested = await page.evaluate(
        ({selector, expected}) =>
          [
            ...document.querySelectorAll(
              `${selector} [data-parity-body] :is(tr, th, td, li, p)`,
            ),
          ]
            .filter(element => getComputedStyle(element).direction !== expected)
            .map(element => element.tagName),
        {selector: surface, expected: direction},
      );
      expect(nested, `${surface} nested`).toEqual([]);
    }
    expect(errors).toEqual([]);
  });

  // Mixed English and Hebrew cells take the document's direction, so each
  // cell's text starts at the document's start edge, whatever its script.
  test(`table cells take the provider direction with mixed scripts (${direction})`, async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(
      `${storybook.origin}/iframe.html?id=richtext-richtexteditor--markdown-serializers&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:${direction}`,
      {waitUntil: 'load'},
    );
    await page
      .locator('textarea')
      .fill(
        '| Name | \u05e9\u05dd |\n| --- | :---: |\n| Ada | \u05e2\u05d3\u05d4 |\n| \u05e9\u05dc\u05d5\u05dd **bold** | Hello |',
      );
    await expect(page.locator('table:visible')).toHaveCount(2);
    const cells = await page.evaluate(() =>
      [...document.querySelectorAll('[data-lexical-editor] :is(th, td)')].map(
        cell => {
          const style = getComputedStyle(cell);
          const paragraph = cell.querySelector('p') ?? cell;
          const range = document.createRange();
          range.selectNodeContents(paragraph);
          const text = range.getBoundingClientRect();
          const box = cell.getBoundingClientRect();
          return {
            column: (cell as HTMLTableCellElement).cellIndex,
            direction: style.direction,
            paragraphDirection: getComputedStyle(paragraph).direction,
            startGap:
              style.direction === 'rtl'
                ? box.right - parseFloat(style.paddingRight) - text.right
                : text.left - box.left - parseFloat(style.paddingLeft),
          };
        },
      ),
    );
    // Editor and view, three rows of two cells each.
    expect(cells).toHaveLength(12);
    for (const cell of cells) {
      expect(cell.direction).toBe(direction);
      expect(cell.paragraphDirection).toBe(direction);
      if (cell.column === 0) {
        // The first column is start-aligned: its text touches the start edge.
        expect(Math.abs(cell.startGap)).toBeLessThanOrEqual(1);
      }
    }
  });
}

test('overlay: both layers start together and the drawn editor is inert', async ({
  page,
}) => {
  const errors = await openStory(page, STORY.overlay, DESKTOP);
  await waitForDocument(page, MARKDOWN);
  await waitForDocument(page, RICH_TEXT);
  const base = await page
    .locator(`${MARKDOWN} > [data-parity-body]`)
    .boundingBox();
  const layer = await page
    .locator(`${RICH_TEXT} > [data-parity-body]`)
    .boundingBox();
  expect(layer?.x).toBe(base?.x);
  expect(layer?.y).toBe(base?.y);
  await expect(page.locator(RICH_TEXT)).toHaveAttribute('inert', '');
  // An inert editor refuses focus, so neither keyboard nor pointer reach it.
  const focusable = await page
    // The editor root, not a horizontal rule's contenteditable="false".
    .locator(`${RICH_TEXT} [data-lexical-editor]`)
    .evaluate(editor => {
      (editor as HTMLElement).focus();
      return document.activeElement === editor;
    });
  expect(focusable).toBe(false);

  expect(await axeViolations(page)).toEqual([]);
  await capture(page, 'overlay--1440--light-ltr', {
    story: STORY.overlay,
    viewport: DESKTOP,
    globals: 'neutral light ltr',
  });
  expect(errors).toEqual([]);
});

test('long document: the block at the top of the view is followed across a switch', async ({
  page,
}) => {
  const errors = await openStory(page, STORY.longDocument, DESKTOP);
  await waitForDocument(page, `${TOGGLE}[data-parity-mode="read"]`);
  const keys = await fixtureKeys(page);
  await page.evaluate(() =>
    window.scrollTo(
      0,
      (document.documentElement.scrollHeight - window.innerHeight) / 2,
    ),
  );
  await settle(page);
  await capture(
    page,
    'long-document--1440--read-scrolled',
    {story: STORY.longDocument, viewport: DESKTOP, mode: 'read'},
    {fullPage: false},
  );

  await editMode(page).click();
  await waitForDocument(page, `${TOGGLE}[data-parity-mode="edit"]`);
  const readout = page.locator(
    '[data-parity-anchor]:not([data-parity-anchor=""])',
  );
  await readout.waitFor();
  const anchor = await readout.evaluate(element => ({
    ...(element as HTMLElement).dataset,
  }));
  expect(keys).toContain(anchor.parityAnchor);
  // Halfway down a twelve-copy document, the anchor is past the first copy.
  expect(Number(anchor.parityAnchorCopy)).toBeGreaterThan(1);
  await capture(
    page,
    'long-document--1440--edit-after-switch',
    {story: STORY.longDocument, viewport: DESKTOP, mode: 'edit', anchor},
    {fullPage: false},
  );
  expect(errors).toEqual([]);
});
