// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file anchorReadiness.a11y.browser.spec.ts
 * @input Uses Playwright, a built Storybook, the LayerDismissal stories
 * @output Real-Chromium and real-WebKit proof that a controlled Tooltip,
 *   HoverCard or Popover opened inside a Dialog anchors to its trigger, not
 *   the viewport corner. A layer whose trigger sits in a closed `<dialog>`
 *   that the page displays opens, anchored to it.
 * @position High-fidelity lane; jsdom's getBoundingClientRect and
 *   ResizeObserver are both no-ops, so the anchor-readiness wait in
 *   useLayer's show() (#5398) can only be proven against a real layout
 *   engine. Cross-browser because anchor-geometry resolution is exactly the
 *   kind of engine-specific behavior a single browser cannot speak for.
 *
 * SYNC: The stories this reads are in
 *   apps/storybook/stories/LayerDismissal.stories.tsx.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

async function openStory(page: Page, storyId: string): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story`,
    {
      waitUntil: 'load',
    },
  );
  await holdMotionStill(page);
}

/**
 * A layer stuck at the CSS anchor-positioning fallback (no valid anchor at
 * resolution time) lands at the viewport's top-left corner, boxes apart from
 * the trigger. Anchored correctly, the two boxes sit flush or a spacing-token
 * gap apart. The gap between the closest edges (0 while overlapping, the
 * straight-line distance between them otherwise) captures exactly that, and
 * stays small for any legitimate placement/alignment/fallback flip while
 * blowing up for the corner-stuck failure mode.
 */
function edgeGap(
  a: {x: number; y: number; width: number; height: number},
  b: {x: number; y: number; width: number; height: number},
): number {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.sqrt(dx * dx + dy * dy);
}

// The layer's own `offset` prop defaults to 0 (flush), and these stories
// don't set one, so a correctly anchored layer sits within a handful of
// pixels of its trigger. 60px comfortably covers any placement/alignment
// fallback flip while staying far below the ~300-450px gap the corner-stuck
// failure mode (#5398) produces in these stories' layouts.
const MAX_ANCHOR_GAP_PX = 60;

test('a controlled Tooltip opened inside a Dialog anchors to its trigger', async ({
  page,
}) => {
  await openStory(page, 'core-layer-dismissal--pinned-tooltip-in-modal');
  const root = page.locator('#storybook-root');
  await root.getByRole('button', {name: 'Open modal'}).click();

  const trigger = root.getByRole('button', {name: 'Tip trigger'});
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();

  const triggerBox = await trigger.boundingBox();
  const tooltipBox = await tooltip.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(tooltipBox).not.toBeNull();
  if (triggerBox == null || tooltipBox == null) {
    return;
  }
  expect(edgeGap(tooltipBox, triggerBox)).toBeLessThan(MAX_ANCHOR_GAP_PX);
});

test('a controlled Tooltip with a text-only trigger opened inside a Dialog anchors to it', async ({
  page,
}) => {
  // Tooltip wraps text-only children in an inline <span> rather than a
  // block-level control — the shape whose content box can stay empty in the
  // delayed (ResizeObserver) anchor-readiness path, which a button-shaped
  // trigger cannot prove (#5398).
  await openStory(page, 'core-layer-dismissal--text-only-trigger-in-modal');
  const root = page.locator('#storybook-root');
  await root.getByRole('button', {name: 'Open modal'}).click();

  const trigger = root.getByText('Text-only trigger');
  // By text, not role: the Dialog's own header Close button also carries a
  // tooltip, so an unscoped/unnamed role query is ambiguous.
  const tooltip = page.getByText('Still anchors');
  await expect(tooltip).toBeVisible();

  const triggerBox = await trigger.boundingBox();
  const tooltipBox = await tooltip.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(tooltipBox).not.toBeNull();
  if (triggerBox == null || tooltipBox == null) {
    return;
  }
  expect(edgeGap(tooltipBox, triggerBox)).toBeLessThan(MAX_ANCHOR_GAP_PX);
});

test('a controlled Tooltip whose trigger gains layout well past any fixed bound still anchors to it', async ({
  page,
}) => {
  // The trigger stays boxless (display: none) for a full 1.5s after the
  // Dialog opens — well past a fixed frame/time bound a readiness wait
  // might give up after. The layer must still end up anchored once the
  // trigger is actually ready, not opened early against a boxless
  // placeholder: the current Layer contract puts no time limit on how long
  // a trigger is allowed to take (#5398).
  await openStory(
    page,
    'core-layer-dismissal--delayed-trigger-layout-in-modal',
  );
  const root = page.locator('#storybook-root');
  await root.getByRole('button', {name: 'Open modal'}).click();

  const trigger = root.getByRole('button', {name: 'Late trigger'});
  const tooltip = page.getByText('Anchors once ready');
  await expect(tooltip).toBeVisible({timeout: 3_000});

  const triggerBox = await trigger.boundingBox();
  const tooltipBox = await tooltip.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(tooltipBox).not.toBeNull();
  if (triggerBox == null || tooltipBox == null) {
    return;
  }
  expect(edgeGap(tooltipBox, triggerBox)).toBeLessThan(MAX_ANCHOR_GAP_PX);
});

test('a controlled HoverCard opened inside a Dialog anchors to its trigger', async ({
  page,
}) => {
  await openStory(page, 'core-layer-dismissal--stuck-hover-card-in-modal');
  const root = page.locator('#storybook-root');
  await root.getByRole('button', {name: 'Open modal'}).click();

  const trigger = root.getByRole('button', {name: 'Card trigger'});
  const card = page.getByText('Stuck card');
  await expect(card).toBeVisible();

  const triggerBox = await trigger.boundingBox();
  const cardBox = await card.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  if (triggerBox == null || cardBox == null) {
    return;
  }
  expect(edgeGap(cardBox, triggerBox)).toBeLessThan(MAX_ANCHOR_GAP_PX);
});

test('a controlled Tooltip still opens when its trigger sits inside a continuously animating ancestor', async ({
  page,
}) => {
  // `Animation.finished` never resolves for an infinite-iteration animation,
  // so the anchor-readiness wait must not treat it the way it treats a
  // finite entry transition (e.g. Dialog's own open animation) — otherwise a
  // trigger that never stops animating (a pulsing StatusDot, e.g.) would
  // leave its Tooltip stuck waiting forever.
  await openStory(page, 'core-layer-dismissal--continuously-animating-trigger');
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible({timeout: 5_000});
});

/** Resolves after two animation frames have run in the page. */
async function twoFrames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

/** The gap between the boxes of two elements, which both must have. */
async function gapBetween(layer: Locator, trigger: Locator): Promise<number> {
  const layerBox = await layer.boundingBox();
  const triggerBox = await trigger.boundingBox();
  expect(layerBox).not.toBeNull();
  expect(triggerBox).not.toBeNull();
  if (layerBox == null || triggerBox == null) {
    return Number.POSITIVE_INFINITY;
  }
  return edgeGap(layerBox, triggerBox);
}

// A `<dialog>` the page displays while it stays closed never enters the top
// layer. A trigger inside it is a valid anchor, and a layer it opens anchors
// to it.
test('a Popover inside a closed dialog shown in flow opens on a press, anchored to its trigger', async ({
  page,
}) => {
  await openStory(
    page,
    'core-layer-dismissal--layers-in-closed-in-flow-dialog',
  );
  const root = page.locator('#storybook-root');
  const trigger = root.getByRole('button', {name: 'Open in-flow popover'});
  await trigger.click();

  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const popover = page.getByText('In-flow popover', {exact: true});
  await expect(popover).toBeVisible();
  expect(await gapBetween(popover, trigger)).toBeLessThan(MAX_ANCHOR_GAP_PX);
});

test('a click in a closed dialog shown in flow opens the Popover with its field focused within the click', async ({
  page,
}) => {
  // iOS raises its keyboard only for a focus made while the tap is handled. A
  // frame callback asked for during the click runs before any frame the layer
  // asks for. So it reads the state that the click itself left.
  await openStory(
    page,
    'core-layer-dismissal--layers-in-closed-in-flow-dialog',
  );
  const root = page.locator('#storybook-root');
  await page.evaluate(() => {
    window.addEventListener(
      'click',
      () => {
        requestAnimationFrame(() => {
          const layer = document.querySelector(':popover-open');
          const active = document.activeElement;
          document.body.dataset.firstFrame = JSON.stringify({
            isOpen: layer != null,
            isFieldFocused:
              layer != null &&
              active instanceof HTMLInputElement &&
              layer.contains(active),
          });
        });
      },
      {capture: true, once: true},
    );
  });

  await root.getByRole('button', {name: 'Open in-flow popover'}).click();

  await expect
    .poll(async () =>
      page.evaluate(() => document.body.dataset.firstFrame ?? null),
    )
    .toBe(JSON.stringify({isOpen: true, isFieldFocused: true}));
});

test('a Tooltip inside a closed dialog shown in flow opens on a hover, anchored to its trigger', async ({
  page,
}) => {
  await openStory(
    page,
    'core-layer-dismissal--layers-in-closed-in-flow-dialog',
  );
  const root = page.locator('#storybook-root');
  const trigger = root.getByRole('button', {name: 'In-flow tip trigger'});
  await trigger.hover();

  const tooltip = page.getByText('In-flow tip', {exact: true});
  await expect(tooltip).toBeVisible();
  expect(await gapBetween(tooltip, trigger)).toBeLessThan(MAX_ANCHOR_GAP_PX);
});

test('a Popover inside a closed dialog shown in flow opens on a press after its card expands in flow', async ({
  page,
}) => {
  await openStory(
    page,
    'core-layer-dismissal--layer-after-inline-expand-in-closed-dialog',
  );
  const root = page.locator('#storybook-root');
  await root.getByRole('button', {name: 'Expand card'}).click();
  const trigger = root.getByRole('button', {name: 'Pin'});
  await trigger.click();

  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const popover = page.getByText('Pinned to the card', {exact: true});
  await expect(popover).toBeVisible();
  expect(await gapBetween(popover, trigger)).toBeLessThan(MAX_ANCHOR_GAP_PX);
});

test('a controlled Popover inside a Dialog opens once the dialog is modal: anchored to its trigger and above the dialog', async ({
  page,
}) => {
  // Dialog displays its element before it calls showModal(). A layer opened in
  // that window would be in the top layer before the dialog, under it, with an
  // anchor it cannot use.
  await openStory(page, 'core-layer-dismissal--pinned-popover-in-modal');
  const root = page.locator('#storybook-root');
  await root.getByRole('button', {name: 'Open modal'}).click();

  const trigger = root.getByRole('button', {name: 'Popover trigger'});
  const popover = page.getByText('Pinned popover', {exact: true});
  await expect(popover).toBeVisible();
  expect(await gapBetween(popover, trigger)).toBeLessThan(MAX_ANCHOR_GAP_PX);
  // The point at the middle of the popover's text hits the popover, not the
  // dialog painted over it.
  const isOnTop = await popover.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = element.ownerDocument.elementFromPoint(
      box.x + box.width / 2,
      box.y + box.height / 2,
    );
    return hit != null && (hit === element || element.contains(hit));
  });
  expect(isOnTop).toBe(true);
});

test('a controlled Popover inside a hidden closed dialog waits, then opens anchored once the dialog is shown in flow', async ({
  page,
}) => {
  await openStory(
    page,
    'core-layer-dismissal--pinned-popover-in-hidden-closed-dialog',
  );
  const root = page.locator('#storybook-root');
  // While the dialog is `display: none`, its trigger has no box: no layer opens.
  await twoFrames(page);
  expect(
    await page.evaluate(
      () => document.querySelectorAll(':popover-open').length,
    ),
  ).toBe(0);

  await root.getByRole('button', {name: 'Show the dialog in flow'}).click();
  const trigger = root.getByRole('button', {name: 'Hidden dialog trigger'});
  const popover = page.getByText('Waits for a box', {exact: true});
  await expect(popover).toBeVisible();
  expect(await gapBetween(popover, trigger)).toBeLessThan(MAX_ANCHOR_GAP_PX);
});
