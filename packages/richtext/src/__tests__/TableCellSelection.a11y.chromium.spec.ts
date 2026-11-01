// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file TableCellSelection.a11y.chromium.spec.ts
 * @input The built Storybook's Lab/RichTextEditor "Playground" story, whose
 *   editor takes a table from the toolbar's insert control.
 * @output Real-browser proof that a table selection is visible: the cells a
 *   drag covers are marked and the cells it does not are not, the mark clears
 *   the surface it is drawn on in every shipped theme and mode, it costs the
 *   cell's own text no contrast, it marks exactly the cells the next keystroke
 *   replaces, and it goes when the selection goes.
 *
 * A table selection is made of DOM the engine owns and a class name the theme
 * supplies. Nothing in a unit test can see whether that class was ever named:
 * `addClassNamesToElement(element, theme.tableCellSelected)` is a silent
 * no-op when the slot is undefined, which is how cells in a selection came to
 * be painted exactly like cells outside one. Only a real engine, dragging
 * across real cells, can tell the two apart.
 *
 * The theme sweep is not ceremony. A mark is only visible against the surface
 * it lands on, and a token that clears the surface under one theme can equal
 * it under another: `--color-accent-muted` resolves to the editor field's own
 * colour under Neutral dark, where a background wash would be invisible while
 * every computed-value assertion still passed.
 *
 * Run after building Storybook:
 *   pnpm storybook:build
 *   pnpm exec playwright test packages/richtext --project chromium
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORYBOOK_DIR = process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR;
const STORY = 'richtext-richtexteditor--playground';
const EDITOR = '[data-playground-editor] [role="textbox"]';
const CELLS = `${EDITOR} table th, ${EDITOR} table td`;

/** Every shipped theme, in both modes: a mark has to land on all of them. */
const THEMES = [
  'neutral',
  'stone',
  'butter',
  'chocolate',
  'gothic',
  'matcha',
  'y2k',
] as const;
const MODES = ['light', 'dark'] as const;

/**
 * WCAG 1.4.11's bar for a non-text indicator. The mark has to clear the
 * surface it is drawn on by at least this much to be a mark at all.
 */
const NON_TEXT_CONTRAST = 3;

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

/**
 * How a cell is marked, and what its text has to read against: enough to say
 * whether two cells look different, without naming the treatment. A future
 * mark that is a wash rather than a ring is described here just as well.
 */
interface CellPaint {
  readonly outline: string;
  readonly background: string;
  /** Contrast of the cell's own text against its own background. */
  readonly textContrast: number;
}

/** Opens the story under one theme and mode, with a filled 3×3 table. */
async function openWithTable(
  page: Page,
  theme: string = 'neutral',
  mode: string = 'light',
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
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:${theme};colorMode:${mode};direction:ltr`,
    {waitUntil: 'load'},
  );
  await expect(page.locator(EDITOR)).toBeVisible();

  // A table of its own, away from the seeded document, so the cell indices
  // below mean what they say.
  await page.getByRole('button', {name: 'Clear', exact: true}).click();
  await page.locator(EDITOR).click();
  await page.getByRole('button', {name: 'Table', exact: true}).click();
  await expect(page.locator(CELLS)).toHaveCount(9);
  for (const [index, word] of [
    [0, 'Area'],
    [1, 'Owner'],
    [3, 'Sync'],
    [4, 'Platform'],
  ] as const) {
    await page.locator(CELLS).nth(index).click();
    await page.keyboard.type(word);
  }
  return errors;
}

/**
 * Reads each cell's mark and its text contrast, compositing translucent
 * colours over the first opaque surface behind the table so a measurement is
 * of what a person actually sees, not of a token's nominal value.
 */
const paints = (page: Page): Promise<CellPaint[]> =>
  page.$$eval(CELLS, cells => {
    const parse = (value: string): number[] => {
      const parts = (value.match(/[\d.]+/g) ?? []).map(Number);
      return parts.length === 3 ? [...parts, 1] : parts;
    };
    const over = (fg: number[], bg: number[]): number[] =>
      [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
    const channel = (c: number): number => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (c: number[]): number =>
      0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
    const contrast = (a: number[], b: number[]): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    /** The first opaque background behind an element. */
    const backdrop = (el: Element): number[] => {
      let node: Element | null = el.parentElement;
      while (node != null) {
        const parsed = parse(getComputedStyle(node).backgroundColor);
        if (parsed[3] === 1) {
          return parsed;
        }
        node = node.parentElement;
      }
      return [255, 255, 255, 1];
    };
    return cells.map(cell => {
      const style = getComputedStyle(cell);
      const behind = backdrop(cell);
      const own = over(parse(style.backgroundColor), behind);
      return {
        outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
        background: style.backgroundColor,
        textContrast: contrast(parse(style.color), own),
      };
    });
  });

/** The mark's own contrast against the surface the table sits on. */
const markContrast = (page: Page): Promise<number> =>
  page.$$eval(CELLS, cells => {
    const parse = (value: string): number[] => {
      const parts = (value.match(/[\d.]+/g) ?? []).map(Number);
      return parts.length === 3 ? [...parts, 1] : parts;
    };
    const over = (fg: number[], bg: number[]): number[] =>
      [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
    const channel = (c: number): number => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (c: number[]): number =>
      0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
    const contrast = (a: number[], b: number[]): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const backdrop = (el: Element): number[] => {
      let node: Element | null = el.parentElement;
      while (node != null) {
        const parsed = parse(getComputedStyle(node).backgroundColor);
        if (parsed[3] === 1) {
          return parsed;
        }
        node = node.parentElement;
      }
      return [255, 255, 255, 1];
    };
    const selected = cells[0];
    const style = getComputedStyle(selected);
    const behind = backdrop(selected);
    // Whichever way the cell is marked, measure that mark against the
    // surface: the ring if it is ringed, the background if it is washed.
    const mark =
      style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
        ? parse(style.outlineColor)
        : parse(style.backgroundColor);
    return contrast(over(mark, behind), behind);
  });

const texts = (page: Page): Promise<string[]> =>
  page.$$eval(CELLS, cells =>
    cells.map(cell => cell.textContent?.trim() ?? ''),
  );

/** Drags from one cell to another, the gesture that selects a cell range. */
async function dragAcross(page: Page, from: number, to: number) {
  const start = await page.locator(CELLS).nth(from).boundingBox();
  const end = await page.locator(CELLS).nth(to).boundingBox();
  if (start == null || end == null) {
    throw new Error('a cell has no box');
  }
  await page.mouse.move(start.x + 15, start.y + start.height / 2);
  await page.mouse.down();
  // Past the anchor cell's edge first: the engine starts highlighting once
  // the pointer leaves the cell it went down in.
  await page.mouse.move(start.x + 40, start.y + start.height / 2, {steps: 4});
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 20,
  });
  await page.mouse.up();
}

/** Did the selection change how this cell looks? */
const looksDifferent = (before: CellPaint, after: CellPaint): boolean =>
  before.outline !== after.outline || before.background !== after.background;

test('the cells a selection covers are marked, and the rest are not', async ({
  page,
}) => {
  const errors = await openWithTable(page);
  const before = await paints(page);

  // The top-left 2×2 block of a 3-column table: cells 0, 1, 3 and 4.
  await dragAcross(page, 0, 4);
  const after = await paints(page);

  const marked = after
    .map((paint, index) => (looksDifferent(before[index], paint) ? index : -1))
    .filter(index => index !== -1);
  expect(marked, 'the selection marks the 2×2 block it covers').toEqual([
    0, 1, 3, 4,
  ]);
  expect(errors).toEqual([]);
});

test('the mark is visible against the surface in every theme and mode', async ({
  page,
}) => {
  const failures: string[] = [];
  for (const theme of THEMES) {
    for (const mode of MODES) {
      await openWithTable(page, theme, mode);
      const before = await paints(page);
      await dragAcross(page, 0, 4);
      const after = await paints(page);

      // Seen, not merely computed: a mark whose colour equals the surface
      // behind it is a different computed value and no mark at all.
      if (!looksDifferent(before[0], after[0])) {
        failures.push(`${theme}/${mode}: a selected cell looks unchanged`);
        continue;
      }
      const contrast = await markContrast(page);
      if (contrast < NON_TEXT_CONTRAST) {
        failures.push(
          `${theme}/${mode}: the mark clears the surface by only ${contrast.toFixed(2)}:1`,
        );
      }
      // And the mark costs the cell's own text nothing: a wash drawn behind
      // the text would show up here as a drop.
      if (after[0].textContrast < before[0].textContrast - 0.01) {
        failures.push(
          `${theme}/${mode}: selecting drops header text from ${before[0].textContrast.toFixed(2)}:1 to ${after[0].textContrast.toFixed(2)}:1`,
        );
      }
    }
  }
  expect(failures).toEqual([]);
});

test('the mark marks exactly the cells the next keystroke replaces', async ({
  page,
}) => {
  const errors = await openWithTable(page);
  const before = await paints(page);
  const filled = (await texts(page))
    .map((text, index) => (text === '' ? -1 : index))
    .filter(index => index !== -1);

  await dragAcross(page, 0, 4);
  const marked = (await paints(page))
    .map((paint, index) => (looksDifferent(before[index], paint) ? index : -1))
    .filter(index => index !== -1);

  await page.keyboard.press('Backspace');
  const emptied = (await texts(page))
    .map((text, index) => (text === '' ? index : -1))
    .filter(index => index !== -1 && filled.includes(index));

  expect(emptied, 'the keystroke emptied the cells that were marked').toEqual(
    marked.filter(index => filled.includes(index)),
  );
  expect(emptied.length, 'the keystroke emptied something').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('the mark goes when the selection goes', async ({page}) => {
  const errors = await openWithTable(page);
  const before = await paints(page);

  await dragAcross(page, 0, 4);
  expect(looksDifferent(before[0], (await paints(page))[0])).toBe(true);

  // A caret in one cell is not a cell selection.
  await page.locator(CELLS).nth(8).click();
  await expect
    .poll(async () => {
      const now = await paints(page);
      return now.filter((paint, index) => looksDifferent(before[index], paint))
        .length;
    })
    .toBe(0);
  expect(errors).toEqual([]);
});

test('a read surface marks a dragged selection the same way', async ({
  page,
}) => {
  // Lexical's table pointer handler does not ask whether the surface is
  // editable, so a read surface makes cell selections too — and a person
  // selecting cells there is about to copy them, so the mark belongs. Held
  // because the two surfaces must render the same document the same way:
  // marking only one of them would be the drift this spec exists to catch.
  const errors = await openWithTable(page);
  await page.getByRole('tab', {name: 'RichTextView'}).click();

  const VIEW =
    '[data-playground-output="view"] table th, [data-playground-output="view"] table td';
  await expect(page.locator(VIEW)).toHaveCount(9);
  const outlines = () =>
    page.$$eval(VIEW, cells =>
      cells.map(cell => {
        const style = getComputedStyle(cell);
        return `${style.outlineStyle} ${style.outlineWidth}`;
      }),
    );
  const before = await outlines();
  expect(new Set(before).size, 'nothing is marked before a drag').toBe(1);

  const start = await page.locator(VIEW).nth(0).boundingBox();
  const end = await page.locator(VIEW).nth(4).boundingBox();
  if (start == null || end == null) {
    throw new Error('a cell has no box');
  }
  await page.mouse.move(start.x + 10, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 30, start.y + start.height / 2, {steps: 4});
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 20,
  });
  await page.mouse.up();

  await expect
    .poll(
      async () => (await outlines()).filter((o, i) => o !== before[i]).length,
    )
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
