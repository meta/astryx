// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScheduleMonthEventPopover.a11y.chromium.spec.ts
 * @input The built Lab/Schedule month-event-popover story in real Chromium
 * @output Receipted evidence that, with renderPopover, month chips are named
 *   buttons in the cells where they start and inside their week rows; a chip
 *   without content is static text; one view-owned popover opens on click and
 *   Enter, switches between chips in one gesture, takes an event handed over
 *   from a busy day's list, returns focus to the chip or the "+N more", and
 *   closes when its chip leaves, with focus on the chip's start cell
 * @position Browser binding for `component:Schedule` FR19–FR20 and AR8. jsdom
 *   cannot show a native popover, return focus through it, or lay out chips.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  finishEvidence,
  openStory,
  record,
  startEvidence,
  WIDE,
  type Evidence,
} from './timeGridProbe';

const STORY = 'lab-schedule--month-event-popover';
const WEDNESDAY = 'Wednesday, May 13, 2026';
const FRIDAY = 'Friday, May 15, 2026';

let evidence: Evidence;
test.beforeAll(async () => {
  evidence = await startEvidence();
});
test.afterAll(async () => {
  await finishEvidence(evidence, 'month-event-popover');
});

function chip(page: Page, title: string) {
  return page.getByRole('button', {name: new RegExp(`^${title},`)});
}

/** The one open dialog: its name, its content's marker, and whether it holds focus. */
function readDialog(page: Page) {
  return page.evaluate(() => {
    const open = [
      ...document.querySelectorAll<HTMLElement>('[role="dialog"]'),
    ].filter(dialog => dialog.checkVisibility());
    const dialog = open[0];
    return {
      openCount: open.length,
      label: dialog?.getAttribute('aria-label') ?? null,
      details:
        dialog
          ?.querySelector('[data-event-details]')
          ?.getAttribute('data-event-details') ?? null,
      focusInside:
        dialog != null && dialog.contains(document.activeElement ?? null),
    };
  });
}

/** Where focus is: its role, name, and the ring it paints. */
function readFocus(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const style = active == null ? null : getComputedStyle(active);
    return {
      tag: active?.tagName ?? null,
      role: active?.getAttribute('role') ?? null,
      label: active?.getAttribute('aria-label') ?? null,
      tabIndex: active?.tabIndex ?? null,
      outlineStyle: style?.outlineStyle ?? null,
      zIndex: style?.zIndex ?? null,
    };
  });
}

/** Each chip's start cell, whether it is a button, and whether it stays in its row. */
function readChips(page: Page) {
  return page.evaluate(() => {
    const table = document.querySelector('.astryx-schedule [role="table"]');
    const chips = [
      ...(table?.querySelectorAll<HTMLElement>('[data-schedule-month-chip]') ??
        []),
    ];
    return chips.map(element => {
      const cell = element.closest('[role="cell"]');
      const rect = element.getBoundingClientRect();
      const cellRect = cell?.getBoundingClientRect();
      return {
        name:
          element.getAttribute('aria-label') ??
          element.textContent?.trim() ??
          '',
        isButton: element.tagName === 'BUTTON',
        cell: cell?.getAttribute('aria-label') ?? null,
        insideRow:
          cellRect != null &&
          rect.top >= cellRect.top - 1 &&
          rect.bottom <= cellRect.bottom + 1,
        hiddenListItems: cell?.querySelectorAll('li').length ?? 0,
      };
    });
  });
}

for (const [variant, direction, globals] of [
  ['ltr', 'ltr', undefined],
  ['rtl-dark', 'rtl', 'direction:rtl;colorMode:dark'],
] as const) {
  test(`chips are named buttons in the cells where they start, inside their rows (${variant})`, async ({
    page,
  }) => {
    await openStory(evidence, page, STORY, WIDE, globals);
    const chips = await readChips(page);
    await record(
      evidence,
      page,
      `month-event-buttons-${variant}`,
      STORY,
      direction,
      {chips},
    );
    expect(chips.length).toBeGreaterThan(0);
    for (const reading of chips) {
      expect(reading.insideRow, `${reading.name} stays in its row`).toBe(true);
      expect(reading.hiddenListItems, `${reading.cell} repeats no list`).toBe(
        0,
      );
    }
    const conference = chips.find(reading =>
      reading.name.startsWith('Design conference,'),
    );
    expect(conference?.isButton).toBe(true);
    expect(conference?.cell).toBe('Sunday, May 10, 2026');
    expect(conference?.name).toMatch(
      /^Design conference, all day, Design, May 10\s*–\s*13, 2026$/u,
    );
    const standup = chips.find(reading => reading.name.startsWith('Standup,'));
    expect(standup?.isButton).toBe(true);
    expect(standup?.cell).toBe(WEDNESDAY);
    // Every chip paints, and takes the pointer, across all of its days: no
    // later cell covers the part of a span that crosses it.
    const covered = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-schedule-month-chip]')]
        .filter(chip => chip.tagName === 'BUTTON')
        .flatMap(chip => {
          const rect = chip.getBoundingClientRect();
          return [0.1, 0.5, 0.9]
            .map(share => {
              const top = document.elementFromPoint(
                rect.left + rect.width * share,
                rect.top + rect.height / 2,
              );
              return top != null && chip.contains(top)
                ? null
                : `${chip.getAttribute('aria-label')} at ${share}`;
            })
            .filter(miss => miss != null);
        }),
    );
    expect(covered, 'chips covered by a later cell').toEqual([]);
    // A day the conference covers after Sunday names it as static text.
    const tuesday = page.getByRole('cell', {name: 'Tuesday, May 12, 2026'});
    await expect(tuesday).toContainText(
      /Design conference, all day, Design, since Sunday, May 10, 2026/u,
    );
    await expect(
      tuesday.getByRole('button', {name: /^Design conference,/}),
    ).toHaveCount(0);
    // The holiday has no content: static text with its name, never a button.
    const holiday = chips.find(reading =>
      reading.name.startsWith('Company holiday'),
    );
    expect(holiday?.isButton).toBe(false);
    expect(holiday?.name).toContain(
      'Company holiday, all day, Holiday, Monday, May 25, 2026',
    );
  });
}

test('click and Enter open one popover named by the event, switch in one gesture, and Escape returns focus to the chip', async ({
  page,
}) => {
  await openStory(evidence, page, STORY, WIDE);
  const standup = chip(page, 'Standup');
  await standup.click();
  await expect
    .poll(async () => (await readDialog(page)).details)
    .toBe('standup');
  const opened = await readDialog(page);
  expect(opened).toMatchObject({openCount: 1, label: 'Standup'});
  await expect(standup).toHaveAttribute('aria-expanded', 'true');

  // Another chip while one is open: one gesture, one dialog.
  await chip(page, 'Planning').click();
  await expect
    .poll(async () => (await readDialog(page)).details)
    .toBe('planning');
  await expect(standup).toHaveAttribute('aria-expanded', 'false');
  expect((await readDialog(page)).openCount).toBe(1);

  await page.keyboard.press('Escape');
  await expect.poll(async () => (await readDialog(page)).openCount).toBe(0);
  const returned = await readFocus(page);

  // Keyboard: Enter on a focused chip opens it.
  await chip(page, 'Design critique').focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await readDialog(page)).details)
    .toBe('critique');
  await record(evidence, page, 'month-event-open', STORY, 'ltr', {
    opened,
    returned,
    keyboard: await readDialog(page),
  });
  expect(returned.label).toMatch(/^Planning,/);
});

test('a row in a busy day\u2019s list hands its event to the same popover, and Escape returns focus to "+N more"', async ({
  page,
}) => {
  await openStory(evidence, page, STORY, WIDE);
  const more = page.getByRole('button', {name: `3 more events, ${WEDNESDAY}`});
  await more.click();
  await expect.poll(async () => (await readDialog(page)).label).toBe(WEDNESDAY);
  await page
    .getByRole('dialog')
    .getByRole('button', {name: /^Incident review,/})
    .click();
  await expect
    .poll(async () => (await readDialog(page)).details)
    .toBe('incident-review');
  const handedOver = await readDialog(page);
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await readDialog(page)).openCount).toBe(0);
  const returned = await readFocus(page);
  await record(evidence, page, 'month-event-handoff', STORY, 'ltr', {
    handedOver,
    returned,
  });
  expect(handedOver).toMatchObject({openCount: 1, label: 'Incident review'});
  expect(returned.label).toBe(`3 more events, ${WEDNESDAY}`);
});

test('a focused chip paints its ring above its neighbours, and a chip that leaves while open sends focus to its start cell', async ({
  page,
}) => {
  await openStory(evidence, page, STORY, WIDE);
  // Keyboard focus shows the shared ring and lifts the chip locally.
  await chip(page, 'Planning').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const ring = await readFocus(page);

  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await readDialog(page)).details)
    .toBe('planning');
  await page.evaluate(() => {
    (
      window as unknown as {
        scheduleMonthOverflowStory: {removeEvent: (id: string) => void};
      }
    ).scheduleMonthOverflowStory.removeEvent('planning');
  });
  await expect.poll(async () => (await readDialog(page)).openCount).toBe(0);
  const focus = await readFocus(page);
  await record(evidence, page, 'month-event-removed', STORY, 'ltr', {
    ring,
    focus,
  });
  expect(ring).toMatchObject({outlineStyle: 'solid', zIndex: '2'});
  expect(ring.label).toMatch(/^Planning,/);
  expect(focus).toMatchObject({role: 'cell', label: FRIDAY, tabIndex: -1});
  expect(focus.outlineStyle).toBe('solid');
});
