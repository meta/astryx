// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScheduleEventPopover.a11y.chromium.spec.ts
 * @input The built Lab/Schedule event-popover story in real Chromium
 * @output Receipted evidence that, with renderPopover, events are keyboard
 *   reachable buttons whose popup attributes track one view-owned popover:
 *   open on Enter, Space, click, and tap; close on Escape and light dismiss
 *   with focus returned to the event; switch between events in one gesture;
 *   leave a null event read-only; keep the read-only story unchanged; show
 *   no scrollbar on a popover whose content fits; and scroll long content
 *   from the keyboard
 * @position Browser binding for `component:Schedule` FR11–FR14 and AR2–AR5.
 *   jsdom cannot show a native popover, return focus through it, paint a
 *   focus ring, or produce a touch tap.
 */

import {expect, test, type Page} from '@playwright/test';
import pixelmatch from 'pixelmatch';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {
  finishEvidence,
  openStory,
  OVERLAPPING,
  record,
  startEvidence,
  WIDE,
  type Evidence,
} from './timeGridProbe';

const POPOVER_STORY = 'lab-schedule--event-popover';

// Taps need a touch-capable context; nothing else here depends on it.
test.use({hasTouch: true});

let evidence: Evidence;
test.beforeAll(async () => {
  evidence = await startEvidence();
});
test.afterAll(async () => {
  await finishEvidence(evidence, 'event-popover');
});

interface ButtonReading {
  label: string | null;
  expanded: string | null;
  haspopup: string | null;
  controls: string | null;
  group: string | null | undefined;
  insideHidden: boolean;
}

function readButton(page: Page, labelPrefix: string): Promise<ButtonReading> {
  return page.evaluate(prefix => {
    const button = [...document.querySelectorAll('button')].find(candidate =>
      candidate.getAttribute('aria-label')?.startsWith(prefix),
    );
    if (button == null) {
      throw new Error(`no event button starting with ${prefix}`);
    }
    return {
      label: button.getAttribute('aria-label'),
      expanded: button.getAttribute('aria-expanded'),
      haspopup: button.getAttribute('aria-haspopup'),
      controls: button.getAttribute('aria-controls'),
      group: button.closest('[role="group"]')?.getAttribute('aria-label'),
      insideHidden: button.closest('[aria-hidden="true"]') != null,
    };
  }, labelPrefix);
}

/** The open dialog as assistive technology sees it: visible, named, controlled. */
function readDialog(page: Page) {
  return page.evaluate(() => {
    const dialogs = [
      ...document.querySelectorAll<HTMLElement>('[role="dialog"]'),
    ];
    const open = dialogs.filter(dialog => {
      const layer = dialog.closest<HTMLElement>('[popover]');
      return layer != null && layer.matches(':popover-open');
    });
    const dialog = open[0];
    return {
      openCount: open.length,
      label: dialog?.getAttribute('aria-label') ?? null,
      layerID: dialog?.closest<HTMLElement>('[popover]')?.id ?? null,
      details:
        dialog
          ?.querySelector('[data-event-details]')
          ?.getAttribute('data-event-details') ?? null,
      focusInside:
        dialog != null && document.activeElement != null
          ? dialog.contains(document.activeElement)
          : false,
    };
  });
}

function activeLabel(page: Page) {
  return page.evaluate(
    () =>
      document.activeElement?.getAttribute('aria-label') ??
      document.activeElement?.getAttribute('role') ??
      document.activeElement?.tagName.toLowerCase() ??
      null,
  );
}

test('Tab reaches event buttons that announce their popup, and Enter opens the popover for that event', async ({
  page,
}) => {
  await openStory(evidence, page, POPOVER_STORY, WIDE);
  const stops: string[] = [];
  let reached = false;
  for (let press = 0; press < 8 && !reached; press += 1) {
    await page.keyboard.press('Tab');
    const label = await activeLabel(page);
    stops.push(label ?? 'other');
    reached =
      (await page.evaluate(
        () =>
          document.activeElement?.tagName === 'BUTTON' &&
          document.activeElement.closest('[data-scroll-axis]') != null,
      )) === true;
  }
  const first = await readButton(page, 'Offsite,');
  expect(reached, `Tab reached an event button: ${stops.join(' → ')}`).toBe(
    true,
  );
  expect(await activeLabel(page)).toBe(first.label);
  expect(first).toMatchObject({
    label: 'Offsite, all day, Company, Monday, May 11, 2026',
    haspopup: 'dialog',
    expanded: 'false',
    group: 'All-day events',
    insideHidden: false,
  });
  expect(first.controls).toBeTruthy();

  await page.keyboard.press('Enter');
  const afterEnter = await readButton(page, 'Offsite,');
  const dialog = await readDialog(page);
  await record(evidence, page, 'popover-keyboard-open', POPOVER_STORY, 'ltr', {
    stops,
    button: afterEnter,
    dialog,
  });
  expect(afterEnter.expanded).toBe('true');
  expect(dialog.openCount).toBe(1);
  expect(dialog.label).toBe('Offsite');
  expect(dialog.layerID).toBe(first.controls);
  expect(dialog.details).toBe('offsite');
  expect(dialog.focusInside).toBe(true);

  // Escape closes it and focus returns to the event that opened it.
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await readDialog(page)).openCount).toBe(0);
  await expect
    .poll(async () => (await readButton(page, 'Offsite,')).expanded)
    .toBe('false');
  const afterEscape = await readButton(page, 'Offsite,');
  await record(evidence, page, 'popover-escape', POPOVER_STORY, 'ltr', {
    button: afterEscape,
    active: await activeLabel(page),
  });
  expect(afterEscape.expanded).toBe('false');
  expect(await activeLabel(page)).toBe(first.label);

  // Space opens it again, from the same button.
  await page.keyboard.press('Space');
  await expect.poll(async () => (await readDialog(page)).openCount).toBe(1);
  expect((await readButton(page, 'Offsite,')).expanded).toBe('true');
});

test('click opens, clicking another event switches in one gesture, and light dismiss closes', async ({
  page,
}) => {
  await openStory(evidence, page, POPOVER_STORY, WIDE);
  const workshop = page.getByRole('button', {name: /^Workshop,/});
  const coffee = page.getByRole('button', {name: /^Coffee chat,/});

  await workshop.click();
  await expect
    .poll(async () => (await readDialog(page)).details)
    .toBe('contain-long');
  expect((await readButton(page, 'Workshop,')).expanded).toBe('true');

  // Click another event while the first is open: one gesture, one dialog.
  await coffee.click();
  await expect
    .poll(async () => (await readDialog(page)).details)
    .toBe('contain-short');
  const afterSwitch = {
    workshop: await readButton(page, 'Workshop,'),
    coffee: await readButton(page, 'Coffee chat,'),
    dialog: await readDialog(page),
  };
  await record(
    evidence,
    page,
    'popover-switch',
    POPOVER_STORY,
    'ltr',
    afterSwitch,
  );
  expect(afterSwitch.workshop.expanded).toBe('false');
  expect(afterSwitch.coffee.expanded).toBe('true');
  expect(afterSwitch.dialog.openCount).toBe(1);
  expect(afterSwitch.dialog.label).toBe('Coffee chat');

  // Light dismiss: a click on the hour gutter, outside the dialog. The
  // browser hides the popover first and reports it through an asynchronous
  // toggle event, after which the button's expanded state follows.
  await page.mouse.click(30, 700);
  await expect.poll(async () => (await readDialog(page)).openCount).toBe(0);
  await expect
    .poll(async () => (await readButton(page, 'Coffee chat,')).expanded)
    .toBe('false');
  const afterDismiss = await readButton(page, 'Coffee chat,');
  await record(evidence, page, 'popover-light-dismiss', POPOVER_STORY, 'ltr', {
    button: afterDismiss,
  });
  expect(afterDismiss.expanded).toBe('false');

  // A touch tap opens too.
  await workshop.tap();
  await expect
    .poll(async () => (await readDialog(page)).details)
    .toBe('contain-long');
});

test('an event without content stays read-only and the open popover closes when its event leaves', async ({
  page,
}) => {
  await openStory(evidence, page, POPOVER_STORY, WIDE);
  const quarter = await page.evaluate(() => {
    const block = [...document.querySelectorAll('[aria-label]')].find(
      candidate =>
        candidate.getAttribute('aria-label')?.startsWith('Quick check-in,'),
    );
    return block == null
      ? null
      : {
          tag: block.tagName.toLowerCase(),
          haspopup: block.getAttribute('aria-haspopup'),
          group: block.closest('[role="group"]')?.getAttribute('aria-label'),
          insideHidden: block.closest('[aria-hidden="true"]') != null,
        };
  });
  await record(evidence, page, 'popover-null-event', POPOVER_STORY, 'ltr', {
    quarter,
  });
  expect(quarter).toMatchObject({
    tag: 'div',
    haspopup: null,
    insideHidden: false,
  });
  expect(quarter?.group).toMatch(/May 1\d, 2026$/);

  // Open an event, then page away: the popover closes and no dialog remains.
  await page.getByRole('button', {name: /^Workshop,/}).click();
  await expect.poll(async () => (await readDialog(page)).openCount).toBe(1);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.getByRole('button', {name: 'Next week'}).click();
  await expect.poll(async () => (await readDialog(page)).openCount).toBe(0);
  const afterPaging = await page.evaluate(() => ({
    workshopButtons: [...document.querySelectorAll('button')].filter(button =>
      button.getAttribute('aria-label')?.startsWith('Workshop,'),
    ).length,
    expanded: document.querySelectorAll('[aria-expanded="true"]').length,
  }));
  await record(evidence, page, 'popover-event-left', POPOVER_STORY, 'ltr', {
    afterPaging,
    errors,
  });
  expect(afterPaging.workshopButtons).toBe(0);
  expect(afterPaging.expanded).toBe(0);
  expect(errors).toEqual([]);
});

test('a focused event button paints a ring and rises above its neighbours', async ({
  page,
}) => {
  await openStory(evidence, page, POPOVER_STORY, WIDE);
  const workshop = page.getByRole('button', {name: /^Workshop,/});
  const box = await workshop.boundingBox();
  expect(box).not.toBeNull();
  const clip = {
    x: (box?.x ?? 0) - 8,
    y: (box?.y ?? 0) - 8,
    width: (box?.width ?? 0) + 16,
    height: (box?.height ?? 0) + 16,
  };
  const rest = await page.screenshot({clip});
  await workshop.focus();
  // Focus from script does not match :focus-visible; a key press does.
  await page.keyboard.press('Shift');
  const focused = await page.screenshot({clip});
  const before = PNG.sync.read(rest) as {
    width: number;
    height: number;
    data: Buffer;
  };
  const after = PNG.sync.read(focused) as {
    width: number;
    height: number;
    data: Buffer;
  };
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
  await record(evidence, page, 'popover-focus-ring', POPOVER_STORY, 'ltr', {
    ringPixels,
    style,
  });
  expect(style.outlineStyle).not.toBe('none');
  expect(style.outlineWidth).toBeGreaterThan(0);
  expect(style.zIndex).toBe('1');
  expect(ringPixels).toBeGreaterThan(
    ((box?.width ?? 0) + (box?.height ?? 0)) * 2,
  );
});

test('without the option the grid stays read-only', async ({page}) => {
  await openStory(evidence, page, OVERLAPPING, WIDE);
  const reading = await page.evaluate(() => ({
    eventButtons: [...document.querySelectorAll('.astryx-schedule button')]
      .map(button => button.getAttribute('aria-label') ?? button.textContent)
      .filter(name => !/week|Today/i.test(name ?? '')).length,
    hiddenGrid:
      document.querySelector('.astryx-schedule [role="grid"][aria-readonly]') !=
      null,
    dialogs: document.querySelectorAll('[role="dialog"]').length,
  }));
  await record(
    evidence,
    page,
    'read-only-unchanged',
    OVERLAPPING,
    'ltr',
    reading,
  );
  expect(reading.eventButtons).toBe(0);
  expect(reading.hiddenGrid).toBe(true);
  expect(reading.dialogs).toBe(0);
});

test('an open popover whose content fits has no scroll overflow and shows no scrollbar', async ({
  page,
}) => {
  await openStory(evidence, page, POPOVER_STORY, WIDE);
  await page.getByRole('button', {name: /^Workshop,/}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Every box from the popover layer down to its content: none may scroll
  // when the content fits, so classic scrollbars never paint.
  const overflow = await dialog.evaluate(element => {
    const boxes: Element[] = [];
    for (
      let box: Element | null = element;
      box != null && box !== document.body;
      box = box.parentElement
    ) {
      boxes.push(box);
    }
    boxes.push(...element.querySelectorAll('*'));
    return boxes
      .filter(box => {
        const style = getComputedStyle(box);
        return /auto|scroll/.test(style.overflowY + style.overflowX);
      })
      .map(box => ({
        role: box.getAttribute('role'),
        block: box.scrollHeight - box.clientHeight,
        inline: box.scrollWidth - box.clientWidth,
      }));
  });
  await record(evidence, page, 'popover-no-overflow', POPOVER_STORY, 'ltr', {
    overflow,
  });
  for (const box of overflow) {
    expect(box, 'a scroller around fitting popover content').toEqual({
      ...box,
      block: 0,
      inline: 0,
    });
  }
});

test('long popover content scrolls from the keyboard: Tab reaches its named group, and PageDown and ArrowDown reach the end', async ({
  page,
}) => {
  await openStory(evidence, page, POPOVER_STORY, WIDE);
  await page.getByRole('button', {name: /^Workshop,/}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // 120 lines of details: far taller than the viewport.
  await page.evaluate(() => {
    const details = document.querySelector('[data-event-details]');
    for (let line = 1; line <= 120; line += 1) {
      const paragraph = document.createElement('p');
      paragraph.textContent = `Line ${line}`;
      details?.append(paragraph);
    }
  });
  const region = dialog.getByRole('group', {name: 'Workshop details'});
  await expect(region).toHaveAttribute('tabindex', '0');
  // Focus is in the dialog; Tab reaches the scrolling group before the
  // hidden close.
  for (let presses = 0; presses < 3; presses += 1) {
    const inRegion = await region.evaluate(
      element => document.activeElement === element,
    );
    if (inRegion) {
      break;
    }
    await page.keyboard.press('Tab');
  }
  await expect(region).toBeFocused();
  const scroll = () =>
    region.evaluate(element => ({
      top: Math.round(element.scrollTop),
      max: element.scrollHeight - element.clientHeight,
    }));
  // Keyboard scrolling is smooth, so each press is followed until the region
  // settles; the key is pressed until a press no longer moves it.
  const settle = async () => {
    let last = -1;
    for (let frame = 0; frame < 40; frame += 1) {
      const {top} = await scroll();
      if (top === last) {
        return top;
      }
      last = top;
      await page.waitForTimeout(50);
    }
    return last;
  };
  const pressUntilStill = async (key: string) => {
    let top = await settle();
    for (let presses = 0; presses < 200; presses += 1) {
      await page.keyboard.press(key);
      const next = await settle();
      if (next === top) {
        break;
      }
      top = next;
    }
    return scroll();
  };
  const atStart = await scroll();
  const afterPageDown = await pressUntilStill('PageDown');
  await page.keyboard.press('Home');
  await settle();
  const afterHome = await scroll();
  const afterArrowDown = await pressUntilStill('ArrowDown');
  // The surface itself stays inside the viewport.
  const surface = await dialog.boundingBox();
  const viewportHeight = page.viewportSize()?.height ?? 0;
  await record(
    evidence,
    page,
    'popover-keyboard-scroll',
    POPOVER_STORY,
    'ltr',
    {
      atStart,
      afterPageDown,
      afterHome,
      afterArrowDown,
      surfaceBottom: surface == null ? null : surface.y + surface.height,
      viewportHeight,
    },
  );
  expect(atStart.max).toBeGreaterThan(1000);
  expect(atStart.top).toBe(0);
  expect(afterPageDown.top).toBeGreaterThanOrEqual(afterPageDown.max - 1);
  expect(afterHome.top).toBe(0);
  expect(afterArrowDown.top).toBeGreaterThanOrEqual(afterArrowDown.max - 1);
  expect((surface?.y ?? 0) + (surface?.height ?? 0)).toBeLessThanOrEqual(
    viewportHeight,
  );
});
