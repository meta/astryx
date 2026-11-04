// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Table/ ^apps/storybook/stories/TableStickyColumns

/**
 * @file TableStickyDividers.a11y.browser.spec.ts
 * @input Built TableStickyColumns stories in real Chromium and WebKit
 * @output Browser evidence that a pinned column draws each row's divider
 *   itself: the line under it moves with it, matches the row's own divider,
 *   and carries a theme's divider color and an app's row border
 * @position Regression proof for the sticky-columns plugin's pinned dividers
 *
 * With collapsed borders the table paints every border at its cell's static
 * place. A sticky cell moves and its border does not, so the line under a
 * pinned column used to be whichever scrolled cell's border passed beneath it,
 * and was missing where that cell had none.
 */

import {expect, test, type Page} from '@playwright/test';
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

async function mount(page: Page, story: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablestickycolumns--${story}&viewMode=story`,
  );
  const wrapper = page.locator('.astryx-table-scroll-wrapper').first();
  await expect(wrapper).toBeVisible();
  return wrapper;
}

async function scrollTo(page: Page, left: number) {
  await page.evaluate(x => {
    const wrapper = document.querySelector(
      '.astryx-table-scroll-wrapper',
    ) as HTMLElement;
    wrapper.scrollLeft = x;
  }, left);
  // Two frames: the scroll lands and paints.
  await page.evaluate(
    async () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

type Rgb = [number, number, number];

/**
 * The column of pixels within 3 px of a body row's bottom edge (-1: the
 * header row's), top to
 * bottom, at an x inside the pinned cell and at an x inside the first
 * unpinned cell visible past it.
 */
async function dividerPixels(
  page: Page,
  row: number,
): Promise<{pinned: Rgb[]; unpinned: Rgb[]}> {
  const points = await page.evaluate(index => {
    const tr = (
      index < 0
        ? document.querySelector('.astryx-table-scroll-wrapper thead tr')
        : document.querySelectorAll('.astryx-table-scroll-wrapper tbody tr')[
            index
          ]
    ) as HTMLElement;
    const pinned = tr.children[0].getBoundingClientRect();
    return {
      y: Math.round(pinned.bottom),
      pinnedX: Math.round(pinned.left + pinned.width / 2),
      unpinnedX: Math.round(pinned.right + 40),
    };
  }, row);
  const sample = async (x: number): Promise<Rgb[]> => {
    const shot = await page.screenshot({
      clip: {x, y: points.y - 3, width: 1, height: 6},
      scale: 'css',
    });
    return page.evaluate(async b64 => {
      const image = new Image();
      image.src = `data:image/png;base64,${b64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (context == null) {
        return [];
      }
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, image.width, image.height).data;
      const column: [number, number, number][] = [];
      for (let i = 0; i < data.length; i += 4) {
        column.push([data[i], data[i + 1], data[i + 2]]);
      }
      return column;
    }, shot.toString('base64'));
  };
  return {
    pinned: await sample(points.pinnedX),
    unpinned: await sample(points.unpinnedX),
  };
}

/**
 * WebKit paints a translucent collapsed border twice, so a token divider
 * shows darker across the row than its colour; a pinned cell draws the
 * token's true colour once. The pixel comparisons against the row's own
 * divider at the token colour hold in Chromium only.
 */
const WEBKIT_DOUBLE_PAINT =
  'WebKit paints translucent collapsed borders twice; the pinned divider draws the token once';

const near = (a: Rgb, b: Rgb, tolerance = 6) =>
  a.every((channel, i) => Math.abs(channel - b[i]) <= tolerance);
/** Every pixel of one column matches the other's, top to bottom. */
const sameColumn = (a: Rgb[], b: Rgb[], tolerance = 6) =>
  a.length === b.length && a.every((rgb, i) => near(rgb, b[i], tolerance));
/** The darkest pixel of a column: the divider's own color. */
const darkest = (column: Rgb[]): Rgb =>
  column.reduce((best, rgb) =>
    rgb[0] + rgb[1] + rgb[2] < best[0] + best[1] + best[2] ? rgb : best,
  );

test('the divider under a pinned cell matches its row, at rest and scrolled', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', WEBKIT_DOUBLE_PAINT);
  await mount(page, 'pin-start');
  for (const left of [0, 150]) {
    await scrollTo(page, left);
    for (const row of [0, 1, 2]) {
      const {pinned, unpinned} = await dividerPixels(page, row);
      expect(sameColumn(pinned, unpinned), `row ${row} at ${left}px`).toBe(
        true,
      );
      expect(
        darkest(pinned)[0],
        `row ${row} at ${left}px is drawn`,
      ).toBeLessThan(250);
    }
  }
});

test('a pinned cell keeps its divider where the cell scrolled beneath it has none', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', WEBKIT_DOUBLE_PAINT);
  await mount(page, 'pin-start');
  await scrollTo(page, 150);
  const before = await dividerPixels(page, 1);
  await page.evaluate(() => {
    const row = document.querySelectorAll(
      '.astryx-table-scroll-wrapper tbody tr',
    )[1];
    const pinned = row.children[0].getBoundingClientRect();
    for (const cell of Array.from(row.children).slice(1)) {
      const rect = cell.getBoundingClientRect();
      if (rect.left <= pinned.right && rect.right >= pinned.left) {
        (cell as HTMLElement).style.borderBottomColor = 'transparent';
      }
    }
  });
  const after = await dividerPixels(page, 1);
  expect(sameColumn(after.pinned, before.pinned)).toBe(true);
});

test("a theme's divider color and an app's row border carry over to the pinned cells", async ({
  page,
}) => {
  await mount(page, 'pinned-dividers');
  for (const left of [0, 150]) {
    await scrollTo(page, left);
    // Row 1: the theme's blue divider, under the pinned cell as elsewhere.
    const themed = await dividerPixels(page, 0);
    expect(
      sameColumn(themed.pinned, themed.unpinned, 24),
      `themed at ${left}px`,
    ).toBe(true);
    const blue = darkest(themed.pinned);
    expect(blue[2], `themed at ${left}px is blue`).toBeGreaterThan(
      blue[0] + 60,
    );
    // Row 2: the app's red row border wins the collapse; the pinned cell
    // draws it too.
    // Every pixel of the column: a pinned line of the theme's blue over the
    // app's red (the row's border not carried) fails here.
    const app = await dividerPixels(page, 1);
    expect(sameColumn(app.pinned, app.unpinned, 24), `app at ${left}px`).toBe(
      true,
    );
    const red = darkest(app.pinned);
    expect(red[0], `app at ${left}px is red`).toBeGreaterThan(red[2] + 60);
  }
});

test('a border that changes after mount reaches the pinned cell', async ({
  page,
}) => {
  await mount(page, 'pinned-dividers-live');
  await page.getByRole('button', {name: 'Add columns'}).click();
  await page.getByRole('button', {name: 'Highlight'}).click();
  for (const left of [0, 150]) {
    await scrollTo(page, left);
    const {pinned, unpinned} = await dividerPixels(page, 2);
    expect(sameColumn(pinned, unpinned, 24), `at ${left}px`).toBe(true);
    const green = darkest(pinned);
    expect(green[1], `at ${left}px is green`).toBeGreaterThan(green[0] + 60);
  }
});

test('the end shadow follows columns added without a resize', async ({
  page,
}) => {
  const wrapper = await mount(page, 'pinned-dividers-live');
  const shadow = async () =>
    wrapper.evaluate(el =>
      (el as HTMLElement).style.getPropertyValue('--table-sticky-shadow-end'),
    );
  expect(await shadow()).toBe('0');
  await page.getByRole('button', {name: 'Add columns'}).click();
  await expect.poll(shadow).toBe('1');
});

test("an app's :hover rule on the cells reaches the pinned cell in CSS", async ({
  page,
}) => {
  await mount(page, 'pinned-dividers-live');
  await page.getByRole('button', {name: 'Add columns'}).click();
  for (const left of [0, 150]) {
    await scrollTo(page, left);
    await page
      .locator('.astryx-table-scroll-wrapper tbody tr')
      .nth(0)
      .hover({position: {x: 400, y: 10}});
    const {pinned, unpinned} = await dividerPixels(page, 0);
    expect(sameColumn(pinned, unpinned, 24), `at ${left}px`).toBe(true);
    const purple = darkest(pinned);
    expect(purple[2], `at ${left}px is purple`).toBeGreaterThan(purple[1] + 60);
  }
});

test('a pinned cell stops carrying a border once its own wins again', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', WEBKIT_DOUBLE_PAINT);
  await mount(page, 'pinned-dividers-live');
  await page.getByRole('button', {name: 'Add columns'}).click();
  const highlight = page.getByRole('button', {name: 'Highlight'});
  await highlight.click();
  await highlight.click();
  const pinnedCell = page
    .locator('.astryx-table-scroll-wrapper tbody tr')
    .nth(2)
    .locator('td')
    .first();
  // Nothing carried: the token (and a later theme change) reaches it in CSS.
  await expect(pinnedCell).toHaveAttribute('data-astryx-table-pinned', '');
  const {pinned, unpinned} = await dividerPixels(page, 2);
  expect(sameColumn(pinned, unpinned)).toBe(true);
});

test("the next row's wider top border wins under the pinned cell too", async ({
  page,
}) => {
  await mount(page, 'pinned-dividers-live');
  await page.getByRole('button', {name: 'Add columns'}).click();
  await page.getByRole('button', {name: 'Thick top'}).click();
  for (const left of [0, 150]) {
    await scrollTo(page, left);
    const {pinned, unpinned} = await dividerPixels(page, 2);
    expect(sameColumn(pinned, unpinned, 24), `at ${left}px`).toBe(true);
    const orange = darkest(pinned);
    expect(orange[0], `at ${left}px is orange`).toBeGreaterThan(orange[2] + 60);
  }
});

test('a row border recoloured by CSS state alone (tr:hover) reaches the pinned cell', async ({
  page,
}) => {
  await mount(page, 'pinned-dividers-live');
  await page.getByRole('button', {name: 'Add columns'}).click();
  await page.getByRole('button', {name: 'Row borders', exact: true}).click();
  for (const left of [0, 150]) {
    await scrollTo(page, left);
    await page
      .locator('.astryx-table-scroll-wrapper tbody tr')
      .nth(0)
      .hover({position: {x: 400, y: 10}});
    await expect
      .poll(async () => {
        const {pinned, unpinned} = await dividerPixels(page, 0);
        const red = darkest(pinned);
        return sameColumn(pinned, unpinned, 24) && red[0] > red[2] + 60;
      }, `at ${left}px`)
      .toBe(true);
  }
});

test("the first body row's wider top border wins under the pinned header too", async ({
  page,
}) => {
  await mount(page, 'pinned-dividers-live');
  await page.getByRole('button', {name: 'Add columns'}).click();
  await page.getByRole('button', {name: 'First row top'}).click();
  for (const left of [0, 150]) {
    await scrollTo(page, left);
    // The header's bottom edge, under the pinned header cell and past it.
    const {pinned, unpinned} = await dividerPixels(page, -1);
    expect(sameColumn(pinned, unpinned, 24), `at ${left}px`).toBe(true);
    const orange = darkest(pinned);
    expect(orange[0], `at ${left}px is orange`).toBeGreaterThan(orange[2] + 60);
  }
});

test('a carried border follows an operating-system switch between light and dark', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', WEBKIT_DOUBLE_PAINT);
  // The story's table sits in a `system`-mode Theme.
  await page.emulateMedia({colorScheme: 'light'});
  await mount(page, 'pinned-dividers-live');
  await page.getByRole('button', {name: 'Add columns'}).click();
  // The third row's wider top border, in the border token: the pinned cells
  // above it carry its colour as values, which the mode watch reads again.
  await page.getByRole('button', {name: 'Token top border'}).click();
  // Let the resize read that follows the border land first, so the switch
  // below is re-read by the mode watch alone.
  await page.waitForTimeout(200);
  await page.emulateMedia({colorScheme: 'dark'});
  for (const left of [0, 150]) {
    await scrollTo(page, left);
    await expect
      .poll(async () => {
        const {pinned, unpinned} = await dividerPixels(page, 1);
        return sameColumn(pinned, unpinned, 12);
      }, `at ${left}px`)
      .toBe(true);
  }
});

test("an open panel's divider follows an operating-system switch between light and dark", async ({
  page,
}) => {
  await page.emulateMedia({colorScheme: 'light'});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablerowexpansion--panel-divider-follows-scheme&viewMode=story`,
  );
  await expect(page.locator('tr[data-expansion-panel]')).toBeVisible();
  // The colour the panel's divider draws, against its row's cells' (the
  // panel sits on its own surface, so its pixels differ from a row's).
  const colours = async () =>
    page.evaluate(() => {
      const panel = document.querySelector('tr[data-expansion-panel] > td');
      const row =
        panel?.parentElement?.previousElementSibling?.lastElementChild;
      return {
        panel: panel == null ? '' : getComputedStyle(panel).borderBottomColor,
        row: row == null ? '' : getComputedStyle(row).borderBottomColor,
      };
    });
  const light = await colours();
  expect(light.panel).toBe(light.row);
  // No override reaches the row, so the panel carries nothing: its divider
  // is the tokens, in CSS, and follows a theme change on its own.
  expect(
    await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>(
        'tr[data-expansion-panel] > td',
      );
      return panel?.style.getPropertyValue('--_table-panel-divider-color');
    }),
  ).toBe('');
  await page.emulateMedia({colorScheme: 'dark'});
  await expect
    .poll(async () => {
      const dark = await colours();
      return dark.panel === dark.row && dark.panel !== light.panel;
    })
    .toBe(true);
});

test("a carried border follows a theme switched at the same mode between the hooks' owner and the table", async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', WEBKIT_DOUBLE_PAINT);
  await page.emulateMedia({colorScheme: 'light'});
  await mount(page, 'pinned-dividers-live');
  await page.getByRole('button', {name: 'Add columns'}).click();
  await page.getByRole('button', {name: 'Token top border'}).click();
  await page.waitForTimeout(200);
  // Another theme in the same mode, from the Theme around the table: the
  // component that calls the hooks does not re-render.
  await page.getByRole('button', {name: 'Theme stone'}).click();
  // The two themes' border tokens are a few levels apart in pixels, so the
  // pinned divider's computed colour is compared with the border it carries.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const row = document.querySelectorAll<HTMLTableRowElement>(
          '.astryx-table-scroll-wrapper tbody tr',
        );
        const pinned = row[1]?.querySelector('[data-astryx-table-pinned]');
        const below = row[2]?.cells[row[2].cells.length - 2];
        if (pinned == null || below == null) {
          return false;
        }
        return (
          getComputedStyle(pinned, '::before').borderBottomColor ===
          getComputedStyle(below).borderTopColor
        );
      }),
    )
    .toBe(true);
});

test("an open panel's carried override follows an operating-system switch between light and dark", async ({
  page,
}) => {
  await page.emulateMedia({colorScheme: 'light'});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablerowexpansion--panel-divider-follows-scheme&viewMode=story&args=override:!true`,
  );
  await expect(page.locator('tr[data-expansion-panel]')).toBeVisible();
  const colours = async () =>
    page.evaluate(() => {
      const panel = document.querySelector('tr[data-expansion-panel] > td');
      const row =
        panel?.parentElement?.previousElementSibling?.lastElementChild;
      return {
        panel: panel == null ? '' : getComputedStyle(panel).borderBottomColor,
        row: row == null ? '' : getComputedStyle(row).borderBottomColor,
        style: panel == null ? '' : getComputedStyle(panel).borderBottomStyle,
      };
    });
  const light = await colours();
  expect(light.panel).toBe(light.row);
  expect(light.style).toBe('dashed');
  await page.emulateMedia({colorScheme: 'dark'});
  await expect
    .poll(async () => {
      const dark = await colours();
      return dark.panel === dark.row && dark.panel !== light.panel;
    })
    .toBe(true);
});

test("a carried border follows a Theme switched between the hooks' owner and the table", async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', WEBKIT_DOUBLE_PAINT);
  await page.emulateMedia({colorScheme: 'light'});
  await mount(page, 'pinned-dividers-live');
  await page.getByRole('button', {name: 'Add columns'}).click();
  // The third row's wider top border, in the border token: the pinned cells
  // above it carry its colour as values, which the mode watch reads again.
  await page.getByRole('button', {name: 'Token top border'}).click();
  // The Theme around the table switches on its own state: the component
  // that calls the hooks does not re-render.
  await page.getByRole('button', {name: 'Theme dark'}).click();
  for (const left of [0, 150]) {
    await scrollTo(page, left);
    await expect
      .poll(async () => {
        const {pinned, unpinned} = await dividerPixels(page, 1);
        return sameColumn(pinned, unpinned, 12);
      }, `at ${left}px`)
      .toBe(true);
  }
});

test("a table revealed from state below the hooks' owner carries a winning row border", async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablestickycolumns--pinned-dividers-revealed&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Show table'}).click();
  await expect(page.locator('.astryx-table-scroll-wrapper')).toBeVisible();
  for (const left of [0, 150]) {
    await scrollTo(page, left);
    await expect
      .poll(async () => {
        const {pinned, unpinned} = await dividerPixels(page, 1);
        const red = darkest(pinned);
        return sameColumn(pinned, unpinned, 24) && red[0] > red[2] + 60;
      }, `at ${left}px`)
      .toBe(true);
  }
});

test("a row border recoloured without re-rendering the hooks' owner stays whole under the pinned column", async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablestickycolumns--pinned-dividers-revealed&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Show table'}).click();
  await expect(page.locator('.astryx-table-scroll-wrapper')).toBeVisible();
  await page.getByRole('button', {name: 'Recolour row'}).click();
  for (const left of [0, 150]) {
    await scrollTo(page, left);
    await expect
      .poll(async () => {
        const {pinned, unpinned} = await dividerPixels(page, 1);
        const green = darkest(pinned);
        return sameColumn(pinned, unpinned, 24) && green[1] > green[0] + 60;
      }, `at ${left}px`)
      .toBe(true);
  }
});

test("a cell border recoloured without re-rendering the hooks' owner stays whole under the pinned column", async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablestickycolumns--pinned-dividers-revealed&viewMode=story`,
  );
  // The border is on the cells when the table first reads it, so the pinned
  // cells carry its width alone; the recolour then reaches them in CSS.
  await page.getByRole('button', {name: 'Border on cells'}).click();
  await page.getByRole('button', {name: 'Show table'}).click();
  await expect(page.locator('.astryx-table-scroll-wrapper')).toBeVisible();
  await expect(
    page
      .locator('tbody tr:has(> [data-astryx-table-pinned])')
      .nth(1)
      .locator('> [data-astryx-table-pinned]'),
  ).toHaveAttribute('data-astryx-table-pinned', 'width');
  await page.getByRole('button', {name: 'Recolour row'}).click();
  for (const left of [0, 150]) {
    await scrollTo(page, left);
    await expect
      .poll(async () => {
        const {pinned, unpinned} = await dividerPixels(page, 1);
        const green = darkest(pinned);
        return sameColumn(pinned, unpinned, 24) && green[1] > green[0] + 60;
      }, `at ${left}px`)
      .toBe(true);
  }
});
