// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|packages/core/src/hooks/(useTreeFocus|isRtlElement)|packages/core/src/utils/(focusReturn|useFocusLeavingChange|focusOutline)|apps/storybook/stories/TableTree\.stories)

/**
 * @file TableTreeKeyboard.a11y.browser.spec.ts
 * @input Built Core/TableTree stories in LTR and RTL, and real Chromium and
 *   WebKit keyboard, pointer and script input
 * @output Browser evidence for the tree plugin's row-focus keyboard model. It
 *   covers Tab order, the row stop, arrows by reading direction and in-cell
 *   keys. It covers the overflow stop, focus when a row goes, and ring clipping.
 * @position Cross-browser proof for useTableTreeData's treegrid rows. A DOM
 *   emulator cannot show native <tr> focus, real Tab order or ring geometry.
 *   Visual coverage owns the pixels. The accessibility tree is read in
 *   TableTreeSemantics.a11y.chromium.spec.ts.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
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

const DIRECTIONS = ['ltr', 'rtl'] as const;

type Direction = (typeof DIRECTIONS)[number];

// macOS WebKit defaults to text-field traversal. Option+Tab selects its native
// all-controls traversal, equivalent to enabling Safari's keyboard preference.
function tabKey(browserName: string, reverse = false): string {
  return `${browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+' : ''}${reverse ? 'Shift+' : ''}Tab`;
}

/** The arrow toward the end of a line of text, and the one toward its start. */
function inlineKeys(direction: Direction) {
  return direction === 'ltr'
    ? {inlineEnd: 'ArrowRight', inlineStart: 'ArrowLeft'}
    : {inlineEnd: 'ArrowLeft', inlineStart: 'ArrowRight'};
}

async function mount(page: Page, story: string, direction: Direction = 'ltr') {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tabletree--${story}&viewMode=story&globals=direction:${direction}`,
  );
  await expect(page.getByRole('treegrid')).toBeVisible();
}

/** A body row, by the id its record has in the story data. */
function row(page: Page, id: string): Locator {
  return page.locator(`tbody tr[data-tree-id="${id}"]`);
}

/** The ids of the rendered rows, in DOM order. */
async function rowIds(page: Page): Promise<string[]> {
  return page
    .locator('tbody tr[data-tree-id]')
    .evaluateAll(rows =>
      rows.map(element => element.getAttribute('data-tree-id') ?? ''),
    );
}

/** The scroll viewport Table wraps around its <table>. */
function scrollRegion(page: Page): Locator {
  return page.locator('.astryx-table-scroll-wrapper');
}

/**
 * The stories render the table alone, so a Tab walk has nowhere to start and
 * nowhere to land. A button on each side of the story root gives it both ends
 * without touching anything React renders.
 */
async function addTabSentinels(page: Page) {
  await page.evaluate(() => {
    for (const [name, place] of [
      ['Before table', 'prepend'],
      ['After table', 'append'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      document.body[place](button);
    }
  });
  return {
    before: page.getByRole('button', {name: 'Before table', exact: true}),
    after: page.getByRole('button', {name: 'After table', exact: true}),
  };
}

/**
 * Names the focused element as a walk reads it back: a row by its id, a
 * control by its label and row.
 */
async function focusedStop(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active == null || active === document.body) {
      return 'nothing';
    }
    const owner = active.closest('tr[data-tree-id]');
    const id = owner?.getAttribute('data-tree-id');
    if (active === owner) {
      return `row ${id}`;
    }
    const label = (
      active.getAttribute('aria-label') ??
      (active instanceof HTMLInputElement
        ? active.labels?.[0]?.textContent
        : null) ??
      active.textContent ??
      ''
    ).trim();
    return id == null ? label : `${label} in ${id}`;
  });
}

async function tabWalk(
  page: Page,
  browserName: string,
  steps: number,
  reverse = false,
): Promise<string[]> {
  const stops: string[] = [];
  for (let step = 0; step < steps; step++) {
    await page.keyboard.press(tabKey(browserName, reverse));
    stops.push(await focusedStop(page));
  }
  return stops;
}

/** Waits for two frames, so a scroll a key started has begun and reported. */
async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(
    async () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

/**
 * Makes the page taller than the window, then records every scroll from here
 * on. ArrowUp, ArrowDown, Space, Home or End let through by the rows would
 * scroll the page.
 */
async function watchScrolling(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.style.blockSize = '200vh';
    document.body.append(spacer);
    const scrolls: string[] = [];
    Object.assign(window, {tableTreeScrolls: scrolls});
    window.addEventListener(
      'scroll',
      event => {
        scrolls.push(
          event.target instanceof Element
            ? event.target.tagName.toLowerCase()
            : 'page',
        );
      },
      {capture: true},
    );
  });
  return async () => {
    await nextFrames(page);
    return page.evaluate(
      () =>
        (window as unknown as {tableTreeScrolls: string[]}).tableTreeScrolls,
    );
  };
}

/** Holds a key down through a few auto-repeats, then lets it go. */
async function holdKey(page: Page, key: string): Promise<void> {
  for (let repeat = 0; repeat < 4; repeat++) {
    await page.keyboard.down(key);
  }
  await page.keyboard.up(key);
}

/** Scrolls a region halfway along its inline axis, so a key could move it. */
async function scrollToMiddle(region: Locator): Promise<number> {
  return region.evaluate(async element => {
    const middle = (element.scrollWidth - element.clientWidth) / 2;
    element.scrollLeft =
      getComputedStyle(element).direction === 'rtl' ? -middle : middle;
    await new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return element.scrollLeft;
  });
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Ring {
  isFocusVisible: boolean;
  style: string;
  width: number;
  offset: number;
  color: string;
  /** The ring's outer edge. */
  box: Box;
  /** The padding box of the nearest ancestor that clips overflow. */
  clip: Box;
  clipper: string;
}

/** The ring an element draws now, and the box that would clip it. */
async function readRing(target: Locator): Promise<Ring> {
  return target.evaluate(node => {
    const computed = getComputedStyle(node);
    const width = Number.parseFloat(computed.outlineWidth);
    const offset = Number.parseFloat(computed.outlineOffset);
    const reach = offset + width;
    const rect = node.getBoundingClientRect();
    let clipper = node.parentElement ?? document.documentElement;
    while (
      clipper.parentElement != null &&
      getComputedStyle(clipper).overflowX === 'visible' &&
      getComputedStyle(clipper).overflowY === 'visible'
    ) {
      clipper = clipper.parentElement;
    }
    const outer = clipper.getBoundingClientRect();
    const left = outer.left + clipper.clientLeft;
    const top = outer.top + clipper.clientTop;
    return {
      isFocusVisible: node.matches(':focus-visible'),
      style: computed.outlineStyle,
      width,
      offset,
      color: computed.outlineColor,
      box: {
        left: rect.left - reach,
        top: rect.top - reach,
        right: rect.right + reach,
        bottom: rect.bottom + reach,
      },
      clip: {
        left,
        top,
        right: left + clipper.clientWidth,
        bottom: top + clipper.clientHeight,
      },
      clipper: clipper.tagName.toLowerCase(),
    };
  });
}

/**
 * The ring the shared `--focus-outline-*` tokens draw, resolved inside the
 * story's theme, where a theme's own values apply.
 */
async function readSharedRing(page: Page) {
  return page.getByRole('treegrid').evaluate(table => {
    const probe = document.createElement('span');
    probe.style.cssText =
      'position: fixed; visibility: hidden; outline: var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color); outline-offset: var(--focus-outline-offset)';
    (table.closest('[dir]') ?? table.parentElement ?? document.body).append(
      probe,
    );
    const computed = getComputedStyle(probe);
    const ring = {
      style: computed.outlineStyle,
      width: Number.parseFloat(computed.outlineWidth),
      offset: Number.parseFloat(computed.outlineOffset),
      color: computed.outlineColor,
    };
    probe.remove();
    return ring;
  });
}

/** The bottom of the row above a row and the top of the row below it. */
async function neighbourEdges(target: Locator) {
  return target.evaluate(node => {
    const rows = Array.from(
      node.closest('table')?.querySelectorAll('tr') ?? [],
    );
    const index = rows.indexOf(node as HTMLTableRowElement);
    return {
      above: rows[index - 1]?.getBoundingClientRect().bottom ?? -Infinity,
      below: rows[index + 1]?.getBoundingClientRect().top ?? Infinity,
    };
  });
}

/** An element's padding box, the area that its overflow clips to. */
async function paddingBox(target: Locator): Promise<Box> {
  return target.evaluate(node => {
    const outer = node.getBoundingClientRect();
    const left = outer.left + node.clientLeft;
    const top = outer.top + node.clientTop;
    return {
      left,
      top,
      right: left + node.clientWidth,
      bottom: top + node.clientHeight,
    };
  });
}

/**
 * Expects `inner` within `outer` on the given edges, give or take half a
 * pixel of rounding.
 */
function expectWithin(
  inner: Box,
  outer: Box,
  what: string,
  edges: ReadonlyArray<keyof Box> = ['left', 'top', 'right', 'bottom'],
): void {
  for (const edge of edges) {
    if (edge === 'left' || edge === 'top') {
      expect(inner[edge], `${what}: ${edge}`).toBeGreaterThanOrEqual(
        outer[edge] - 0.5,
      );
    } else {
      expect(inner[edge], `${what}: ${edge}`).toBeLessThanOrEqual(
        outer[edge] + 0.5,
      );
    }
  }
}

test('Tab enters the rows at the one active row, between the controls around it, and leaves past the last control', async ({
  page,
  browserName,
}) => {
  await mount(page, 'header-expand-all-control');
  const {before} = await addTabSentinels(page);

  await before.focus();
  // The header control comes first, then one stop for the rows, then each
  // row's own control.
  expect(await tabWalk(page, browserName, 7)).toEqual([
    'Expand all rows',
    'row eng',
    'Collapse row in eng',
    'Expand row in eng-platform',
    'Expand row in eng-product',
    'Expand row in design',
    'After table',
  ]);
});

test('Shift+Tab walks the same stops backwards and enters the rows at the active row', async ({
  page,
  browserName,
}) => {
  await mount(page, 'header-expand-all-control');
  const {after} = await addTabSentinels(page);

  await after.focus();
  expect(await tabWalk(page, browserName, 7, true)).toEqual([
    'Expand row in design',
    'Expand row in eng-product',
    'Expand row in eng-platform',
    'Collapse row in eng',
    'row eng',
    'Expand all rows',
    'Before table',
  ]);
});

test('the row stop follows an arrow key and keeps its place in DOM order both ways', async ({
  page,
  browserName,
}) => {
  await mount(page, 'header-expand-all-control');
  const {before, after} = await addTabSentinels(page);

  await before.focus();
  await tabWalk(page, browserName, 2);
  await expect(row(page, 'eng')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(row(page, 'eng-product')).toBeFocused();

  // Rows before the active one contribute only their controls now.
  await before.focus();
  expect(await tabWalk(page, browserName, 6)).toEqual([
    'Expand all rows',
    'Collapse row in eng',
    'Expand row in eng-platform',
    'row eng-product',
    'Expand row in eng-product',
    'Expand row in design',
  ]);
  await after.focus();
  expect(await tabWalk(page, browserName, 6, true)).toEqual([
    'Expand row in design',
    'Expand row in eng-product',
    'row eng-product',
    'Expand row in eng-platform',
    'Collapse row in eng',
    'Expand all rows',
  ]);
});

test('a click on a row focuses the <tr> and moves the row stop to it', async ({
  page,
  browserName,
}) => {
  await mount(page, 'default');
  const {before} = await addTabSentinels(page);
  const design = row(page, 'design');

  await design.getByText('VP Design', {exact: true}).click();

  await expect(design).toBeFocused();
  await expect(design).toHaveAttribute('tabindex', '0');
  await expect(row(page, 'eng')).toHaveAttribute('tabindex', '-1');

  // Entered from outside because the engines disagree on where Tab resumes
  // straight after a click: Chromium from the focused row, WebKit from the
  // clicked text.
  await before.focus();
  expect(await tabWalk(page, browserName, 5)).toEqual([
    'Collapse Engineering in eng',
    'Expand Platform in eng-platform',
    'Expand Product Engineering in eng-product',
    'row design',
    'Expand Design in design',
  ]);
});

test("a script's focus() on a row moves the row stop to it", async ({
  page,
  browserName,
}) => {
  await mount(page, 'default');
  const {before} = await addTabSentinels(page);
  const platform = row(page, 'eng-platform');

  await platform.focus();

  await expect(platform).toBeFocused();
  await expect(platform).toHaveAttribute('tabindex', '0');
  await expect(row(page, 'eng')).toHaveAttribute('tabindex', '-1');
  await before.focus();
  expect(await tabWalk(page, browserName, 3)).toEqual([
    'Collapse Engineering in eng',
    'row eng-platform',
    'Expand Platform in eng-platform',
  ]);
});

for (const direction of DIRECTIONS) {
  test(`${direction}: ArrowDown and ArrowUp walk the visible rows, Home and End jump to the ends, the ends hold, and nothing scrolls`, async ({
    page,
  }) => {
    await mount(page, 'default', direction);
    const eng = row(page, 'eng');
    await eng.getByText('VP Engineering', {exact: true}).click();
    await expect(eng).toBeFocused();
    const scrolls = await watchScrolling(page);

    await page.keyboard.press('ArrowDown');
    await expect(row(page, 'eng-platform')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(row(page, 'eng-product')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(row(page, 'eng-platform')).toBeFocused();

    await page.keyboard.press('End');
    await expect(row(page, 'ops')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(row(page, 'ops')).toBeFocused();

    await page.keyboard.press('Home');
    await expect(eng).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(eng).toBeFocused();
    await expect(eng).toHaveAttribute('tabindex', '0');
    expect(await scrolls()).toEqual([]);
  });
}

for (const direction of DIRECTIONS) {
  const {inlineEnd, inlineStart} = inlineKeys(direction);

  test(`${direction}: ${inlineEnd} expands and ${inlineStart} collapses, and on an expanded, collapsed or leaf row they hold focus`, async ({
    page,
  }) => {
    await mount(page, 'default', direction);
    const platform = row(page, 'eng-platform');
    await platform.getByText('Director', {exact: true}).click();
    await expect(platform).toBeFocused();

    await page.keyboard.press(inlineEnd);
    await expect(platform).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'eng-platform-core')).toBeVisible();
    await expect(platform).toBeFocused();

    // Rows only: on an expanded row the key holds. A tree view would move to
    // the first child, and the APG treegrid would enter a cell.
    await page.keyboard.press(inlineEnd);
    await expect(platform).toBeFocused();
    await expect(platform).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press(inlineStart);
    await expect(platform).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'eng-platform-core')).toHaveCount(0);
    await expect(platform).toBeFocused();

    // On a collapsed row the key does not move to the parent.
    await page.keyboard.press(inlineStart);
    await expect(platform).toBeFocused();
    await expect(row(page, 'eng')).toHaveAttribute('aria-expanded', 'true');

    const ops = row(page, 'ops');
    await ops.getByText('VP Operations', {exact: true}).click();
    await expect(ops).toBeFocused();
    await page.keyboard.press(inlineEnd);
    await expect(ops).toBeFocused();
    await page.keyboard.press(inlineStart);
    await expect(ops).toBeFocused();
    await expect(ops).not.toHaveAttribute('aria-expanded');
  });
}

test('controls inside a cell keep their own keys, and focusing one leaves the row stop in place', async ({
  page,
  browserName,
}) => {
  await mount(page, 'with-selection');
  const eng = row(page, 'eng');
  const platform = row(page, 'eng-platform');
  const checkbox = platform.getByRole('checkbox');

  await checkbox.focus();
  await page.keyboard.press('Space');
  // Space checked the box; it did not toggle the row.
  await expect(checkbox).toBeChecked();
  await expect(platform).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press(tabKey(browserName));
  const chevron = platform.getByRole('button', {
    name: 'Expand row',
    exact: true,
  });
  await expect(chevron).toBeFocused();
  // The arrow keys belong to rows. On a control they move no row focus.
  await page.keyboard.press('ArrowDown');
  await expect(chevron).toBeFocused();
  await expect(eng).toHaveAttribute('tabindex', '0');
  await expect(platform).toHaveAttribute('tabindex', '-1');

  // Enter is the button's own activation.
  await page.keyboard.press('Enter');
  await expect(platform).toHaveAttribute('aria-expanded', 'true');
  await expect(
    platform.getByRole('button', {name: 'Collapse row', exact: true}),
  ).toBeFocused();
});

test('Space and Enter on a focused row toggle it, never its selection, and scroll nothing', async ({
  page,
}) => {
  await mount(page, 'with-selection');
  const platform = row(page, 'eng-platform');
  await platform.focus();
  const scrolls = await watchScrolling(page);

  await page.keyboard.press('Space');
  await expect(platform).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Space');
  await expect(platform).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(platform).toHaveAttribute('aria-expanded', 'true');
  await expect(platform).toBeFocused();
  await expect(platform.getByRole('checkbox')).not.toBeChecked();

  // A selected leaf has nothing to toggle, and its selection stays.
  const systems = row(page, 'design-systems');
  await systems.focus();
  await page.keyboard.press('Space');
  await expect(systems).toBeFocused();
  await expect(systems).not.toHaveAttribute('aria-expanded');
  await expect(systems.getByRole('checkbox')).toBeChecked();
  expect(await scrolls()).toEqual([]);
});

test('Tab visits each selection checkbox and chevron in DOM order around the one row stop', async ({
  page,
  browserName,
}) => {
  await mount(page, 'with-selection');
  const {before} = await addTabSentinels(page);

  await before.focus();
  expect(await tabWalk(page, browserName, 14)).toEqual([
    'Select all rows',
    'row eng',
    'Select row in eng',
    'Collapse row in eng',
    'Select row in eng-platform',
    'Expand row in eng-platform',
    'Select row in eng-product',
    'Expand row in eng-product',
    'Select row in design',
    'Collapse row in design',
    'Select row in design-systems',
    'Select row in design-research',
    'Select row in ops',
    'After table',
  ]);
});

test('a sort header re-sorts the rows on Enter, and the active row keeps the row stop by its id', async ({
  page,
  browserName,
}) => {
  await mount(page, 'with-sibling-sorting');
  const {before} = await addTabSentinels(page);
  const product = row(page, 'eng-product');
  await product.getByText('Product Engineering', {exact: true}).click();
  await expect(product).toBeFocused();
  expect(await rowIds(page)).toEqual([
    'eng',
    'eng-product',
    'eng-platform',
    'eng-platform-core',
    'eng-platform-infra',
    'design',
    'ops',
  ]);

  const groupHeader = page.getByRole('columnheader', {name: 'Group'});
  await groupHeader.getByRole('button').focus();
  await page.keyboard.press('Enter');

  await expect(groupHeader).toHaveAttribute('aria-sort', 'ascending');
  await expect
    .poll(async () => rowIds(page))
    .toEqual([
      'design',
      'eng',
      'eng-platform',
      'eng-platform-core',
      'eng-platform-infra',
      'eng-product',
      'ops',
    ]);
  // The stop moved with the row, not with the place it held before the sort.
  await expect(product).toHaveAttribute('tabindex', '0');
  await expect(page.locator('tbody tr[tabindex="0"]')).toHaveCount(1);

  await before.focus();
  expect(await tabWalk(page, browserName, 8)).toEqual([
    'Group',
    'Headcount',
    'Expand row in design',
    'Collapse row in eng',
    'Collapse row in eng-platform',
    'Expand row in eng-platform-core',
    'row eng-product',
    'Expand row in eng-product',
  ]);
});

test('a fitting table puts no scroll-region stop before the rows', async ({
  page,
  browserName,
}) => {
  await mount(page, 'default');
  const {before} = await addTabSentinels(page);
  const region = scrollRegion(page);

  await expect(region).not.toHaveAttribute('data-scrollable-inline', 'true');
  await expect(region).not.toHaveAttribute('tabindex');
  await before.focus();
  expect(await tabWalk(page, browserName, 1)).toEqual(['row eng']);
  expect(await tabWalk(page, browserName, 1, true)).toEqual(['Before table']);
});

for (const direction of DIRECTIONS) {
  const {inlineEnd, inlineStart} = inlineKeys(direction);

  test(`${direction}: an overflowing table's scroll region is a stop before the rows, arrows held on a row do not scroll it, and each ring stays inside what clips it but for a row's inline edges`, async ({
    page,
    browserName,
  }) => {
    await mount(page, 'default', direction);
    // Boxes are compared below, so the web fonts must have settled.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const {before} = await addTabSentinels(page);
    const shared = await readSharedRing(page);
    const region = scrollRegion(page);
    await region.locator('table').evaluate(table => {
      const viewport = table.closest<HTMLElement>(
        '.astryx-table-scroll-wrapper',
      );
      if (viewport != null) {
        table.style.minWidth = `${viewport.clientWidth + 400}px`;
      }
    });
    await expect(region).toHaveAttribute('data-scrollable-inline', 'true');
    await expect(region).toHaveAttribute('tabindex', '0');

    await before.focus();
    expect(await tabWalk(page, browserName, 3)).toEqual([
      'Table',
      'row eng',
      'Collapse Engineering in eng',
    ]);
    // The chevron's cell clips its content, so the whole ring must fit inside.
    const chevronRing = await readRing(
      row(page, 'eng').getByRole('button', {
        name: 'Collapse Engineering',
        exact: true,
      }),
    );
    expect(chevronRing.isFocusVisible, 'chevron matches :focus-visible').toBe(
      true,
    );
    expect(
      {style: chevronRing.style, width: chevronRing.width},
      'chevron draws the shared ring',
    ).toEqual({style: shared.style, width: shared.width});
    expect(chevronRing.clipper, 'what clips the chevron').toBe('td');
    expectWithin(chevronRing.box, chevronRing.clip, 'chevron ring inside td');
    expect(await tabWalk(page, browserName, 3, true)).toEqual([
      'row eng',
      'Table',
      'Before table',
    ]);

    // A row is wider than the viewport, so the viewport cuts its ring's inline
    // edges by design. The top and bottom edges must stay inside at any scroll.
    // The last row's bottom edge is the viewport's own.
    const viewportBox = await paddingBox(region);
    expect(await tabWalk(page, browserName, 2)).toEqual(['Table', 'row eng']);
    for (const [key, id] of [
      ['Home', 'eng'],
      ['End', 'ops'],
    ] as const) {
      const target = row(page, id);
      await page.keyboard.press(key);
      await expect(target).toBeFocused();
      await region.evaluate(element => {
        element.scrollLeft = 0;
      });
      const atStart = await readRing(target);
      expect(await scrollToMiddle(region), 'the region scrolled').not.toBe(0);
      const atMiddle = await readRing(target);
      for (const [where, ring] of [
        ['at scrollLeft 0', atStart],
        ['scrolled to the middle', atMiddle],
      ] as const) {
        const what = `${id} ring ${where}`;
        expect(ring.isFocusVisible, `${what} matches :focus-visible`).toBe(
          true,
        );
        expect(
          {style: ring.style, width: ring.width},
          `${what} is the shared ring`,
        ).toEqual({style: shared.style, width: shared.width});
        expectWithin(ring.box, viewportBox, `${what} inside the viewport`, [
          'top',
          'bottom',
        ]);
      }
    }

    // Each of these keys holds focus on its row, so none may reach the region.
    for (const [id, key] of [
      ['eng', inlineEnd],
      ['ops', inlineEnd],
      ['eng-platform', inlineStart],
      ['ops', inlineStart],
    ] as const) {
      const target = row(page, id);
      await target.focus();
      const scrollLeft = await scrollToMiddle(region);
      expect(scrollLeft, 'the region scrolled to its middle').not.toBe(0);
      await holdKey(page, key);
      await nextFrames(page);
      await expect(target).toBeFocused();
      expect(
        await region.evaluate(element => element.scrollLeft),
        `${key} held on ${id}`,
      ).toBe(scrollLeft);
    }
    expect(await rowIds(page)).toEqual([
      'eng',
      'eng-platform',
      'eng-product',
      'design',
      'ops',
    ]);
  });
}

test('when a script collapses the parent of the focused row, focus and the row stop move to the parent', async ({
  page,
}) => {
  await mount(page, 'expand-and-collapse-all');
  const core = row(page, 'eng-platform-core');
  const api = row(page, 'eng-platform-core-api');
  await api.focus();
  await expect(api).toHaveAttribute('tabindex', '0');

  // A script's click toggles the row without moving focus, unlike a press.
  await core
    .getByRole('button', {name: 'Collapse row', exact: true})
    .evaluate(button => (button as HTMLElement).click());

  await expect(api).toHaveCount(0);
  await expect(core).toHaveAttribute('aria-expanded', 'false');
  await expect(core).toBeFocused();
  await expect(core).toHaveAttribute('tabindex', '0');
  await expect(row(page, 'eng')).toHaveAttribute('tabindex', '-1');
});

test('collapsing the parent from its chevron keeps focus on the chevron and moves the row stop to the parent, not the first row', async ({
  page,
  browserName,
}) => {
  await mount(page, 'expand-and-collapse-all');
  const {before} = await addTabSentinels(page);
  const platform = row(page, 'eng-platform');
  const core = row(page, 'eng-platform-core');

  await before.focus();
  expect(await tabWalk(page, browserName, 3)).toEqual([
    'Expand all',
    'Collapse all',
    'row eng',
  ]);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(core).toBeFocused();

  // Only the active row is in the Tab order, so Shift+Tab reaches the control
  // before it: its parent's chevron.
  expect(await tabWalk(page, browserName, 1, true)).toEqual([
    'Collapse row in eng-platform',
  ]);
  await page.keyboard.press('Enter');

  await expect(core).toHaveCount(0);
  await expect(
    platform.getByRole('button', {name: 'Expand row', exact: true}),
  ).toBeFocused();
  await expect(platform).toHaveAttribute('tabindex', '0');
  await expect(row(page, 'eng')).toHaveAttribute('tabindex', '-1');
  // Shift+Tab from the chevron returns to its own row.
  expect(await tabWalk(page, browserName, 1, true)).toEqual([
    'row eng-platform',
  ]);
});

test("the app's Collapse all moves focus from a deep row to its top-level row", async ({
  page,
}) => {
  await mount(page, 'expand-and-collapse-all');
  const eng = row(page, 'eng');
  const api = row(page, 'eng-platform-core-api');
  await api.focus();

  await page
    .getByRole('button', {name: 'Collapse all', exact: true})
    .evaluate(button => (button as HTMLElement).click());

  await expect(api).toHaveCount(0);
  await expect(eng).toHaveAttribute('aria-expanded', 'false');
  await expect(eng).toBeFocused();
  await expect(eng).toHaveAttribute('tabindex', '0');
});

test('removing the active row leaves focus that is outside the table where it is', async ({
  page,
}) => {
  await mount(page, 'expand-and-collapse-all');
  const api = row(page, 'eng-platform-core-api');
  await api.focus();
  const expandAll = page.getByRole('button', {name: 'Expand all', exact: true});
  await expandAll.focus();

  await page
    .getByRole('button', {name: 'Collapse all', exact: true})
    .evaluate(button => (button as HTMLElement).click());

  await expect(api).toHaveCount(0);
  await expect(expandAll).toBeFocused();
  await expect(row(page, 'eng')).toHaveAttribute('tabindex', '0');
});

for (const direction of DIRECTIONS) {
  test(`${direction}: keyboard focus draws the shared ring inset on the row and around the chevron and the expand-all toggle, inside whatever clips each`, async ({
    page,
    browserName,
  }) => {
    await mount(page, 'header-expand-all-control', direction);
    // Boxes are compared below, so the web fonts must have settled.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const {before} = await addTabSentinels(page);
    const shared = await readSharedRing(page);
    const toggle = page.getByRole('button', {
      name: 'Expand all rows',
      exact: true,
    });
    const eng = row(page, 'eng');
    const chevron = eng.getByRole('button', {
      name: 'Collapse row',
      exact: true,
    });

    await before.focus();
    await page.keyboard.press(tabKey(browserName));
    await expect(toggle).toBeFocused();
    const toggleRing = await readRing(toggle);
    await page.keyboard.press(tabKey(browserName));
    await expect(eng).toBeFocused();
    const rowRing = await readRing(eng);
    const neighbours = await neighbourEdges(eng);
    await page.keyboard.press(tabKey(browserName));
    await expect(chevron).toBeFocused();
    const chevronRing = await readRing(chevron);

    for (const [name, ring] of [
      ['toggle', toggleRing],
      ['row', rowRing],
      ['chevron', chevronRing],
    ] as const) {
      expect(ring.isFocusVisible, `${name} matches :focus-visible`).toBe(true);
      expect(
        {style: ring.style, width: ring.width, color: ring.color},
        `${name} draws the shared ring`,
      ).toEqual({
        style: shared.style,
        width: shared.width,
        color: shared.color,
      });
      expectWithin(ring.box, ring.clip, `${name} ring inside ${ring.clipper}`);
    }
    expect(toggleRing.offset).toBe(shared.offset);
    expect(chevronRing.offset).toBe(shared.offset);
    // Inset by its own width: a ring outside a <tr> lands on the rows next to
    // it and is painted over by them.
    expect(rowRing.offset).toBe(-rowRing.width);
    expect(rowRing.box.top).toBeGreaterThanOrEqual(neighbours.above - 0.5);
    expect(rowRing.box.bottom).toBeLessThanOrEqual(neighbours.below + 0.5);
  });
}
