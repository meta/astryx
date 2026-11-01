// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScheduleMonthOverflow.a11y.chromium.spec.ts
 * @input The built Lab/Schedule month-overflow story in real Chromium
 * @output Receipted evidence that the month is a table with weekday column
 *   headers, week row headers and date-named cells; that a week row keeps
 *   every chip inside it; that each busy day paints or counts every one of
 *   its events; and that a day's "+N more" is a named Tab stop opening one
 *   view-owned popover that lists the whole day: by keyboard and pointer,
 *   switching days in one gesture, closing on Escape, light dismiss and
 *   paging, with a full focus ring; in LTR and RTL, light and dark, wide and
 *   narrow
 * @position Browser binding for `component:Schedule` FR15–FR17 and AR7. jsdom
 *   has no layout or Tab order, cannot show a native popover, return focus
 *   through it, or paint a focus ring.
 */

import {expect, test, type Page} from '@playwright/test';
import pixelmatch from 'pixelmatch';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {
  finishEvidence,
  openStory,
  record,
  startEvidence,
  WIDE,
  type Evidence,
} from './timeGridProbe';

const STORY = 'lab-schedule--month-overflow';
// Narrower than the month grid's 784px minimum plus the story's padding, so
// the grid scrolls on the inline axis.
const NARROW_MONTH = {width: 800, height: 900};
const WEDNESDAY = 'Wednesday, May 13, 2026';
const FRIDAY = 'Friday, May 15, 2026';
// The story's fixture: how many events each busy day holds.
const EVENTS_ON = {[WEDNESDAY]: 5, [FRIDAY]: 4} as const;

let evidence: Evidence;
test.beforeAll(async () => {
  evidence = await startEvidence();
});
test.afterAll(async () => {
  await finishEvidence(evidence, 'month-overflow');
});

interface MonthReading {
  /** Chips that paint below the bottom of the week row they start in. */
  readonly chipsOutsideRow: ReadonlyArray<{
    readonly text: string;
    readonly overflowPx: number;
  }>;
  readonly chipCount: number;
  /** Whether the "+" of a "+N more" paints before its "more", as read. */
  readonly countReadsInOrder: boolean | null;
  /** Per busy day: chips painted across its cell and its "+N more" count. */
  readonly days: Record<
    string,
    {
      readonly paintedChips: number;
      readonly counted: number;
      readonly moreInsideCell: boolean;
    }
  >;
  readonly surfaceIsolation: string;
}

/**
 * Reads the month by what it is: cells are the table's date-named cells,
 * chips are the marked chips (or a build's hidden overlay children), and a
 * day's "+N more" is the named button inside its cell.
 */
function readMonth(page: Page): Promise<MonthReading> {
  return page.evaluate(
    ([dayNames]) => {
      // The label's text can span several nodes ("+", "3", " more"), so
      // each glyph run is found on its own.
      const rectOf = (root: Node, needle: string): DOMRect | null => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (
          let node = walker.nextNode();
          node != null;
          node = walker.nextNode()
        ) {
          const at = (node.textContent ?? '').indexOf(needle);
          if (at >= 0) {
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + needle.length);
            return range.getBoundingClientRect();
          }
        }
        return null;
      };
      const grid = document.querySelector<HTMLElement>(
        '.astryx-schedule [role="table"], .astryx-schedule [role="grid"]',
      );
      if (grid == null) {
        throw new Error('no month table');
      }
      const cells = [
        ...grid.querySelectorAll<HTMLElement>(
          '[role="cell"], [role="gridcell"]',
        ),
      ].map(cell => ({
        label: cell.getAttribute('aria-label') ?? '',
        rect: cell.getBoundingClientRect(),
        cell,
      }));
      // Chips carry a marker; a build without it paints them as the children
      // of one hidden overlay.
      const marked = [
        ...grid.querySelectorAll<HTMLElement>('[data-schedule-month-chip]'),
      ];
      const overlay = [
        ...grid.querySelectorAll<HTMLElement>('[aria-hidden="true"]'),
      ].find(
        element =>
          getComputedStyle(element).position === 'absolute' &&
          element.children.length > 0,
      );
      const chips =
        marked.length > 0
          ? marked
          : overlay == null
            ? []
            : [...overlay.children];
      // The month surface is the cells' nearest isolating ancestor.
      let surface: HTMLElement | null = cells[0]?.cell.parentElement ?? null;
      while (
        surface != null &&
        surface !== grid &&
        getComputedStyle(surface).isolation !== 'isolate'
      ) {
        surface = surface.parentElement;
      }
      const chipsOutsideRow = chips.flatMap(chip => {
        const rect = chip.getBoundingClientRect();
        const start = cells.find(
          ({rect: cell}) =>
            rect.left + 2 >= cell.left - 1 &&
            rect.left + 2 <= cell.right + 1 &&
            rect.top >= cell.top - 1 &&
            rect.top <= cell.bottom,
        );
        const startEnd = cells.find(
          ({rect: cell}) =>
            rect.right - 2 >= cell.left - 1 &&
            rect.right - 2 <= cell.right + 1 &&
            rect.top >= cell.top - 1 &&
            rect.top <= cell.bottom,
        );
        const row = start ?? startEnd;
        if (row == null) {
          return [{text: chip.textContent ?? '', overflowPx: Infinity}];
        }
        const overflowPx = rect.bottom - row.rect.bottom;
        return overflowPx > 1
          ? [{text: chip.textContent ?? '', overflowPx}]
          : [];
      });
      const days: Record<
        string,
        {paintedChips: number; counted: number; moreInsideCell: boolean}
      > = {};
      for (const name of dayNames) {
        const day = cells.find(cell => cell.label === name);
        if (day == null) {
          throw new Error(`no cell named ${name}`);
        }
        const paintedChips = chips.filter(chip => {
          const rect = chip.getBoundingClientRect();
          const inlineOverlap =
            Math.min(rect.right, day.rect.right) -
            Math.max(rect.left, day.rect.left);
          return (
            inlineOverlap > 2 &&
            rect.top >= day.rect.top - 1 &&
            rect.top < day.rect.bottom
          );
        }).length;
        const more = [...day.cell.querySelectorAll<HTMLElement>('button')].find(
          button =>
            /more events?,/.test(button.getAttribute('aria-label') ?? ''),
        );
        const moreRect = more?.getBoundingClientRect();
        days[name] = {
          paintedChips,
          counted:
            more == null
              ? 0
              : Number.parseInt(
                  (more.getAttribute('aria-label') ?? '').split(' ')[0],
                  10,
                ),
          moreInsideCell:
            moreRect != null &&
            moreRect.left >= day.rect.left - 1 &&
            moreRect.right <= day.rect.right + 1 &&
            moreRect.top >= day.rect.top - 1 &&
            moreRect.bottom <= day.rect.bottom + 1,
        };
      }
      // The visual order of the count's "+" and its "more" in the label.
      const wednesdayMore = [...grid.querySelectorAll('button')].find(button =>
        /^3 more events,/.test(button.getAttribute('aria-label') ?? ''),
      );
      const plus = wednesdayMore == null ? null : rectOf(wednesdayMore, '+');
      const more = wednesdayMore == null ? null : rectOf(wednesdayMore, 'more');
      const countReadsInOrder =
        plus == null || more == null ? null : plus.right <= more.left + 1;
      return {
        chipsOutsideRow,
        chipCount: chips.length,
        countReadsInOrder,
        days,
        surfaceIsolation:
          surface == null || surface === grid
            ? 'auto'
            : getComputedStyle(surface).isolation,
      };
    },
    [[WEDNESDAY, FRIDAY]] as const,
  );
}

/** The open dialog as assistive technology sees it. */
function readDialog(page: Page) {
  return page.evaluate(() => {
    const open = [
      ...document.querySelectorAll<HTMLElement>('[role="dialog"]'),
    ].filter(dialog =>
      dialog.closest<HTMLElement>('[popover]')?.matches(':popover-open'),
    );
    const dialog = open[0];
    return {
      openCount: open.length,
      label: dialog?.getAttribute('aria-label') ?? null,
      layerID: dialog?.closest<HTMLElement>('[popover]')?.id ?? null,
      items: dialog == null ? 0 : dialog.querySelectorAll('li').length,
      focusInside:
        dialog != null && document.activeElement != null
          ? dialog.contains(document.activeElement)
          : false,
    };
  });
}

function readMore(page: Page, day: string) {
  return page.evaluate(name => {
    const button = [...document.querySelectorAll('button')].find(candidate =>
      candidate.getAttribute('aria-label')?.endsWith(`, ${name}`),
    );
    if (button == null) {
      throw new Error(`no "+N more" for ${name}`);
    }
    return {
      label: button.getAttribute('aria-label'),
      text: button.textContent,
      expanded: button.getAttribute('aria-expanded'),
      haspopup: button.getAttribute('aria-haspopup'),
      controls: button.getAttribute('aria-controls'),
      isActive: document.activeElement === button,
    };
  }, day);
}

function expectNothingLost(reading: MonthReading) {
  expect(reading.chipsOutsideRow).toEqual([]);
  expect(reading.countReadsInOrder, '"+N more" reads in order').toBe(true);
  expect(reading.surfaceIsolation).toBe('isolate');
  for (const [day, total] of Object.entries(EVENTS_ON)) {
    const {paintedChips, counted, moreInsideCell} = reading.days[day];
    expect(paintedChips + counted, `${day}: painted + counted`).toBe(total);
    expect(counted, `${day}: counted`).toBeGreaterThan(0);
    expect(moreInsideCell, `${day}: "+N more" inside its cell`).toBe(true);
  }
}

test('the month is a table: weekday and week headers, date-named cells, and "+N more" in the Tab order after the table', async ({
  page,
}) => {
  await openStory(evidence, page, STORY, WIDE);
  const table = page.getByRole('table', {name: 'May 2026'});
  await expect(table).toBeVisible();
  const tree = await table.ariaSnapshot();
  const reading = await page.evaluate(() => {
    const table = document.querySelector('.astryx-schedule [role="table"]');
    const rows = [...(table?.querySelectorAll('[role="row"]') ?? [])];
    return {
      gridRoles: document.querySelectorAll(
        '.astryx-schedule [role="grid"], .astryx-schedule [role="gridcell"]',
      ).length,
      readonly: table?.getAttribute('aria-readonly') ?? null,
      columnHeaders: [
        ...(table?.querySelectorAll('[role="columnheader"]') ?? []),
      ].map(header => header.getAttribute('aria-label') ?? header.textContent),
      rowHeaders: rows
        .slice(1)
        .map(
          row => row.querySelector('[role="rowheader"]')?.textContent ?? null,
        ),
      cellsPerRow: rows
        .slice(1)
        .map(row => row.querySelectorAll('[role="cell"]').length),
      wednesdayCell:
        table
          ?.querySelector('[role="cell"][aria-current="date"]')
          ?.getAttribute('aria-label') ?? null,
      // One real header-to-cell association: the column header at the
      // Sunday cell's position in its row, by DOM position and by index.
      sunday: (() => {
        const cell = table?.querySelector(
          '[role="cell"][aria-label="Sunday, May 10, 2026"]',
        );
        const row = cell?.closest('[role="row"]');
        const position =
          row == null || cell == null
            ? -1
            : [...row.children].indexOf(cell as Element);
        const headers = [
          ...(rows[0]?.querySelectorAll('[role="columnheader"]') ?? []),
        ];
        const header = headers[position];
        return {
          header: header?.getAttribute('aria-label') ?? header?.textContent,
          cellIndex: cell?.getAttribute('aria-colindex') ?? null,
          headerIndex: header?.getAttribute('aria-colindex') ?? null,
        };
      })(),
      moreButtons: [...(table?.querySelectorAll('button') ?? [])].map(
        button => ({
          name: button.getAttribute('aria-label'),
          cell: button.closest('[role="cell"]')?.getAttribute('aria-label'),
          tabIndex: button.tabIndex,
        }),
      ),
    };
  });
  const stops: string[] = [];
  for (let press = 0; press < 7; press += 1) {
    await page.keyboard.press('Tab');
    stops.push(
      await page.evaluate(
        () =>
          `${document.activeElement?.getAttribute('role') ?? document.activeElement?.tagName.toLowerCase()}:${document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? ''}`,
      ),
    );
  }
  await record(evidence, page, 'month-table-structure', STORY, 'ltr', {
    reading,
    stops,
    tree,
  });
  expect(reading.gridRoles).toBe(0);
  expect(reading.readonly).toBeNull();
  expect(reading.columnHeaders).toEqual([
    'Week',
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ]);
  expect(reading.rowHeaders).toHaveLength(6);
  for (const header of reading.rowHeaders) {
    expect(header).toMatch(/\d+\s*–\s*.*\d{4}$/);
  }
  expect(reading.cellsPerRow).toEqual([7, 7, 7, 7, 7, 7]);
  expect(reading.wednesdayCell).toBe(WEDNESDAY);
  expect(reading.sunday).toEqual({
    header: 'Sunday',
    cellIndex: '2',
    headerIndex: '2',
  });
  expect(reading.moreButtons).toEqual([
    {name: `3 more events, ${WEDNESDAY}`, cell: WEDNESDAY, tabIndex: 0},
    {name: `2 more events, ${FRIDAY}`, cell: FRIDAY, tabIndex: 0},
  ]);
  // Tab: the pager, the table itself (it scrolls), then each "+N more" in
  // reading order.
  const tableStop = stops.indexOf('table:May 2026');
  expect(tableStop, stops.join(' → ')).toBeGreaterThan(0);
  expect(stops.slice(tableStop + 1, tableStop + 3)).toEqual([
    `button:3 more events, ${WEDNESDAY}`,
    `button:2 more events, ${FRIDAY}`,
  ]);
});

test('every chip stays in its week row and each busy day paints or counts all of its events', async ({
  page,
}) => {
  for (const [name, viewport] of [
    ['wide', WIDE],
    ['narrow', NARROW_MONTH],
  ] as const) {
    await openStory(evidence, page, STORY, viewport);
    const reading = await readMonth(page);
    await record(evidence, page, `month-rows-${name}`, STORY, 'ltr', reading);
    expectNothingLost(reading);
    expect(reading.days[WEDNESDAY]).toMatchObject({
      paintedChips: 2,
      counted: 3,
    });
    expect(reading.days[FRIDAY]).toMatchObject({paintedChips: 2, counted: 2});
  }
});

test('the same holds right-to-left and in dark mode', async ({page}) => {
  for (const [name, globals] of [
    ['rtl', 'direction:rtl'],
    ['dark', 'colorMode:dark'],
    ['rtl-dark', 'direction:rtl;colorMode:dark'],
  ] as const) {
    await openStory(evidence, page, STORY, WIDE, globals);
    const reading = await readMonth(page);
    await record(
      evidence,
      page,
      `month-rows-${name}`,
      STORY,
      name.startsWith('rtl') ? 'rtl' : 'ltr',
      reading,
    );
    expectNothingLost(reading);
  }
});

test('Tab reaches "+N more", Enter opens the day popover, and Escape returns focus to it', async ({
  page,
}) => {
  await openStory(evidence, page, STORY, WIDE);
  const stops: string[] = [];
  let reached = false;
  for (let press = 0; press < 10 && !reached; press += 1) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(
      () =>
        document.activeElement?.getAttribute('aria-label') ??
        document.activeElement?.tagName.toLowerCase() ??
        null,
    );
    stops.push(label ?? 'other');
    reached = /more events?,/.test(label ?? '');
  }
  expect(reached, `Tab reached "+N more": ${stops.join(' → ')}`).toBe(true);
  const before = await readMore(page, WEDNESDAY);
  expect(before).toMatchObject({
    label: `3 more events, ${WEDNESDAY}`,
    text: '+3 more',
    expanded: 'false',
    haspopup: 'dialog',
    isActive: true,
  });

  await page.keyboard.press('Enter');
  await expect.poll(async () => (await readDialog(page)).openCount).toBe(1);
  const dialog = await readDialog(page);
  const opened = await readMore(page, WEDNESDAY);
  await record(evidence, page, 'month-popover-keyboard', STORY, 'ltr', {
    stops,
    button: opened,
    dialog,
  });
  expect(opened.expanded).toBe('true');
  expect(dialog).toMatchObject({
    label: WEDNESDAY,
    layerID: before.controls,
    items: EVENTS_ON[WEDNESDAY],
    focusInside: true,
  });

  await page.keyboard.press('Escape');
  await expect.poll(async () => (await readDialog(page)).openCount).toBe(0);
  await expect
    .poll(async () => (await readMore(page, WEDNESDAY)).expanded)
    .toBe('false');
  expect((await readMore(page, WEDNESDAY)).isActive).toBe(true);
});

test('click switches days in one gesture; light dismiss and paging close the popover', async ({
  page,
}) => {
  await openStory(evidence, page, STORY, WIDE);
  const wednesday = page.getByRole('button', {
    name: `3 more events, ${WEDNESDAY}`,
  });
  const friday = page.getByRole('button', {name: `2 more events, ${FRIDAY}`});

  await wednesday.click();
  await expect.poll(async () => (await readDialog(page)).label).toBe(WEDNESDAY);
  await friday.click();
  await expect.poll(async () => (await readDialog(page)).label).toBe(FRIDAY);
  const afterSwitch = {
    wednesday: await readMore(page, WEDNESDAY),
    friday: await readMore(page, FRIDAY),
    dialog: await readDialog(page),
  };
  await record(
    evidence,
    page,
    'month-popover-switch',
    STORY,
    'ltr',
    afterSwitch,
  );
  expect(afterSwitch.wednesday.expanded).toBe('false');
  expect(afterSwitch.friday.expanded).toBe('true');
  expect(afterSwitch.dialog).toMatchObject({openCount: 1, items: 4});

  // Light dismiss: a click on the header, outside the dialog.
  const title = await page.locator('.astryx-schedule h2').first().boundingBox();
  await page.mouse.click(
    (title?.x ?? 0) + (title?.width ?? 0) / 2,
    (title?.y ?? 0) + (title?.height ?? 0) / 2,
  );
  await expect.poll(async () => (await readDialog(page)).openCount).toBe(0);
  await expect
    .poll(async () => (await readMore(page, FRIDAY)).expanded)
    .toBe('false');

  // Paging away closes an open day and leaves no dialog or error behind.
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await wednesday.click();
  await expect.poll(async () => (await readDialog(page)).openCount).toBe(1);
  await page.getByRole('button', {name: 'Next month'}).click();
  await expect.poll(async () => (await readDialog(page)).openCount).toBe(0);
  const afterPaging = await page.evaluate(() => ({
    moreButtons: [...document.querySelectorAll('button')].filter(button =>
      /more events?,/.test(button.getAttribute('aria-label') ?? ''),
    ).length,
    expanded: document.querySelectorAll('[aria-expanded="true"]').length,
  }));
  await record(evidence, page, 'month-popover-paged', STORY, 'ltr', {
    afterPaging,
    errors,
  });
  expect(afterPaging).toEqual({moreButtons: 0, expanded: 0});
  expect(errors).toEqual([]);
});

test('a focused "+N more" paints its whole focus ring above the chips', async ({
  page,
}) => {
  await openStory(evidence, page, STORY, WIDE);
  const button = page.getByRole('button', {
    name: `3 more events, ${WEDNESDAY}`,
  });
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  const clip = {
    x: (box?.x ?? 0) - 8,
    y: (box?.y ?? 0) - 8,
    width: (box?.width ?? 0) + 16,
    height: (box?.height ?? 0) + 16,
  };
  const rest = await page.screenshot({clip});
  await button.focus();
  // Focus from script does not match :focus-visible; a key press does.
  await page.keyboard.press('Shift');
  const focused = await page.screenshot({clip});
  const decode = (png: Buffer) =>
    PNG.sync.read(png) as {width: number; height: number; data: Buffer};
  const before = decode(rest);
  const after = decode(focused);
  const ringPixels = pixelmatch(
    before.data,
    after.data,
    undefined,
    before.width,
    before.height,
    {threshold: 0.1},
  );
  const style = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const computed = getComputedStyle(element);
    return {
      outlineStyle: computed.outlineStyle,
      outlineWidth: Number.parseFloat(computed.outlineWidth),
      zIndex: computed.zIndex,
    };
  });
  await record(evidence, page, 'month-more-focus-ring', STORY, 'ltr', {
    ringPixels,
    style,
  });
  expect(style.outlineStyle).not.toBe('none');
  expect(style.outlineWidth).toBeGreaterThan(0);
  expect(style.zIndex).toBe('2');
  expect(ringPixels).toBeGreaterThan(
    ((box?.width ?? 0) + (box?.height ?? 0)) * 2,
  );
});

test('when a refresh takes away an open day\'s "+N more", focus lands on that day\'s cell with the ring', async ({
  page,
}) => {
  await openStory(evidence, page, STORY, WIDE);
  const stops: string[] = [];
  let reached = false;
  for (let press = 0; press < 10 && !reached; press += 1) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') ?? null,
    );
    stops.push(label ?? 'other');
    reached = label === `2 more events, ${FRIDAY}`;
  }
  expect(reached, `Tab reached Friday's "+N more": ${stops.join(' → ')}`).toBe(
    true,
  );
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await readDialog(page)).label).toBe(FRIDAY);
  expect((await readDialog(page)).focusInside).toBe(true);

  // Friday drops to three levels: its "+N more" is no longer rendered.
  await page.evaluate(() => {
    (
      window as unknown as {
        scheduleMonthOverflowStory: {removeEvent: (id: string) => void};
      }
    ).scheduleMonthOverflowStory.removeEvent('focus');
  });
  await expect.poll(async () => (await readDialog(page)).openCount).toBe(0);
  const focus = await page.evaluate(day => {
    const active = document.activeElement as HTMLElement | null;
    const computed = active == null ? null : getComputedStyle(active);
    return {
      role: active?.getAttribute('role') ?? null,
      label: active?.getAttribute('aria-label') ?? null,
      tabIndex: active?.tabIndex ?? null,
      outlineStyle: computed?.outlineStyle ?? null,
      outlineWidth: Number.parseFloat(computed?.outlineWidth ?? '0'),
      fridayMore: [...document.querySelectorAll('button')].some(button =>
        button.getAttribute('aria-label')?.endsWith(`, ${day}`),
      ),
    };
  }, FRIDAY);
  const cell = page.getByRole('cell', {name: FRIDAY});
  const box = await cell.boundingBox();
  expect(box).not.toBeNull();
  const clip = {
    x: box?.x ?? 0,
    y: box?.y ?? 0,
    width: box?.width ?? 0,
    height: box?.height ?? 0,
  };
  const ringed = await page.screenshot({clip});
  // The same cell without focus, for the ring's pixels.
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  const plain = await page.screenshot({clip});
  const decode = (png: Buffer) =>
    PNG.sync.read(png) as {width: number; height: number; data: Buffer};
  const ringPixels = pixelmatch(
    decode(plain).data,
    decode(ringed).data,
    undefined,
    decode(plain).width,
    decode(plain).height,
    {threshold: 0.1},
  );
  await record(evidence, page, 'month-refresh-focus', STORY, 'ltr', {
    stops,
    focus,
    ringPixels,
  });
  expect(focus).toMatchObject({
    role: 'cell',
    label: FRIDAY,
    tabIndex: -1,
    fridayMore: false,
  });
  expect(focus.outlineStyle).not.toBe('none');
  expect(focus.outlineWidth).toBeGreaterThan(0);
  expect(ringPixels).toBeGreaterThan(
    ((box?.width ?? 0) + (box?.height ?? 0)) * 2,
  );
});
