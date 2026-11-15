// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayerEntranceSide.interaction.browser.spec.ts
 * @input The Core stories of the components that play `layerAnimations`.
 *   Each story is pinned to an edge of the viewport, so its layer has room
 *   on its requested side or must flip
 * @output Proves an anchored layer's entrance slides from, and scales about,
 *   the side it lands on after any flip. At its first frame the entrance
 *   moves the layer toward its trigger, and its origin is where the layer
 *   meets the trigger. A layer over its trigger (a Selector's list over its
 *   selected item) does not move, and scales about the trigger's center
 * @position Interaction proofs for layerEntranceSide.ts and
 *   layerAnimations.stylex.ts, in Chromium and WebKit
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  armHold,
  openStory,
  releaseAnimations,
  seekAnimations,
  waitForRest,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// A desktop page: on a phone, a Popover plays its own growth in place of the
// CSS entrance.
test.use({
  viewport: {width: 1280, height: 800},
  isMobile: false,
  hasTouch: false,
});

type Side = 'above' | 'below' | 'left' | 'right';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface EntranceRoute {
  readonly name: string;
  readonly story: string;
  /** The side the component asks for, in this left-to-right story. */
  readonly requested: Side;
  /** The layer, when it is in the page before it opens. */
  readonly layer: (page: Page) => Locator;
  readonly layerIsMountedClosed: boolean;
  /** The entrance plays on the layer itself, not on its surface. */
  readonly playsOnLayer: boolean;
  /** Opens the layer. Returns the box of what the layer is anchored to. */
  readonly open: (page: Page, flipped: boolean) => Promise<Box>;
  /** Runs before the hold is armed. */
  readonly prepare?: (page: Page) => Promise<void>;
  /** The layer opens over its trigger, on no side. */
  readonly overTrigger?: boolean;
}

const anchoredLayer = (page: Page) =>
  page.locator('[popover][data-layer-anchored]');

const layerOf = (locator: Locator) =>
  locator.locator('xpath=ancestor::*[@popover][1]');

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('The trigger has no box.');
  }
  return box;
}

async function click(page: Page, trigger: Locator): Promise<Box> {
  const box = await boxOf(trigger);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return box;
}

async function hover(page: Page, trigger: Locator): Promise<Box> {
  const box = await boxOf(trigger);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  return box;
}

const routes: ReadonlyArray<EntranceRoute> = [
  {
    name: 'Popover',
    story: 'core-popover--default',
    requested: 'below',
    layer: anchoredLayer,
    layerIsMountedClosed: true,
    playsOnLayer: false,
    open: async page =>
      click(page, page.getByRole('button', {name: 'Settings'})),
  },
  {
    name: 'DropdownMenu',
    story: 'core-dropdownmenu--default',
    requested: 'below',
    layer: anchoredLayer,
    layerIsMountedClosed: true,
    playsOnLayer: false,
    open: async page =>
      click(page, page.getByRole('button', {name: 'Actions'})),
  },
  {
    name: 'Selector',
    story: 'core-selector--default',
    requested: 'below',
    layer: anchoredLayer,
    layerIsMountedClosed: true,
    playsOnLayer: false,
    // Its list puts the selected option over the trigger, kept in the
    // viewport.
    overTrigger: true,
    open: async page =>
      click(page, page.locator('button[aria-haspopup="listbox"]').first()),
  },
  {
    name: 'A Selector with a placement',
    story: 'core-selector--placement-above',
    requested: 'above',
    layer: anchoredLayer,
    layerIsMountedClosed: true,
    playsOnLayer: false,
    open: async page =>
      click(page, page.locator('button[aria-haspopup="listbox"]').first()),
  },
  {
    name: 'ComplexSelector',
    story: 'core-complexselector--fruit-ripeness-grid',
    requested: 'below',
    layer: anchoredLayer,
    layerIsMountedClosed: true,
    playsOnLayer: false,
    open: async page =>
      click(
        page,
        page.locator('#storybook-root button[aria-haspopup]').first(),
      ),
  },
  {
    name: 'A Breadcrumbs menu crumb',
    story: 'core-breadcrumbs--menu-crumb',
    requested: 'below',
    layer: anchoredLayer,
    layerIsMountedClosed: true,
    playsOnLayer: false,
    open: async page =>
      click(
        page,
        page.locator('#storybook-root button[aria-haspopup]').first(),
      ),
  },
  {
    name: 'ContextMenu',
    story: 'core-contextmenu--default',
    requested: 'below',
    layer: anchoredLayer,
    layerIsMountedClosed: false,
    playsOnLayer: true,
    // The menu is anchored to the point under the pointer. Near the bottom of
    // the area there is no room below that point.
    open: async (page, flipped) => {
      const area = await boxOf(
        page
          .locator('#storybook-root')
          .getByText('Right-click', {exact: false})
          .first(),
      );
      const point = {
        x: area.x + 16,
        y: flipped ? area.y + area.height - 4 : area.y + area.height / 2,
      };
      await page.mouse.click(point.x, point.y, {button: 'right'});
      return {...point, width: 0, height: 0};
    },
  },
  {
    name: 'Tooltip',
    story: 'core-tooltip--default',
    requested: 'above',
    layer: anchoredLayer,
    layerIsMountedClosed: true,
    playsOnLayer: true,
    open: async page =>
      hover(page, page.getByRole('button', {name: 'Hover me'})),
  },
  {
    name: 'HoverCard',
    story: 'core-hovercard--default',
    requested: 'above',
    layer: anchoredLayer,
    layerIsMountedClosed: false,
    playsOnLayer: true,
    open: async page =>
      hover(
        page,
        page
          .locator(
            '#storybook-root a, #storybook-root button, #storybook-root [tabindex="0"]',
          )
          .first(),
      ),
  },
  {
    name: 'A DropdownMenu submenu',
    story: 'core-dropdownmenu--submenu',
    requested: 'right',
    // The submenu's layer is inside the root menu's layer.
    layer: page => layerOf(page.getByRole('menuitem', {name: 'Folder A'})),
    layerIsMountedClosed: false,
    playsOnLayer: false,
    // The root menu opens and its own entrance ends first. The row takes focus
    // and its highlight ends before the hold. A key opens the submenu: a
    // pointer would start the row's hover first, and the hold would take it.
    prepare: async page => {
      await page.getByRole('button', {name: 'Actions'}).click();
      const row = page.getByRole('menuitem', {name: 'Move to'});
      await expect(row).toBeVisible();
      await waitForRest(layerOf(row));
      await row.focus();
      await waitForRest(row);
    },
    open: async page => {
      const box = await boxOf(page.getByRole('menuitem', {name: 'Move to'}));
      await page.keyboard.press('ArrowRight');
      return box;
    },
  },
];

const FLIPPED: Record<Side, Side> = {
  above: 'below',
  below: 'above',
  left: 'right',
  right: 'left',
};

/**
 * Pins the story against the viewport edge on its requested side, where the
 * layer then has no room. Otherwise it pins the story in the middle, with
 * room on every side. The components are unchanged.
 */
async function pinStory(
  page: Page,
  requested: Side,
  flipped: boolean,
): Promise<void> {
  const edge = !flipped
    ? 'top: 300px; left: 400px;'
    : requested === 'below'
      ? 'bottom: 12px; left: 400px;'
      : requested === 'above'
        ? 'top: 12px; left: 400px;'
        : requested === 'right'
          ? 'top: 12px; right: 12px;'
          : 'top: 12px; left: 12px;';
  await page.addStyleTag({
    content: `#storybook-root { position: fixed !important; inset: auto; margin: 0 !important; ${edge} }`,
  });
}

/**
 * Makes the entrance of every layer that opens from now on last 10 s. On a
 * loaded runner WebKit can present no frame for longer than the entrance,
 * which then ends before the hold looks. Its first frame and its end do not
 * depend on its length. A layer already open keeps its length: a longer one
 * would make its ended entrance play again.
 */
async function lengthenEntrance(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const layer of document.querySelectorAll('[popover]')) {
      if (layer.matches(':popover-open')) {
        layer.setAttribute('data-entrance-ended', '');
      }
    }
  });
  const opening = '[popover]:not([data-entrance-ended])';
  await page.addStyleTag({
    content: `${opening}, ${opening} > * { animation-duration: 10s !important; }`,
  });
}

/** Where a settled layer sits against what it is anchored to. */
function sideOf(layer: Box, anchor: Box): Side | 'over' {
  const centerX = anchor.x + anchor.width / 2;
  const centerY = anchor.y + anchor.height / 2;
  if (
    centerX > layer.x &&
    centerX < layer.x + layer.width &&
    centerY > layer.y &&
    centerY < layer.y + layer.height
  ) {
    return 'over';
  }
  if (layer.y + layer.height <= anchor.y + 1) {
    return 'above';
  }
  if (layer.y >= anchor.y + anchor.height - 1) {
    return 'below';
  }
  if (layer.x + layer.width <= anchor.x + 1) {
    return 'left';
  }
  if (layer.x >= anchor.x + anchor.width - 1) {
    return 'right';
  }
  return 'over';
}

interface FirstFrame {
  readonly onLayer: boolean;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly x: number;
  readonly y: number;
  readonly originX: number;
  readonly originY: number;
}

/**
 * The entrance's frame as the page holds it: its transform and origin. The
 * entrance plays on the layer or on the layer's only child (its surface).
 */
async function readFrame(layer: Locator): Promise<FirstFrame | null> {
  return layer.evaluate(element => {
    const candidates = [element, element.firstElementChild];
    const animated = candidates.find(
      node =>
        node instanceof HTMLElement &&
        getComputedStyle(node).transform !== 'none',
    );
    if (!(animated instanceof HTMLElement)) {
      return null;
    }
    const style = getComputedStyle(animated);
    const matrix = new DOMMatrixReadOnly(style.transform);
    const [originX, originY] = style.transformOrigin
      .split(' ')
      .map(value => parseFloat(value));
    return {
      onLayer: animated === element,
      scaleX: matrix.a,
      scaleY: matrix.d,
      x: matrix.e,
      y: matrix.f,
      originX,
      originY,
    };
  });
}

/**
 * The box of the element that `layer` is anchored to: the one whose
 * `anchor-name` is the layer's `position-anchor`. A field can be the anchor
 * of a button inside it. `null` while the layer has no anchor.
 */
async function anchorBoxOf(layer: Locator): Promise<Box | null> {
  return layer.evaluate(element => {
    const name = getComputedStyle(element)
      .getPropertyValue('position-anchor')
      .trim();
    if (!name.startsWith('--')) {
      return null;
    }
    const anchor = Array.from(element.ownerDocument.querySelectorAll('*')).find(
      node =>
        getComputedStyle(node)
          .getPropertyValue('anchor-name')
          .split(',')
          .map(value => value.trim())
          .includes(name),
    );
    if (anchor == null) {
      return null;
    }
    const rect = anchor.getBoundingClientRect();
    return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
  });
}

async function readBox(layer: Locator, onLayer: boolean): Promise<Box> {
  return layer.evaluate((element, layerItself) => {
    const node = layerItself ? element : element.firstElementChild;
    const rect = (node ?? element).getBoundingClientRect();
    return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
  }, onLayer);
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));

for (const route of routes) {
  for (const flipped of [false, true]) {
    const lands = route.overTrigger
      ? 'over'
      : flipped
        ? FLIPPED[route.requested]
        : route.requested;
    const claim =
      lands === 'over'
        ? 'the entrance does not move, and scales about the center of the trigger it covers'
        : `the entrance slides from, and scales about, the ${lands} side it lands on`;
    test(`${route.name}, ${flipped ? 'with no room on its side' : 'with room'}: ${claim}`, async ({
      page,
    }) => {
      await openStory(page, storybook(), route.story);
      await pinStory(page, route.requested, flipped);
      await route.prepare?.(page);
      await lengthenEntrance(page);
      const layer = route.layer(page);
      const hold = await armHold(
        page,
        route.layerIsMountedClosed ? layer : undefined,
        {
          judges: {
            target: route.playsOnLayer ? layer : layer.locator('xpath=./*[1]'),
            property: 'transform',
          },
          newOnly: true,
        },
      );
      const opened = await route.open(page, flipped);
      await hold.held();
      await seekAnimations(page, 0);
      const first = await readFrame(layer);
      await releaseAnimations(page, {finish: true});
      expect(
        first,
        'the entrance has a transform at its first frame',
      ).not.toBeNull();
      if (first == null) {
        return;
      }
      const box = await readBox(layer, first.onLayer);
      const anchor = (await anchorBoxOf(layer)) ?? opened;
      expect(sideOf(box, anchor), 'the side the layer lands on').toBe(lands);

      // The scale is the entrance's own.
      expect(first.scaleX).toBeCloseTo(0.95, 3);
      expect(first.scaleY).toBeCloseTo(0.95, 3);

      const centerX = clamp(anchor.x + anchor.width / 2 - box.x, box.width);
      const centerY = clamp(anchor.y + anchor.height / 2 - box.y, box.height);
      if (lands === 'over') {
        expect(Math.abs(first.x), 'no step across').toBeLessThan(0.01);
        expect(Math.abs(first.y), 'no step along').toBeLessThan(0.01);
        expect(
          Math.abs(first.originX - centerX),
          `origin x ${first.originX} vs ${centerX}`,
        ).toBeLessThan(1);
        expect(
          Math.abs(first.originY - centerY),
          `origin y ${first.originY} vs ${centerY}`,
        ).toBeLessThan(1);
        return;
      }

      // At its first frame the layer is moved toward its trigger, along the
      // axis it is placed on.
      const vertical = lands === 'above' || lands === 'below';
      const along = vertical ? first.y : first.x;
      const across = vertical ? first.x : first.y;
      const towardTrigger = lands === 'above' || lands === 'left' ? 1 : -1;
      expect(
        Math.sign(along),
        `the first frame moves the layer toward its trigger (translate ${first.x}, ${first.y})`,
      ).toBe(towardTrigger);
      expect(Math.abs(across)).toBeLessThan(0.01);

      // The origin is where the layer meets its trigger: on the edge that
      // faces the trigger, on the trigger's center line.
      const expected = {
        above: {x: centerX, y: box.height},
        below: {x: centerX, y: 0},
        left: {x: box.width, y: centerY},
        right: {x: 0, y: centerY},
      }[lands];
      expect(
        Math.abs(first.originX - expected.x),
        `origin x ${first.originX} vs ${expected.x} (box ${box.width} x ${box.height})`,
      ).toBeLessThan(1);
      expect(
        Math.abs(first.originY - expected.y),
        `origin y ${first.originY} vs ${expected.y} (box ${box.width} x ${box.height})`,
      ).toBeLessThan(1);
    });
  }
}
