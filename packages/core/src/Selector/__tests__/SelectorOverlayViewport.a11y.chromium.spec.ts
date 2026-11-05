// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file SelectorOverlayViewport.a11y.chromium.spec.ts
 * @input Uses the near-viewport-bottom overlay Storybook story and Chromium
 * @output Chromium geometry regression coverage for the selected-item
 *   overlay's viewport clamp: the row on the trigger, a usable list, and no
 *   late frame after a change
 * @position Browser-only geometry regression test for Selector
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

test('the overlay list stays inside the viewport when the trigger sits at its end', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--overlay-near-viewport-bottom&viewMode=story`,
    {waitUntil: 'load'},
  );

  const trigger = page.getByRole('combobox', {name: 'Theme choice'});
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox).not.toBeNull();
  // The story places the trigger at the viewport's end.
  expect((triggerBox?.y ?? 0) + (triggerBox?.height ?? 0)).toBeGreaterThan(680);

  await trigger.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const last = page.getByRole('option', {name: 'sepia', exact: true});
  await expect(last).toBeVisible();

  // Give the entry animation and the overlay's layout pass time to finish.
  // The clamp holds the list's end inside the viewport's end gutter, with
  // the whole list in view.
  await expect(async () => {
    const box = await listbox.boundingBox();
    expect(box).not.toBeNull();
    const end = Math.round((box?.y ?? 0) + (box?.height ?? 0));
    expect(end).toBeLessThanOrEqual(720 - GUTTER_PX);
    expect(end).toBeGreaterThan(720 - GUTTER_PX - 40);
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
  }).toPass({timeout: 5_000});
  await expectUsableRows(page, 720);

  // The last option is pointable: a real click selects it.
  await last.click({timeout: 2_000});
  await expect(trigger).toContainText('sepia');
});

test('the overlay follows the layer to the other side when the viewport shrinks with the list open', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--pre-selected&viewMode=story`,
    {waitUntil: 'load'},
  );

  const trigger = page.getByRole('combobox').first();
  await trigger.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const selected = listbox.getByRole('option', {selected: true});
  await expect(selected).toBeVisible();

  // At rest the selected row sits over the trigger. The entry animation
  // scales the list, so the read settles rather than waiting a fixed time.
  await expect(async () => {
    const [box, row, triggerBox] = await Promise.all([
      listbox.boundingBox(),
      selected.boundingBox(),
      trigger.boundingBox(),
    ]);
    expect(box?.height ?? 0).toBeGreaterThan(0);
    expect(row?.height ?? 0).toBeGreaterThan(0);
    expect(Math.abs(centerY(row) - centerY(triggerBox))).toBeLessThanOrEqual(2);
  }).toPass({timeout: 5_000});

  // A shorter viewport: the layer re-settles, and the list stays inside it
  // with the selected row still over the trigger.
  await page.setViewportSize({width: 1280, height: 330});
  await expect(async () => {
    const [box, row, triggerNow] = await Promise.all([
      listbox.boundingBox(),
      selected.boundingBox(),
      trigger.boundingBox(),
    ]);
    expect(box?.height ?? 0).toBeGreaterThan(0);
    expect(row?.height ?? 0).toBeGreaterThan(0);
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(330);
    expect(Math.abs(centerY(row) - centerY(triggerNow))).toBeLessThanOrEqual(2);
  }).toPass({timeout: 5_000});
  await expectUsableRows(page, 330);
});

test('the overlay follows the layer when the trigger moves in layout with the list open', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--pre-selected&viewMode=story`,
    {waitUntil: 'load'},
  );

  const trigger = page.getByRole('combobox').first();
  await trigger.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const selected = listbox.getByRole('option', {selected: true});
  await expect(selected).toBeVisible();

  const triggerBefore = await trigger.boundingBox();
  await expect(async () => {
    const [box, row] = await Promise.all([
      listbox.boundingBox(),
      selected.boundingBox(),
    ]);
    expect(box?.height ?? 0).toBeGreaterThan(0);
    expect(row?.height ?? 0).toBeGreaterThan(0);
    expect(Math.abs(centerY(row) - centerY(triggerBefore))).toBeLessThanOrEqual(
      2,
    );
  }).toPass({timeout: 5_000});

  // Content grows above the trigger inside the story. The trigger moves down
  // at the same size, to where the list no longer fits below it, and the
  // layer flips above. The centered story root grows with its content, so
  // the move is half the added height.
  const spacer = Math.round((550 - (triggerBefore?.y ?? 0)) * 2);
  const problems = collectProblems(page);
  const painted = await paintedOffsets(page, {kind: 'move', px: spacer}, 6);
  // The clamp is in layout, so the move re-places the list in the frame it
  // lands in: no painted frame shows a stale place.
  expect(painted.filter(offset => offset > 2)).toEqual([]);
  await expect(async () => {
    const [box, row, triggerNow] = await Promise.all([
      listbox.boundingBox(),
      selected.boundingBox(),
      trigger.boundingBox(),
    ]);
    expect(box?.height ?? 0).toBeGreaterThan(0);
    expect(row?.height ?? 0).toBeGreaterThan(0);
    expect(triggerNow?.y ?? 0).toBeGreaterThan((triggerBefore?.y ?? 0) + 100);
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(720);
    expect(Math.abs(centerY(row) - centerY(triggerNow))).toBeLessThanOrEqual(2);
  }).toPass({timeout: 5_000});
  await expectUsableRows(page, 720);
  expect(problems()).toEqual([]);
});

test('the overlay follows the layer when the trigger moves and the viewport shrinks in one frame', async ({
  page,
}) => {
  // A layer that keeps its anchor clear subscribes to the same watcher
  // before the overlay does. If the overlay's read depended on that
  // subscriber, a list whose layer never subscribes would read stale
  // placement after a move. The Selector's popover is such a layer. The move
  // case above already runs with no runtime subscriber ahead of it. This case
  // also resizes the viewport inside the frame the trigger moves, so every
  // subscriber's callback runs in that frame's round.
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--pre-selected&viewMode=story`,
    {waitUntil: 'load'},
  );
  const trigger = page.getByRole('combobox').first();
  await trigger.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const selected = listbox.getByRole('option', {selected: true});
  await expect(selected).toBeVisible();
  const triggerBefore = await trigger.boundingBox();
  await expect(async () => {
    const row = await selected.boundingBox();
    expect(row?.height ?? 0).toBeGreaterThan(0);
    expect(Math.abs(centerY(row) - centerY(triggerBefore))).toBeLessThanOrEqual(
      2,
    );
  }).toPass({timeout: 5_000});

  // Both changes land in one frame. The trigger moves in layout and the
  // viewport shrinks, so every subscriber's callback runs in that frame's
  // round, whatever its position.
  const spacer = Math.round((550 - (triggerBefore?.y ?? 0)) * 2);
  await Promise.all([
    page.evaluate(px => {
      const block = document.createElement('div');
      block.style.height = `${px}px`;
      document.getElementById('storybook-root')?.prepend(block);
    }, spacer),
    page.setViewportSize({width: 1280, height: 640}),
  ]);
  await expect(async () => {
    const [box, row, triggerNow] = await Promise.all([
      listbox.boundingBox(),
      selected.boundingBox(),
      trigger.boundingBox(),
    ]);
    expect(box?.height ?? 0).toBeGreaterThan(0);
    expect(row?.height ?? 0).toBeGreaterThan(0);
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(640);
    expect(Math.abs(centerY(row) - centerY(triggerNow))).toBeLessThanOrEqual(2);
  }).toPass({timeout: 5_000});
  await expectUsableRows(page, 640);
});

test('the overlay follows the layer when the page scrolls with the list open', async ({
  page,
}) => {
  const problems = collectProblems(page);
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--pre-selected&viewMode=story`,
    {waitUntil: 'load'},
  );
  // A page taller than the viewport, so it can scroll with the list open.
  await page.evaluate(() => {
    document.body.style.minHeight = '1000px';
  });

  const trigger = page.getByRole('combobox').first();
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

  // Anchor positioning scroll-adjusts the layer with its anchor. The overlay
  // shift must start from that adjusted place, not from the pre-scroll one.
  // The move report arrives after the scrolled frame paints. The shift is
  // measured again a frame later, so the read waits for those frames. A read
  // in the scrolled frame itself sees the layer before any re-measure.
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        window.scrollTo(0, 150);
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
  await expect(async () => {
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(150);
    const [box, row, triggerNow] = await Promise.all([
      listbox.boundingBox(),
      selected.boundingBox(),
      trigger.boundingBox(),
    ]);
    expect(box?.height ?? 0).toBeGreaterThan(0);
    expect(row?.height ?? 0).toBeGreaterThan(0);
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(720);
    expect(Math.abs(centerY(row) - centerY(triggerNow))).toBeLessThanOrEqual(2);
  }).toPass({timeout: 5_000});
  await expectUsableRows(page, 720);
  expect(problems()).toEqual([]);
});

interface OverlayParts {
  trigger: Locator;
  listbox: Locator;
  selected: Locator;
}

/**
 * Open the Pre Selected story's list and wait for the selected row to sit
 * over the trigger. `prepare` runs once the story is mounted, before the
 * click. Returns the locators the cases read.
 */
async function openPreSelected(
  page: Page,
  prepare?: () => Promise<void>,
): Promise<OverlayParts> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--pre-selected&viewMode=story`,
    {waitUntil: 'load'},
  );
  const trigger = page.getByRole('combobox').first();
  // The story mounts after load and replaces the root's content, so a
  // change to the page waits for the trigger.
  await expect(trigger).toBeVisible();
  await prepare?.();
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
  return {trigger, listbox, selected};
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
 * usable list: at least two rows in full view, or every row when the list
 * has fewer.
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

/** The viewport gutter an anchored layer keeps: the spacing-4 step. */
const GUTTER_PX = 16;

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

test('the overlay follows the layer when an ancestor scroll container scrolls with the list open', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 720});
  const parts = await openPreSelected(page, async () =>
    page.evaluate(() => {
      // The story root becomes a scroll container with room to scroll.
      const root = document.getElementById('storybook-root');
      if (root) {
        root.style.height = '400px';
        root.style.overflowY = 'auto';
        const spacer = document.createElement('div');
        spacer.style.height = '800px';
        root.append(spacer);
      }
    }),
  );
  const triggerBefore = await parts.trigger.boundingBox();
  await settledFrames(page, async () =>
    page.evaluate(() => {
      const root = document.getElementById('storybook-root');
      if (root) {
        root.scrollTop = 120;
      }
    }),
  );
  const triggerNow = await parts.trigger.boundingBox();
  expect((triggerBefore?.y ?? 0) - (triggerNow?.y ?? 0)).toBeGreaterThan(100);
  await expectAligned(page, parts, 720);
});

test('the overlay stays with the layer when the visual viewport shrinks by a pinch zoom', async ({
  page,
}) => {
  // Pinch zoom resizes the visual viewport only. Anchor positioning places
  // the layer, and the overlay measures, in the layout viewport. That
  // viewport does not change, so the list keeps its place against the trigger.
  await page.setViewportSize({width: 1280, height: 720});
  const parts = await openPreSelected(page);
  const session = await page.context().newCDPSession(page);
  await settledFrames(page, async () =>
    session.send('Emulation.setPageScaleFactor', {pageScaleFactor: 2}),
  );
  const scale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  expect(scale).toBeCloseTo(2, 1);
  await expectAligned(page, parts, 720);
  await session.send('Emulation.setPageScaleFactor', {pageScaleFactor: 1});
});

test('the overlay follows the layer across an orientation change', async ({
  page,
}) => {
  const session = await page.context().newCDPSession(page);
  const portrait = {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenOrientation: {type: 'portraitPrimary' as const, angle: 0},
  };
  await session.send('Emulation.setDeviceMetricsOverride', portrait);
  await page.setViewportSize({width: 390, height: 844});
  const parts = await openPreSelected(page);
  await settledFrames(page, async () =>
    session.send('Emulation.setDeviceMetricsOverride', {
      ...portrait,
      width: 844,
      height: 390,
      screenOrientation: {type: 'landscapePrimary', angle: 90},
    }),
  );
  const size = await page.evaluate(() => [innerWidth, innerHeight]);
  expect(size).toEqual([844, 390]);
  await expectAligned(page, parts, 390);
  await session.send('Emulation.clearDeviceMetricsOverride');
});

test('the overlay follows the layer when an option grows with the list open', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 720});
  const parts = await openPreSelected(page);
  const listBefore = await parts.listbox.boundingBox();
  const problems = collectProblems(page);
  const painted = await paintedOffsets(page, {kind: 'grow'}, 6);
  // A resize is reported before the frame paints, so no painted frame shows
  // the stale shift.
  expect(painted.filter(offset => offset > 2)).toEqual([]);
  const listNow = await parts.listbox.boundingBox();
  expect((listNow?.height ?? 0) - (listBefore?.height ?? 0)).toBeGreaterThan(
    40,
  );
  await expectAligned(page, parts, 720);
  expect(problems()).toEqual([]);
});

/**
 * Apply a change in an animation frame, then read the selected row's distance
 * from the trigger after each of the next frames paints. A task posted from
 * the frame callback runs after that frame's paint, so each reading is one
 * painted frame.
 */
async function paintedOffsets(
  page: Page,
  change: {kind: 'move'; px: number} | {kind: 'grow'},
  frames: number,
): Promise<number[]> {
  return page.evaluate(
    async ({change, frames}) =>
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
          if (samples.length >= frames) {
            resolve(samples);
          } else {
            requestAnimationFrame(() => channel.port2.postMessage(0));
          }
        };
        requestAnimationFrame(() => {
          if (change.kind === 'move') {
            const block = document.createElement('div');
            block.style.height = `${change.px}px`;
            document.getElementById('storybook-root')?.prepend(block);
          } else {
            const option = document.querySelector<HTMLElement>(
              '[role="listbox"] [role="option"]',
            );
            if (option) {
              option.style.minHeight = '96px';
            }
          }
          channel.port2.postMessage(0);
        });
      }),
    {change, frames},
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
