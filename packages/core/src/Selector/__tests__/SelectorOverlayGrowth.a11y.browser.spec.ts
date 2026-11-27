// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Selector/|apps/storybook/stories/Selector\.stories)

/**
 * @file SelectorOverlayGrowth.a11y.browser.spec.ts
 * @input The Pre Selected Storybook story, in Chromium and WebKit
 * @output Proof that the selected-item overlay measures again when its open
 *   list grows. The selected row stays on the trigger, with no painted frame
 *   off it. A list near the viewport's end ends at its end gutter. An engine
 *   without CSS anchor positioning still opens the list.
 * @position Browser geometry regression test for Selector FR2
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import type {Locator, Page} from '@astryxdesign/a11y-spec/playwright';
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

/** The viewport gutter an anchored layer keeps: the spacing-4 step. */
const GUTTER_PX = 16;

test('the selected row stays on the trigger when an option grows with the list open', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 720});
  const problems = collectProblems(page);
  const parts = await openPreSelected(page);
  const listBefore = await parts.listbox.boundingBox();
  const painted = await paintedOffsets(page, 6);
  // A resize is reported before the frame paints, so no painted frame shows
  // the old shift.
  expect(painted.filter(offset => offset > 2)).toEqual([]);
  const listNow = await parts.listbox.boundingBox();
  expect((listNow?.height ?? 0) - (listBefore?.height ?? 0)).toBeGreaterThan(
    40,
  );
  await expectAligned(page, parts, 720);
  expect(problems()).toEqual([]);
});

test("a list that grows near the viewport's end stays inside its end gutter", async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--pre-selected&viewMode=story`,
    {waitUntil: 'load'},
  );
  const trigger = page.getByRole('combobox').first();
  await expect(trigger).toBeVisible();
  await pinFieldAtBlockEnd(page);
  await trigger.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await entranceEnded(page);
  await settledFrames(page);
  const before = await layerBox(page);
  // The clamp binds at the end before the growth.
  expect(before.bottom).toBeLessThanOrEqual(720 - GUTTER_PX + 0.5);
  await settledFrames(page, async () =>
    page.evaluate(() => {
      const option = document.querySelector<HTMLElement>(
        '[role="listbox"] [role="option"]',
      );
      if (option) {
        option.style.minHeight = '96px';
      }
    }),
  );
  await expect(async () => {
    const now = await layerBox(page);
    expect(now.bottom - now.top).toBeGreaterThan(
      before.bottom - before.top + 40,
    );
    expect(now.top).toBeGreaterThanOrEqual(0);
    // The clamp still binds: the list ends exactly at the end gutter.
    expect(now.bottom).toBeCloseTo(720 - GUTTER_PX, 0);
  }).toPass({timeout: 5_000});
  await expectUsableRows(page, 720);
});

test('an engine without CSS anchor positioning still opens the list', async ({
  page,
}) => {
  // Such an engine has the Popover API but no position-area on its computed
  // style. This page hides the property from script; layout keeps it.
  await page.addInitScript(() => {
    const read = window.getComputedStyle.bind(window);
    window.getComputedStyle = (element, pseudoElement) => {
      const style = read(element, pseudoElement);
      return new Proxy(style, {
        get(target, key): string | number | object | null | undefined {
          if (key === 'positionArea') {
            return undefined;
          }
          if (key === 'getPropertyValue') {
            return (property: string) =>
              property === 'position-area'
                ? ''
                : target.getPropertyValue(property);
          }
          const value: unknown = Reflect.get(target, key, target);
          return typeof value === 'function'
            ? (value as (...args: never[]) => unknown).bind(target)
            : (value as string | number | object | null | undefined);
        },
      });
    };
  });
  await page.setViewportSize({width: 1280, height: 720});
  const problems = collectProblems(page);
  const parts = await openPreSelected(page);
  const hidden = await page.evaluate(() => {
    const layer = document
      .querySelector('[role="listbox"]')
      ?.closest<HTMLElement>('[popover]');
    return (
      layer != null &&
      Reflect.get(getComputedStyle(layer), 'positionArea') === undefined &&
      getComputedStyle(layer).getPropertyValue('position-area') === ''
    );
  });
  expect(hidden).toBe(true);
  await expectAligned(page, parts, 720);
  expect(problems()).toEqual([]);
});

/** Pin the Selector's field 8px above the viewport's block end. */
async function pinFieldAtBlockEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const field = document
      .querySelector<HTMLElement>('[role="combobox"]')
      ?.closest<HTMLElement>('.astryx-selector');
    if (field == null) {
      throw new Error('the Selector field must be in the document');
    }
    field.style.position = 'fixed';
    field.style.width = '250px';
    field.style.insetInlineStart = '400px';
    field.style.insetBlockStart = 'auto';
    field.style.insetBlockEnd = '8px';
  });
}

/** The open list's layer box, viewport px. */
async function layerBox(page: Page): Promise<{top: number; bottom: number}> {
  return page.evaluate(() => {
    const listbox = document.querySelector<HTMLElement>('[role="listbox"]');
    const layer = listbox?.closest<HTMLElement>('[popover]') ?? listbox;
    const box = layer?.getBoundingClientRect();
    return {top: box?.top ?? Number.NaN, bottom: box?.bottom ?? Number.NaN};
  });
}

interface OverlayParts {
  trigger: Locator;
  listbox: Locator;
  selected: Locator;
}

/**
 * Open the Pre Selected story's list and wait for the selected row to sit
 * over the trigger. Returns the locators the cases read.
 */
async function openPreSelected(page: Page): Promise<OverlayParts> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--pre-selected&viewMode=story`,
    {waitUntil: 'load'},
  );
  const trigger = page.getByRole('combobox').first();
  // The story mounts after load and replaces the root's content, so a
  // change to the page waits for the trigger.
  await expect(trigger).toBeVisible();
  await trigger.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const selected = listbox.getByRole('option', {selected: true});
  await expect(selected).toBeVisible();
  await expect(async () => {
    const [row, triggerBox] = await Promise.all([
      selected.boundingBox(),
      trigger.boundingBox(),
    ]);
    expect(row?.height ?? 0).toBeGreaterThan(0);
    expect(Math.abs(centerY(row) - centerY(triggerBox))).toBeLessThanOrEqual(2);
  }).toPass({timeout: 5_000});
  await entranceEnded(page);
  return {trigger, listbox, selected};
}

/**
 * Wait for the open list's entrance animations to end, so later readings
 * measure only the change a case makes.
 */
async function entranceEnded(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const layer = document
      .querySelector('[role="listbox"]')
      ?.closest<HTMLElement>('[popover]');
    await Promise.all(
      (layer?.getAnimations({subtree: true}) ?? []).map(async animation =>
        animation.finished.catch(() => undefined),
      ),
    );
  });
}

/**
 * Run `change`, then wait six animation frames: a move report, the
 * re-measure and its commit.
 */
async function settledFrames(
  page: Page,
  change?: () => Promise<unknown>,
): Promise<void> {
  await change?.();
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        let frames = 0;
        const next = () => {
          frames += 1;
          if (frames < 6) {
            requestAnimationFrame(next);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(next);
      }),
  );
}

/**
 * The selected row over the trigger, the list inside the viewport, and a
 * usable list. A usable list shows at least two rows in full view, or every
 * row when it has fewer.
 */
async function expectAligned(
  page: Page,
  parts: OverlayParts,
  viewportHeight: number,
): Promise<void> {
  await expect(async () => {
    const [box, row, triggerNow] = await Promise.all([
      parts.listbox.boundingBox(),
      parts.selected.boundingBox(),
      parts.trigger.boundingBox(),
    ]);
    expect(box?.height ?? 0).toBeGreaterThan(0);
    expect(row?.height ?? 0).toBeGreaterThan(0);
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      viewportHeight,
    );
    expect(Math.abs(centerY(row) - centerY(triggerNow))).toBeLessThanOrEqual(2);
  }).toPass({timeout: 5_000});
  await expectUsableRows(page, viewportHeight);
}

/**
 * Rows in full view: inside the list's own box and inside the viewport above
 * `limit`. A list the cap or the clamp left too short to use fails here.
 */
async function expectUsableRows(page: Page, limit: number): Promise<void> {
  await expect(async () => {
    const counts = await page.evaluate(limitPx => {
      const listbox = document.querySelector<HTMLElement>('[role="listbox"]');
      if (listbox == null) {
        return {rows: 0, inView: 0};
      }
      const box = listbox.getBoundingClientRect();
      const rows = Array.from(
        listbox.querySelectorAll<HTMLElement>('[role="option"]'),
      );
      const inView = rows.filter(row => {
        const rect = row.getBoundingClientRect();
        return (
          rect.top >= box.top - 0.5 &&
          rect.bottom <= box.bottom + 0.5 &&
          rect.top >= -0.5 &&
          rect.bottom <= limitPx + 0.5
        );
      });
      return {rows: rows.length, inView: inView.length};
    }, limit);
    expect(counts.rows).toBeGreaterThan(0);
    expect(counts.inView).toBeGreaterThanOrEqual(Math.min(2, counts.rows));
  }).toPass({timeout: 5_000});
}

/**
 * Grow the list's first option in an animation frame, then read the selected
 * row's distance from the trigger after each of the next frames paints. A
 * task posted from the frame callback runs after that frame's paint, so each
 * reading is one painted frame.
 */
async function paintedOffsets(page: Page, frames: number): Promise<number[]> {
  return page.evaluate(
    async count =>
      new Promise<number[]>(resolve => {
        const samples: number[] = [];
        const read = () => {
          const row = document
            .querySelector(
              '[role="listbox"] [role="option"][aria-selected="true"]',
            )
            ?.getBoundingClientRect();
          const trigger = document
            .querySelector('[role="combobox"]')
            ?.getBoundingClientRect();
          return row && trigger
            ? Math.abs(
                row.top + row.height / 2 - (trigger.top + trigger.height / 2),
              )
            : Number.NaN;
        };
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          samples.push(read());
          if (samples.length >= count) {
            resolve(samples);
          } else {
            requestAnimationFrame(() => channel.port2.postMessage(0));
          }
        };
        requestAnimationFrame(() => {
          const option = document.querySelector<HTMLElement>(
            '[role="listbox"] [role="option"]',
          );
          if (option) {
            option.style.minHeight = '96px';
          }
          channel.port2.postMessage(0);
        });
      }),
    frames,
  );
}

/** Console warnings, console errors and page errors from now on. */
function collectProblems(page: Page): () => string[] {
  const problems: string[] = [];
  page.on('console', message => {
    if (message.type() === 'warning' || message.type() === 'error') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', error => problems.push(`pageerror: ${String(error)}`));
  return () => problems;
}

function centerY(box: {y: number; height: number} | null): number {
  return box == null ? Number.NaN : box.y + box.height / 2;
}
