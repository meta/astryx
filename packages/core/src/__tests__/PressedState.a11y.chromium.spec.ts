// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file PressedState.a11y.chromium.spec.ts
 * @input Uses the eight public Pressed state stories and a built Storybook
 * @output Pixel proof for enabled press feedback, release recovery, disabled
 *   non-response, and the selected SegmentedControl exception
 * @position Real-Chromium evidence for design:user-states; DOM emulation and
 *   generated CSS inspection cannot prove which pixels a held pointer paints.
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Locator, type Page} from '@playwright/test';
import pixelmatch from 'pixelmatch';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('test-results/pressed-state-evidence');

type MountedCase = {
  target: Locator;
  surfaces: Record<string, Locator>;
  state: () => Promise<string>;
  disabledTarget: Locator;
  disabledSurfaces: Record<string, Locator>;
  disabledState: () => Promise<string>;
  independentTarget?: Locator;
  independentSurfaces?: Record<string, Locator>;
  independentState?: () => Promise<string>;
  independentActivated?: () => Promise<boolean>;
  selectedTarget?: Locator;
  selectedSurfaces?: Record<string, Locator>;
  selectedState?: () => Promise<string>;
};

type MatrixCase = {
  component: string;
  storyId: string;
  releaseInPlace?: boolean;
  mount: (root: Locator) => MountedCase;
};

type Shot = {
  file: string;
  sha256: string;
  width: number;
  height: number;
};

type Result = {
  component: string;
  storyId: string;
  shots: Record<string, Shot>;
  comparisons: {
    surface: string;
    pressedDiffPixels: number;
    releasedDiffPixels: number;
    disabledDiffPixels: number;
    independentDiffPixels?: number;
    selectedDiffPixels?: number;
  }[];
};

const results: Result[] = [];
let storybook: StaticServer;
let browserVersion = 'unknown';
let viewport: {width: number; height: number} | null = null;

test.beforeAll(async () => {
  fs.rmSync(OUTPUT, {recursive: true, force: true});
  fs.mkdirSync(OUTPUT, {recursive: true});
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(
      {
        version: 1,
        headSha:
          process.env.ASTRYX_HEAD_SHA ??
          process.env.GITHUB_SHA ??
          'local-working-copy',
        checkoutSha: process.env.GITHUB_SHA ?? 'local-working-copy',
        browser: browserVersion,
        viewport,
        stories: results,
      },
      null,
      2,
    )}\n`,
  );
  await storybook?.close();
});

const checkedState = (locator: Locator) => async () =>
  JSON.stringify({
    ariaChecked: await locator.getAttribute('aria-checked'),
    nativeChecked: await locator.evaluate(element =>
      element instanceof HTMLInputElement ? element.checked : null,
    ),
  });

const attributeState = (locator: Locator, name: string) => async () =>
  JSON.stringify({value: await locator.getAttribute(name)});

const MATRIX: MatrixCase[] = [
  {
    component: 'checkbox-input',
    storyId: 'core-checkboxinput--pressed-state',
    mount: root => {
      const target = root.getByRole('checkbox', {
        name: 'Unchecked — press and hold',
      });
      const disabledTarget = root.getByRole('checkbox', {
        name: 'Disabled — no pressed state',
      });
      const surfaces = root.locator('.astryx-checkbox-indicator');
      return {
        target,
        surfaces: {indicator: surfaces.nth(0)},
        state: checkedState(target),
        disabledTarget,
        disabledSurfaces: {indicator: surfaces.nth(2)},
        disabledState: checkedState(disabledTarget),
      };
    },
  },
  {
    component: 'collapsible',
    storyId: 'core-collapsible--pressed-state',
    mount: root => {
      const target = root.getByRole('button', {
        name: 'Details — press and hold',
      });
      const disabledTarget = root.getByRole('button', {
        name: 'Unavailable — no pressed state',
      });
      return {
        target,
        surfaces: {trigger: target},
        state: attributeState(target, 'aria-expanded'),
        disabledTarget,
        disabledSurfaces: {trigger: disabledTarget},
        disabledState: attributeState(disabledTarget, 'aria-expanded'),
      };
    },
  },
  {
    component: 'link',
    storyId: 'core-link--pressed-state',
    mount: root => {
      const target = root.getByRole('link', {
        name: 'documentation — press and hold',
      });
      const disabledTarget = root.locator('a[aria-disabled="true"]', {
        hasText: 'Unavailable — no pressed state',
      });
      return {
        target,
        surfaces: {text: target},
        state: attributeState(target, 'href'),
        disabledTarget,
        disabledSurfaces: {text: disabledTarget},
        disabledState: attributeState(disabledTarget, 'href'),
      };
    },
  },
  {
    component: 'slider',
    storyId: 'core-slider--pressed-state',
    releaseInPlace: true,
    mount: root => {
      const target = root.getByRole('slider', {
        name: 'Volume — press and drag',
      });
      const disabledTarget = root.getByRole('slider', {
        name: 'Unavailable — no pressed state',
      });
      return {
        target,
        surfaces: {thumb: target},
        state: attributeState(target, 'aria-valuenow'),
        disabledTarget,
        disabledSurfaces: {thumb: disabledTarget},
        disabledState: attributeState(disabledTarget, 'aria-valuenow'),
      };
    },
  },
  {
    component: 'switch',
    storyId: 'core-switch--pressed-state',
    mount: root => {
      const target = root.getByRole('switch', {name: 'Off — press and hold'});
      const disabledTarget = root.getByRole('switch', {
        name: 'Disabled — no pressed state',
      });
      const tracks = root.locator('.astryx-switch');
      const thumbs = root.locator('.astryx-switch-thumb');
      return {
        target,
        surfaces: {track: tracks.nth(0), thumb: thumbs.nth(0)},
        state: checkedState(target),
        disabledTarget,
        disabledSurfaces: {track: tracks.nth(2), thumb: thumbs.nth(2)},
        disabledState: checkedState(disabledTarget),
      };
    },
  },
  {
    component: 'tab',
    storyId: 'core-tablist--pressed-state',
    mount: root => {
      const target = root.getByRole('button', {
        name: 'Projects — press and hold',
      });
      const disabledTarget = root.getByRole('button', {
        name: 'Unavailable — no pressed state',
      });
      return {
        target,
        surfaces: {
          surface: target.locator('span[aria-hidden="true"]').first(),
        },
        state: attributeState(target, 'aria-current'),
        disabledTarget,
        disabledSurfaces: {
          surface: disabledTarget.locator('span[aria-hidden="true"]').first(),
        },
        disabledState: attributeState(disabledTarget, 'aria-current'),
      };
    },
  },
  {
    component: 'radio-list',
    storyId: 'core-radiolist--pressed-state',
    mount: root => {
      const radio = root.getByRole('radio', {name: 'SMS — press and hold'});
      const target = root.getByTestId('radio-row-press-target');
      const disabledTarget = root.getByRole('radio', {
        name: 'Push — disabled, no pressed state',
      });
      const independentTarget = root.getByRole('link', {
        name: 'Details — independent link',
      });
      const surfaces = root.locator('.astryx-radio-indicator');
      return {
        target,
        surfaces: {indicator: surfaces.nth(1)},
        state: checkedState(radio),
        disabledTarget,
        disabledSurfaces: {indicator: surfaces.nth(2)},
        disabledState: checkedState(disabledTarget),
        independentTarget,
        independentSurfaces: {indicator: surfaces.nth(1)},
        independentState: checkedState(radio),
        independentActivated: async () =>
          root.page().url().endsWith('#details'),
      };
    },
  },
  {
    component: 'segmented-control',
    storyId: 'core-segmentedcontrol--pressed-state',
    mount: root => {
      const target = root.getByRole('radio', {
        name: 'List — press and hold',
      });
      const disabledTarget = root.getByRole('radio', {
        name: 'Unavailable — no pressed state',
      });
      const selectedTarget = root.getByRole('radio', {
        name: 'Grid — selected',
      });
      return {
        target,
        surfaces: {item: target},
        state: checkedState(target),
        disabledTarget,
        disabledSurfaces: {item: disabledTarget},
        disabledState: checkedState(disabledTarget),
        selectedTarget,
        selectedSurfaces: {item: selectedTarget},
        selectedState: checkedState(selectedTarget),
      };
    },
  },
];

async function settle(page: Page): Promise<void> {
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
  );
}

async function focusForComparison(target: Locator): Promise<void> {
  await target.evaluate(element => {
    if (element instanceof HTMLElement) {
      element.focus({preventScroll: true});
    }
  });
}

async function pointerCenter(
  locator: Locator,
): Promise<{x: number; y: number}> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('pointer target has no rendered bounds');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

async function capture(
  locator: Locator,
  component: string,
  surface: string,
  state: string,
): Promise<{bytes: Buffer; shot: Shot}> {
  await locator.waitFor({state: 'visible'});
  const bytes = await locator.screenshot({animations: 'disabled'});
  const png = PNG.sync.read(bytes);
  const file = `${component}-${surface}-${state}.png`;
  fs.writeFileSync(path.join(OUTPUT, file), bytes);
  return {
    bytes,
    shot: {
      file,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      width: png.width,
      height: png.height,
    },
  };
}

async function captureSurfaces(
  locators: Record<string, Locator>,
  component: string,
  state: string,
  shots: Record<string, Shot>,
): Promise<Record<string, Buffer>> {
  const buffers: Record<string, Buffer> = {};
  for (const [surface, locator] of Object.entries(locators)) {
    const captured = await capture(locator, component, surface, state);
    buffers[surface] = captured.bytes;
    shots[`${surface}-${state}`] = captured.shot;
  }
  return buffers;
}

function diffPixels(before: Buffer, after: Buffer, file: string): number {
  const beforePng = PNG.sync.read(before);
  const afterPng = PNG.sync.read(after);
  if (
    beforePng.width !== afterPng.width ||
    beforePng.height !== afterPng.height
  ) {
    throw new Error(`${file}: surface dimensions changed`);
  }
  const diff = new PNG({width: beforePng.width, height: beforePng.height});
  const count = pixelmatch(
    beforePng.data,
    afterPng.data,
    diff.data,
    beforePng.width,
    beforePng.height,
    {threshold: 0.01, includeAA: true, alpha: 0.2},
  );
  fs.writeFileSync(path.join(OUTPUT, file), PNG.sync.write(diff));
  return count;
}

async function press(page: Page, target: Locator): Promise<void> {
  const point = await pointerCenter(target);
  await page.mouse.move(point.x, point.y);
  await settle(page);
  await page.mouse.down();
  await settle(page);
}

async function releaseAway(page: Page): Promise<void> {
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await settle(page);
}

test('a range Slider keeps the pressed overlay on only the track-selected thumb throughout a drag', async ({
  page,
}) => {
  test.setTimeout(2 * 60 * 1000);
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-slider--pressed-state&viewMode=story`,
    {waitUntil: 'load'},
  );
  await holdMotionStill(page);

  const root = page.locator('#storybook-root');
  const range = root.getByRole('group', {
    name: 'Price range — only the dragged thumb presses',
  });
  const thumbs = range.getByRole('slider');
  const start = thumbs.nth(0);
  const end = thumbs.nth(1);
  await end.waitFor({state: 'visible'});

  const result: Result = {
    component: 'slider-range',
    storyId: 'core-slider--pressed-state',
    shots: {},
    comparisons: [],
  };
  results.push(result);

  await page.mouse.move(1, 1);
  await settle(page);
  const rest = await captureSurfaces(
    {start, end},
    'slider-range',
    'rest',
    result.shots,
  );
  const startValue = await start.getAttribute('aria-valuenow');
  const endValue = await end.getAttribute('aria-valuenow');

  const box = await range.boundingBox();
  const startBox = await start.boundingBox();
  const endBox = await end.boundingBox();
  if (box == null || startBox == null || endBox == null) {
    throw new Error('range Slider has no rendered drag geometry');
  }
  const dragStart = {
    x: box.x + box.width * 0.65,
    y: box.y + box.height / 2,
  };
  const isInside = (
    point: {x: number; y: number},
    rect: {x: number; y: number; width: number; height: number},
  ) =>
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height;
  expect(isInside(dragStart, startBox)).toBe(false);
  expect(isInside(dragStart, endBox)).toBe(false);

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await settle(page);
  await page.mouse.move(box.x + box.width * 0.6, dragStart.y);
  await settle(page);
  const dragged = await captureSurfaces(
    {start, end},
    'slider-range',
    'dragged',
    result.shots,
  );

  const startDiff = diffPixels(
    rest.start,
    dragged.start,
    'slider-range-start-stable-diff.png',
  );
  expect(startDiff).toBe(0);
  expect(await start.getAttribute('aria-valuenow')).toBe(startValue);
  expect(await end.getAttribute('aria-valuenow')).not.toBe(endValue);
  const draggedEndValue = await end.getAttribute('aria-valuenow');

  // Release without moving the pointer so the comparison keeps the same thumb
  // value, geometry, hover, and focus. The remaining changed pixels are the
  // pressed overlay that persisted through the drag.
  await page.mouse.up();
  await settle(page);
  const hoverAfterDrag = await captureSurfaces(
    {end},
    'slider-range',
    'hover-after-drag',
    result.shots,
  );
  const endDiff = diffPixels(
    hoverAfterDrag.end,
    dragged.end,
    'slider-range-end-pressed-diff.png',
  );
  expect(endDiff).toBeGreaterThan(0);
  expect(await end.getAttribute('aria-valuenow')).toBe(draggedEndValue);

  await page.mouse.move(1, 1);
  await settle(page);
  const released = await captureSurfaces(
    {end},
    'slider-range',
    'released',
    result.shots,
  );
  await page.mouse.move(box.x + box.width * 0.6, dragStart.y);
  await settle(page);
  await page.mouse.move(1, 1);
  await settle(page);
  const settled = await captureSurfaces(
    {end},
    'slider-range',
    'rest-after-release',
    result.shots,
  );
  const releasedDiff = diffPixels(
    settled.end,
    released.end,
    'slider-range-end-released-diff.png',
  );
  expect(releasedDiff).toBe(0);

  result.comparisons.push(
    {
      surface: 'dragged-end-thumb',
      pressedDiffPixels: endDiff,
      releasedDiffPixels: releasedDiff,
      disabledDiffPixels: 0,
    },
    {
      surface: 'stationary-start-thumb',
      pressedDiffPixels: startDiff,
      releasedDiffPixels: 0,
      disabledDiffPixels: 0,
    },
  );
});

test('the bounded pressed matrix paints only enabled transient surfaces', async ({
  page,
}) => {
  test.setTimeout(5 * 60 * 1000);
  browserVersion = page.context().browser()?.version() ?? 'unknown';
  viewport = page.viewportSize();
  const failures: string[] = [];

  for (const entry of MATRIX) {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${entry.storyId}&viewMode=story`,
      {waitUntil: 'load'},
    );
    await holdMotionStill(page);
    const mounted = entry.mount(page.locator('#storybook-root'));
    await mounted.target.waitFor({state: 'visible'});

    const result: Result = {
      component: entry.component,
      storyId: entry.storyId,
      shots: {},
      comparisons: [],
    };
    results.push(result);

    const initialState = await mounted.state();

    // Prime each target with a canceled pointer cycle before collecting the
    // baseline. That leaves focus and input modality in the same pointer-owned
    // state used by the measured press, so focus pixels cannot masquerade as
    // pressed feedback.
    await press(page, mounted.target);
    if (entry.releaseInPlace) {
      await page.mouse.up();
      await page.mouse.move(1, 1);
      await settle(page);
    } else {
      await releaseAway(page);
    }
    if ((await mounted.state()) !== initialState) {
      failures.push(`${entry.component}: priming press activated the control`);
    }

    await captureSurfaces(
      mounted.surfaces,
      entry.component,
      'rest',
      result.shots,
    );

    const point = await pointerCenter(mounted.target);
    await page.mouse.move(point.x, point.y);
    await settle(page);
    const hover = await captureSurfaces(
      mounted.surfaces,
      entry.component,
      'hover',
      result.shots,
    );
    await page.mouse.down();
    await settle(page);
    const pressed = await captureSurfaces(
      mounted.surfaces,
      entry.component,
      'pressed',
      result.shots,
    );
    if (entry.releaseInPlace) {
      await page.mouse.up();
      await page.mouse.move(1, 1);
      await settle(page);
    } else {
      await releaseAway(page);
    }
    const released = await captureSurfaces(
      mounted.surfaces,
      entry.component,
      'released',
      result.shots,
    );
    // Revisit hover, then rest, without another press. This makes the release
    // comparison share the same pointer-owned focus state as the released shot.
    await page.mouse.move(point.x, point.y);
    await settle(page);
    await page.mouse.move(1, 1);
    await settle(page);
    const settledRest = await captureSurfaces(
      mounted.surfaces,
      entry.component,
      'rest-after-release',
      result.shots,
    );

    for (const surface of Object.keys(mounted.surfaces)) {
      const pressedCount = diffPixels(
        hover[surface],
        pressed[surface],
        `${entry.component}-${surface}-pressed-diff.png`,
      );
      const releasedCount = diffPixels(
        settledRest[surface],
        released[surface],
        `${entry.component}-${surface}-released-diff.png`,
      );
      if (pressedCount === 0) {
        failures.push(
          `${entry.component} ${surface}: held pointer changed no pixels beyond hover`,
        );
      }
      if (releasedCount !== 0) {
        failures.push(
          `${entry.component} ${surface}: release left ${releasedCount} pixels changed`,
        );
      }
      result.comparisons.push({
        surface,
        pressedDiffPixels: pressedCount,
        releasedDiffPixels: releasedCount,
        disabledDiffPixels: 0,
      });
    }
    if ((await mounted.state()) !== initialState) {
      failures.push(`${entry.component}: canceled press activated the control`);
    }

    await page.mouse.move(1, 1);
    await focusForComparison(mounted.disabledTarget);
    await settle(page);
    const disabledRest = await captureSurfaces(
      mounted.disabledSurfaces,
      entry.component,
      'disabled-rest',
      result.shots,
    );
    const disabledState = await mounted.disabledState();
    await press(page, mounted.disabledTarget);
    const disabledPressed = await captureSurfaces(
      mounted.disabledSurfaces,
      entry.component,
      'disabled-pressed',
      result.shots,
    );
    await page.mouse.up();
    await settle(page);
    for (const surface of Object.keys(mounted.disabledSurfaces)) {
      const count = diffPixels(
        disabledRest[surface],
        disabledPressed[surface],
        `${entry.component}-${surface}-disabled-diff.png`,
      );
      if (count !== 0) {
        failures.push(
          `${entry.component} ${surface}: disabled hold changed ${count} pixels`,
        );
      }
      const comparison = result.comparisons.find(
        item => item.surface === surface,
      );
      if (comparison != null) {
        comparison.disabledDiffPixels = count;
      }
    }
    if ((await mounted.disabledState()) !== disabledState) {
      failures.push(`${entry.component}: disabled press activated the control`);
    }

    if (
      mounted.independentTarget != null &&
      mounted.independentSurfaces != null &&
      mounted.independentState != null
    ) {
      await page.mouse.move(1, 1);
      await focusForComparison(mounted.independentTarget);
      const independentPoint = await pointerCenter(mounted.independentTarget);
      await page.mouse.move(independentPoint.x, independentPoint.y);
      await settle(page);
      const independentHover = await captureSurfaces(
        mounted.independentSurfaces,
        entry.component,
        'independent-hover',
        result.shots,
      );
      const independentState = await mounted.independentState();
      await page.mouse.down();
      await settle(page);
      const independentPressed = await captureSurfaces(
        mounted.independentSurfaces,
        entry.component,
        'independent-pressed',
        result.shots,
      );
      await page.mouse.up();
      await settle(page);
      for (const surface of Object.keys(mounted.independentSurfaces)) {
        const count = diffPixels(
          independentHover[surface],
          independentPressed[surface],
          `${entry.component}-${surface}-independent-diff.png`,
        );
        if (count !== 0) {
          failures.push(
            `${entry.component} ${surface}: nested action hold changed ${count} pixels`,
          );
        }
        const comparison = result.comparisons.find(
          item => item.surface === surface,
        );
        if (comparison != null) {
          comparison.independentDiffPixels = count;
        }
      }
      if ((await mounted.independentState()) !== independentState) {
        failures.push(
          `${entry.component}: nested action changed control state`,
        );
      }
      if (
        mounted.independentActivated != null &&
        !(await mounted.independentActivated())
      ) {
        failures.push(`${entry.component}: nested action did not activate`);
      }
    }

    if (
      mounted.selectedTarget != null &&
      mounted.selectedSurfaces != null &&
      mounted.selectedState != null
    ) {
      await page.mouse.move(1, 1);
      await focusForComparison(mounted.selectedTarget);
      await settle(page);
      const selectedRest = await captureSurfaces(
        mounted.selectedSurfaces,
        entry.component,
        'selected-rest',
        result.shots,
      );
      const selectedState = await mounted.selectedState();
      await press(page, mounted.selectedTarget);
      const selectedPressed = await captureSurfaces(
        mounted.selectedSurfaces,
        entry.component,
        'selected-pressed',
        result.shots,
      );
      await releaseAway(page);
      for (const surface of Object.keys(mounted.selectedSurfaces)) {
        const count = diffPixels(
          selectedRest[surface],
          selectedPressed[surface],
          `${entry.component}-${surface}-selected-diff.png`,
        );
        if (count !== 0) {
          failures.push(
            `${entry.component} ${surface}: selected hold changed ${count} pixels`,
          );
        }
        const comparison = result.comparisons.find(
          item => item.surface === surface,
        );
        if (comparison != null) {
          comparison.selectedDiffPixels = count;
        }
      }
      if ((await mounted.selectedState()) !== selectedState) {
        failures.push(`${entry.component}: selected exception changed state`);
      }
    }
  }

  expect(failures).toEqual([]);
});
