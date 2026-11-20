// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListTouchHitArea.interaction.browser.spec.ts
 * @input The built List stories in the touch phone context, and in a mouse
 *   context of the same viewport and scale
 * @output Proofs that an interactive row's hit layer grows toward the touch
 *   target under a finger, with no overlap, layout or paint. A mouse gets no
 *   layer.
 * @position Interaction evidence for ListItem's touch hit area
 *   (internal/touchHitArea.stylex.ts, kept live by utils/touchHitArea.ts)
 */

// Geometry is read from the layer's computed edges. Chromium's
// elementFromPoint snaps a point to whole CSS pixels, which is too coarse for
// a 1 px half gap. So the hit tests probe whole pixels inside a wider growth.

import {
  expect,
  test,
  type Browser,
  type Page,
  type TestInfo,
} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

interface Row {
  readonly text: string;
  readonly top: number;
  readonly bottom: number;
  readonly height: number;
  readonly x: number;
  readonly layer: {
    readonly content: string;
    readonly top: number;
    readonly bottom: number;
    readonly paint: string;
  };
  readonly isolation: string;
  readonly written: string;
}

/** The story's rows (Storybook's own hidden error page has list items too). */
async function rowsOf(page: Page): Promise<Row[]> {
  return page.locator('#storybook-root li').evaluateAll(elements =>
    elements.map(el => {
      const box = el.getBoundingClientRect();
      const layer = getComputedStyle(el, '::after');
      const own = getComputedStyle(el);
      return {
        text: el.textContent?.trim() ?? '',
        top: box.top,
        bottom: box.bottom,
        height: box.height,
        x: box.left + box.width / 2,
        layer: {
          content: layer.content,
          // How far the layer reaches past the row's border box, in px. Its
          // offsets start at the row's padding box, so past a border, such as
          // a divided row's, it reaches that much less.
          top:
            layer.content === 'none'
              ? 0
              : 0 -
                Number.parseFloat(layer.top) -
                Number.parseFloat(own.borderTopWidth),
          bottom:
            layer.content === 'none'
              ? 0
              : 0 -
                Number.parseFloat(layer.bottom) -
                Number.parseFloat(own.borderBottomWidth),
          paint: [
            layer.backgroundColor,
            layer.backgroundImage,
            layer.boxShadow,
            layer.borderTopWidth,
            layer.outlineStyle,
          ].join(' | '),
        },
        isolation: getComputedStyle(el).isolation,
        written: (el as HTMLElement).style.getPropertyValue(
          '--astryx-hit-inset-top',
        ),
      };
    }),
  );
}

/**
 * The rows once the shared hit area has measured them. Its pass runs in a
 * frame after the rows show, and writes only insets that differ from 0. So
 * wait a few frames, and then until two frames read the same.
 */
async function measuredRowsOf(page: Page): Promise<Row[]> {
  const frames = async (count: number) =>
    page.evaluate(async n => {
      for (let i = 0; i < n; i++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }, count);
  await frames(4);
  let previous = JSON.stringify(await rowsOf(page));
  await expect
    .poll(async () => {
      await frames(2);
      const current = JSON.stringify(await rowsOf(page));
      const settled = current === previous;
      previous = current;
      return settled;
    })
    .toBe(true);
  return rowsOf(page);
}

/** A page that sets `--size-touch-target`, before the story renders. */
async function themeTouchTarget(page: Page, size: string): Promise<void> {
  // Storybook rewrites the root element's style attribute, so a stylesheet.
  await page.addInitScript(value => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `:root { --size-touch-target: ${value}; }`;
      document.head.append(style);
    });
  }, size);
}

/** The story row the browser hit-tests at a point, by its text. */
async function rowAt(page: Page, x: number, y: number): Promise<string | null> {
  return page.evaluate(
    ([px, py]) =>
      document
        .elementFromPoint(px, py)
        ?.closest('#storybook-root li')
        ?.textContent?.trim() ?? null,
    [x, y] as const,
  );
}

const isTouch = async (page: Page) =>
  page.evaluate(() => matchMedia('(pointer: coarse)').matches);

/** No row's area reaches into the next row's area. */
function expectNoOverlap(rows: ReadonlyArray<Row>): void {
  for (let i = 0; i + 1 < rows.length; i++) {
    expect(
      rows[i].bottom + rows[i].layer.bottom,
      JSON.stringify(rows),
    ).toBeLessThanOrEqual(rows[i + 1].top - rows[i + 1].layer.top + 0.01);
  }
}

/** The same page with a mouse: the phone's viewport and scale, a fine pointer. */
async function withMouse<T>(
  browser: Browser,
  testInfo: TestInfo,
  run: (page: Page) => Promise<T>,
): Promise<T> {
  const {viewport, deviceScaleFactor} = testInfo.project.use;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    hasTouch: false,
    isMobile: false,
  });
  try {
    const page = await context.newPage();
    return await run(page);
  } finally {
    await context.close();
  }
}

test('under a finger, a short interactive row takes half the gap to each neighbor and grows toward the touch target where nothing is near', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-list--interactive');
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  const rows = await measuredRowsOf(page);
  expect(rows).toHaveLength(3);
  const gap = rows[1].top - rows[0].bottom;
  const grow = (44 - rows[0].height) / 2;
  const summary = JSON.stringify({gap, grow, rows});
  // One-line rows, shorter than the 44px touch target, 2px apart.
  expect(rows[0].height, summary).toBeLessThan(44);
  expect(gap, summary).toBeCloseTo(2, 1);
  // Half the gap between rows; the full growth past the list's ends, where
  // nothing interactive is near.
  const reach = rows.map(row => [row.layer.top, row.layer.bottom]);
  expect(reach, summary).toEqual([
    [grow, gap / 2],
    [gap / 2, gap / 2],
    [gap / 2, grow],
  ]);
  expectNoOverlap(rows);
});

test('under a finger, a tap in a row’s growth activates that row, and nothing is hit past it', async ({
  page,
}) => {
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  await openStory(page, storybook(), 'core-list--interactive');
  const rows = await measuredRowsOf(page);
  // The growth past the list's first row, toward 44px.
  const grow = (44 - rows[0].height) / 2;
  expect(grow, JSON.stringify(rows)).toBeGreaterThanOrEqual(1.5);
  expect(rows[0].layer.top, JSON.stringify(rows)).toBeCloseTo(grow, 1);
  const inside = rows[0].top - grow / 2;
  const outside = Math.round(rows[0].top - grow - 3);
  // The browser's own hit test at each point, then a real tap in the growth.
  // (No tap past it: a touch engine's own touch adjustment may move a tap
  // that lands a few pixels from a target onto it.)
  expect(await rowAt(page, rows[0].x, inside)).toBe(rows[0].text);
  expect(await rowAt(page, rows[0].x, outside)).toBe(null);
  await page.evaluate(() => {
    const taps: string[] = [];
    (window as unknown as {taps: string[]}).taps = taps;
    for (const row of document.querySelectorAll('#storybook-root li')) {
      row.addEventListener('click', () =>
        taps.push(row.textContent?.trim() ?? ''),
      );
    }
  });
  await page.touchscreen.tap(rows[0].x, inside);
  expect(
    await page.evaluate(() => (window as unknown as {taps: string[]}).taps),
  ).toEqual([rows[0].text]);
});

test('under a finger, the row’s own content keeps its taps', async ({page}) => {
  await openStory(page, storybook(), 'core-list--interactive');
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  await measuredRowsOf(page);
  const hits = await page.locator('#storybook-root li').evaluateAll(rows =>
    rows.map(row => {
      // The row's end content (its chevron), above the layer.
      const icons = row.querySelectorAll('svg');
      const end = icons[icons.length - 1];
      const box = end.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return hit != null && hit !== row && row.contains(hit);
    }),
  );
  expect(hits).toEqual([true, true, true]);
});

test('under a finger, a row’s end control keeps its taps, and the interactive rows beside it grow short of it', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-list--with-end-controls');
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  const rows = await measuredRowsOf(page);
  // (The switch's own hidden label repeats the row's text, and Network's
  // swipe action adds its own.)
  expect(rows.map(row => row.text)).toEqual([
    expect.stringMatching(/^Network/),
    expect.stringMatching(/^Wi-Fi/),
    expect.stringMatching(/^Bluetooth/),
  ]);
  // The control's row is not interactive: it has no hit area of its own.
  expect(rows[1].layer.content, JSON.stringify(rows)).toBe('none');
  const toggle = page.getByRole('switch', {name: 'Wi-Fi'});
  await expect(toggle).toBeChecked();
  const control = await toggle.evaluate(input => {
    const box = (input.parentElement ?? input).getBoundingClientRect();
    const own = input.getBoundingClientRect();
    return {
      top: box.top,
      bottom: box.bottom,
      x: own.left + own.width / 2,
      y: own.top + own.height / 2,
    };
  });
  // The rows beside it grow only to half the gap to the control. The other
  // half belongs to the control.
  const [above, , below] = rows;
  expect(above.layer.bottom, JSON.stringify({rows, control})).toBeCloseTo(
    (control.top - above.bottom) / 2,
    1,
  );
  expect(below.layer.top, JSON.stringify({rows, control})).toBeCloseTo(
    (below.top - control.bottom) / 2,
    1,
  );
  expect(
    above.bottom + above.layer.bottom,
    JSON.stringify({rows, control}),
  ).toBeLessThanOrEqual(control.top);
  expect(
    below.top - below.layer.top,
    JSON.stringify({rows, control}),
  ).toBeGreaterThanOrEqual(control.bottom);
  // The browser sends a tap in Network's band to Network, over the static
  // row after it, up to the band's end. A tap in Bluetooth's band goes to
  // Bluetooth. Network is swipeable, so it is a stacking context at rest, and
  // its band still wins. These are hit tests, not taps, because a touch
  // engine may move a tap a few pixels onto a target.
  const owner = async (y: number) =>
    page.evaluate(
      ({x, y: at}) => {
        const row = document
          .elementFromPoint(x, at)
          ?.closest('#storybook-root li');
        if (row == null) {
          return null;
        }
        // The row's own text, without its swipe actions' labels.
        const copy = row.cloneNode(true) as Element;
        for (const panel of copy.querySelectorAll('[data-swipe-panel]')) {
          panel.remove();
        }
        return (copy.textContent ?? '').trim().split(/\s+/)[0] ?? null;
      },
      {x: above.x, y},
    );
  // A swipeable row is a stacking context: its root translates.
  expect(
    await page
      .locator('#storybook-root li')
      .first()
      .evaluate(row => getComputedStyle(row).transform),
  ).not.toBe('none');
  expect(above.layer.bottom, JSON.stringify(rows)).toBeGreaterThan(1);
  expect(await owner(above.bottom + 0.5)).toBe('Network');
  expect(await owner(above.bottom + above.layer.bottom - 0.5)).toBe('Network');
  expect(await owner(above.bottom + above.layer.bottom + 0.5)).toBe('Wi-Fi');
  expect(await owner(below.top - below.layer.top + 0.5)).toBe('Bluetooth');
  // The browser hit-tests the control there, and a real tap toggles it,
  // with no tap reaching the rows beside it.
  expect(
    await page.evaluate(
      ({x, y}) =>
        document.elementFromPoint(x, y)?.closest('[role="switch"]') != null,
      control,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    const taps: string[] = [];
    (window as unknown as {taps: string[]}).taps = taps;
    for (const row of document.querySelectorAll('#storybook-root li')) {
      row.addEventListener('click', event => {
        if (
          !(event.target instanceof Element) ||
          event.target.closest('[role="switch"]') == null
        ) {
          taps.push(row.textContent?.trim() ?? '');
        }
      });
    }
  });
  await page.touchscreen.tap(control.x, control.y);
  await expect(toggle).not.toBeChecked();
  expect(
    await page.evaluate(() => (window as unknown as {taps: string[]}).taps),
  ).toEqual([]);
});

test('under a finger, a row’s band takes no tap from a control near the list: a button in its header, or a button just after it', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-list--with-end-controls');
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  const rows = await measuredRowsOf(page);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const box = async (name: string) =>
    page.getByRole('button', {name, exact: true}).evaluate(el => {
      const r = el.getBoundingClientRect();
      return {top: r.top, bottom: r.bottom, x: r.left + r.width / 2};
    });
  const edit = await box('Edit');
  const more = await box('Load more');
  // What the browser hit-tests at a point: a button's name, or a row's
  // first word.
  const hit = async (x: number, y: number) =>
    page.evaluate(
      ({x: px, y: py}) => {
        const el = document.elementFromPoint(px, py);
        const button = el?.closest('button');
        if (button != null && button.closest('li') == null) {
          return button.textContent?.trim() ?? '';
        }
        return (
          (el?.closest('#storybook-root li')?.textContent ?? '')
            .trim()
            .split(/\s+/)[0] || null
        );
      },
      {x, y},
    );
  // The button sits 4 px after the list. The last row's band stops at half
  // that gap. So the button keeps every point of its own box, and the band
  // keeps its half.
  expect(more.top - last.bottom, JSON.stringify({rows, more})).toBeCloseTo(
    4,
    0,
  );
  expect(last.layer.bottom, JSON.stringify({rows, more})).toBeLessThanOrEqual(
    (more.top - last.bottom) / 2 + 0.01,
  );
  expect(await hit(more.x, more.top + 0.5)).toBe('Load more');
  expect(await hit(last.x, last.bottom + last.layer.bottom - 0.5)).toBe(
    'Bluetooth',
  );
  // The header's button above the first row keeps its own box too.
  expect(
    first.top - first.layer.top,
    JSON.stringify({rows, edit}),
  ).toBeGreaterThanOrEqual(edit.bottom - 0.01);
  expect(await hit(edit.x, edit.bottom - 0.5)).toBe('Edit');
});

test('under a finger, a sticky header above the list keeps its taps over the first row’s band: the list isolates what its rows raise', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-list--compact');
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  const result = await page.evaluate(() => {
    const first = document.querySelector<HTMLElement>('#storybook-root li');
    const list = first?.parentElement;
    if (first == null || list == null) {
      throw new Error('no list row');
    }
    const reach =
      parseFloat(
        getComputedStyle(first).getPropertyValue('--astryx-hit-inset-top'),
      ) || 0;
    const top = first.getBoundingClientRect().top;
    // A page header before the list in the document, at z-index 1, as
    // AppShell's sticky header is. It ends halfway into the band above the
    // first row, as if the list had scrolled under it.
    const header = document.createElement('div');
    Object.assign(header.style, {
      position: 'fixed',
      insetInline: '0',
      top: '0',
      height: `${top - reach / 2}px`,
      zIndex: '1',
    });
    document.body.prepend(header);
    const x = first.getBoundingClientRect().left + 40;
    const y = top - (reach * 3) / 4;
    const hit = () => {
      const element = document.elementFromPoint(x, y);
      return element === header
        ? 'header'
        : element?.closest('li') != null
          ? 'row'
          : String(element?.tagName);
    };
    const isolated = hit();
    // The control: without the list's isolation the band, raised above the
    // rows after it, would also rise above the header and take its tap.
    list.style.isolation = 'auto';
    const unisolated = hit();
    list.style.isolation = '';
    header.remove();
    return {reach, isolated, unisolated};
  });
  expect(result.reach, JSON.stringify(result)).toBeGreaterThan(2);
  expect(result.isolated, JSON.stringify(result)).toBe('header');
  expect(result.unisolated, JSON.stringify(result)).toBe('row');
});

test('under a finger, an interactive spacious list: its one-line rows, 48px tall, are already past the touch target, so they gain nothing and overlap nothing', async ({
  page,
}) => {
  // The Interactive story at `density="spacious"`, the density of the
  // bottom-sheet menu rows.
  await openStory(page, storybook(), 'core-list--interactive', {
    density: 'spacious',
  });
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  const rows = await measuredRowsOf(page);
  const summary = JSON.stringify(rows);
  expect(rows.length, summary).toBeGreaterThan(1);
  for (const row of rows) {
    // Spacious, not the balanced 40px.
    expect(row.height, summary).toBeGreaterThanOrEqual(47.5);
    expect([row.layer.top, row.layer.bottom], summary).toEqual([0, 0]);
  }
  expectNoOverlap(rows);
});

test('under a finger, a row already as tall as the touch target gains nothing, rows that touch take nothing from each other, and a disabled row has no layer', async ({
  page,
}) => {
  test.slow();
  // Links: a one-line row, then two rows with descriptions (taller than the
  // touch target): only the short row grows.
  await openStory(page, storybook(), 'core-list--links');
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  const links = await measuredRowsOf(page);
  const summary = JSON.stringify(links);
  expect(links[0].height, summary).toBeLessThan(44);
  expect(links[0].layer.bottom, summary).toBeCloseTo(
    (links[1].top - links[0].bottom) / 2,
    1,
  );
  for (const row of links.slice(1)) {
    expect(row.height, summary).toBeGreaterThanOrEqual(44);
    expect([row.layer.top, row.layer.bottom], summary).toEqual([0, 0]);
  }
  expectNoOverlap(links);
  // Compact with dividers: the rows touch, so between them nothing grows.
  await openStory(page, storybook(), 'core-list--compact');
  const compact = await measuredRowsOf(page);
  expect(compact.length).toBeGreaterThan(1);
  for (let i = 0; i + 1 < compact.length; i++) {
    expect(compact[i].layer.bottom, JSON.stringify(compact)).toBe(0);
    expect(compact[i + 1].layer.top, JSON.stringify(compact)).toBe(0);
  }
  expectNoOverlap(compact);
  // The divider's width reaches the row's own layer, never the row's content.
  const borders = await page.locator('#storybook-root li').evaluateAll(rows =>
    rows.map(row => [
      getComputedStyle(row, '::after')
        .getPropertyValue('--_hit-border-bottom')
        .trim(),
      getComputedStyle(row.firstElementChild ?? row)
        .getPropertyValue('--_hit-border-bottom')
        .trim(),
    ]),
  );
  expect(borders.length, JSON.stringify(borders)).toBeGreaterThan(1);
  for (const [layer, content] of borders.slice(0, -1)) {
    expect(layer, JSON.stringify(borders)).not.toMatch(/^(0px)?$/);
    expect(content, JSON.stringify(borders)).toBe('');
  }
  expect(borders.at(-1), JSON.stringify(borders)).toEqual(['0px', '']);
  // A disabled row offers no target: no layer, nothing measured.
  await openStory(page, storybook(), 'core-list--disabled-items');
  await measuredRowsOf(page);
  const disabled = await page
    .locator('#storybook-root li[aria-disabled="true"]')
    .evaluateAll(rows =>
      rows.map(row => [
        getComputedStyle(row, '::after').content,
        (row as HTMLElement).style.getPropertyValue('--astryx-hit-inset-top'),
      ]),
    );
  expect(disabled.length).toBeGreaterThan(0);
  for (const [content, written] of disabled) {
    expect(content).toBe('none');
    expect(written).toBe('');
  }
});

test('under a finger, a page’s `--size-touch-target` leaves the 44px target, which no token admits yet, and row padding reaches the layer', async ({
  page,
}) => {
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  // The rows grow toward 44 px, whatever a page sets.
  await openStory(page, storybook(), 'core-list--interactive');
  const plain = (await measuredRowsOf(page)).map(row => row.layer);
  expect(plain.some(layer => layer.top > 0 || layer.bottom > 0)).toBe(true);
  await themeTouchTarget(page, '60px');
  await openStory(page, storybook(), 'core-list--interactive');
  expect((await measuredRowsOf(page)).map(row => row.layer)).toEqual(plain);
  await themeTouchTarget(page, '30px');
  await openStory(page, storybook(), 'core-list--interactive');
  expect((await measuredRowsOf(page)).map(row => row.layer)).toEqual(plain);
  // Row padding that makes the row as tall as the target.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent =
        '#storybook-root li { padding-block: 12px !important; }';
      document.head.append(style);
    });
  });
  await openStory(page, storybook(), 'core-list--interactive');
  const padded = await measuredRowsOf(page);
  expect(padded[0].height).toBeGreaterThanOrEqual(44);
  for (const row of padded) {
    expect([row.layer.top, row.layer.bottom]).toEqual([0, 0]);
  }
});

test('under a finger, a tap in a link row’s growth follows its link', async ({
  page,
}) => {
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  await openStory(page, storybook(), 'core-list--links');
  const rows = await measuredRowsOf(page);
  // The growth above the first row, toward 44px, outside the row's anchor.
  const grow = rows[0].layer.top;
  expect(grow, JSON.stringify(rows)).toBeGreaterThanOrEqual(1.5);
  const inside = rows[0].top - grow / 2;
  expect(await rowAt(page, rows[0].x, inside)).toBe(rows[0].text);
  // The row is the Links story's "Documentation" (`href="/docs"`).
  const followed = page.waitForURL(/\/docs$/, {timeout: 5000});
  await page.touchscreen.tap(rows[0].x, inside);
  await followed;
});

test('under a finger, a tap in a link row’s own padding, outside its anchor, follows its link', async ({
  page,
}) => {
  test.skip(!(await isTouch(page)), 'the hit area applies under a finger only');
  await openStory(page, storybook(), 'core-list--links');
  const row = page.locator('#storybook-root li').first();
  const box = await row.boundingBox();
  if (box == null) {
    throw new Error('no row');
  }
  // The row's leading padding: inside its box, outside its anchor. (Chromium
  // also moves a tap this close onto the anchor by its touch adjustment;
  // WebKit does not, and its click from a finger says `mouse`.)
  const x = box.x + 2;
  const y = box.y + box.height / 2;
  expect(
    await page.evaluate(
      ([px, py]) => document.elementFromPoint(px, py)?.closest('a') == null,
      [x, y],
    ),
  ).toBe(true);
  // The row is the Links story's "Documentation" (`href="/docs"`).
  const followed = page.waitForURL(/\/docs$/, {timeout: 5000});
  await page.touchscreen.tap(x, y);
  await followed;
});

test('a mouse click in a link row’s padding does nothing, as before', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 900, height: 700},
  });
  const page = await context.newPage();
  try {
    await openStory(page, storybook(), 'core-list--links');
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const row = page.locator('#storybook-root li').first();
    const box = await row.boundingBox();
    if (box == null) {
      throw new Error('no row');
    }
    const url = page.url();
    // The row's leading padding: inside its box, outside its anchor.
    await page.mouse.click(box.x + 2, box.y + box.height / 2);
    await page.waitForTimeout(500);
    expect(page.url()).toBe(url);
  } finally {
    await context.close();
  }
});

for (const story of [
  'core-list--interactive',
  'core-list--links',
  'core-list--compact',
  'core-list--with-media',
]) {
  test(`${story}: the layer adds no layout and paints nothing, and a mouse gets none`, async ({
    browser,
    page,
  }, testInfo) => {
    await openStory(page, storybook(), story);
    test.skip(
      !(await isTouch(page)),
      'the hit area applies under a finger only',
    );
    const touch = await measuredRowsOf(page);
    // The same page with every row's layer taken away: the same boxes.
    await page.addStyleTag({
      content: '#storybook-root li::after { display: none !important; }',
    });
    const bare = await rowsOf(page);
    const mouse = await withMouse(browser, testInfo, async mousePage => {
      await openStory(mousePage, storybook(), story);
      expect(await isTouch(mousePage)).toBe(false);
      // A frame for a pass that must not come.
      await mousePage.evaluate(async () => {
        await new Promise(resolve => requestAnimationFrame(resolve));
      });
      return rowsOf(mousePage);
    });
    const summary = JSON.stringify({touch, bare, mouse});
    expect(touch.length, summary).toBeGreaterThan(0);
    expect(bare.length, summary).toBe(touch.length);
    expect(mouse.length, summary).toBe(touch.length);
    for (const [i, row] of touch.entries()) {
      expect(row.top, summary).toBeCloseTo(bare[i].top, 2);
      expect(row.height, summary).toBeCloseTo(bare[i].height, 2);
      if (row.layer.content !== 'none') {
        expect(row.layer.paint, summary).toMatch(
          /^rgba\(0, 0, 0, 0\) \| none \| none \| 0px \| none$/,
        );
      }
      // A mouse: no pseudo-element, no stacking context, nothing measured.
      expect(mouse[i].layer.content, summary).toBe('none');
      expect(mouse[i].isolation, summary).toBe('auto');
      expect(mouse[i].written, summary).toBe('');
    }
  });
}
