// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file NestedControlPress.a11y.chromium.spec.ts
 * @input The Nested Control Press story in a built Storybook (a layered
 *   stylesheet), a real mouse, a pen and a finger through CDP
 * @output Real-engine proof of the press rule for every container: a press on
 *   a nested control leaves the container as it was under the pointer, for a
 *   mouse, a pen and a finger; a mouse press on the container's own surface
 *   paints the container; a held Space key on a control or on a container's
 *   action paints its press until the key is released
 * @position Run with `pnpm test:a11y-contract`. Browser layer of
 *   cancelNestedPress (hooks/useClickableContainer.ts); the jsdom layer is
 *   __tests__/nestedControlPress.test.tsx.
 */

import {
  expect,
  test,
  type Browser,
  type CDPSession,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
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

const STORY = 'core-nested-control-press--containers';

/** A phone: touch screen, primary pointer coarse. */
const PHONE = {
  viewport: {width: 402, height: 900},
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
} as const;

/** A mouse and a fine pointer: the `:active` path. */
const DESKTOP = {
  viewport: {width: 800, height: 900},
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
} as const;

type RGB = [number, number, number];
type Point = {x: number; y: number};
type Box = {x: number; y: number; width: number; height: number};

interface Container {
  name: string;
  /** The story's wrapper test id. */
  id: string;
  /** The element that paints the container's press. */
  selector: string;
  /** The nested control's accessible name. */
  nested: RegExp;
  /** The container's own action, which takes keyboard focus. */
  action: {role: 'button' | 'checkbox' | 'radio'; name: RegExp};
  /** Where to read the container's paint: clear of its content. */
  sample: (box: Box) => Point;
}

const CONTAINERS: Container[] = [
  {
    name: 'ClickableCard',
    action: {role: 'button', name: /^Open billing$/},
    id: 'clickable-card',
    selector: '[data-pressable-container]',
    nested: /^Nested$/,
    sample: box => ({x: box.x + box.width - 24, y: box.y + 8}),
  },
  {
    name: 'SelectableCard',
    action: {role: 'checkbox', name: /^Plan$/},
    id: 'selectable-card',
    selector: '[data-pressable-container]',
    nested: /^Nested$/,
    sample: box => ({x: box.x + box.width - 24, y: box.y + 8}),
  },
  {
    name: 'Item',
    action: {role: 'button', name: /^Open row$/},
    id: 'item',
    selector: '.astryx-item',
    nested: /^Nested$/,
    sample: box => ({x: box.x + box.width * 0.55, y: box.y + 3}),
  },
  {
    name: 'TreeList row',
    action: {role: 'button', name: /Open tree row/},
    id: 'tree-list',
    selector: '.astryx-tree-list-item',
    nested: /^Nested$/,
    sample: box => ({x: box.x + box.width * 0.55, y: box.y + 3}),
  },
  {
    name: 'Token',
    action: {role: 'button', name: /^Filter token$/},
    id: 'token',
    selector: '.astryx-token',
    nested: /remove/i,
    sample: box => ({x: box.x + box.width * 0.4, y: box.y + 2}),
  },
];

interface Opened {
  page: Page;
  /** The container's own action. */
  action: ReturnType<Page['getByRole']>;
  cdp: CDPSession;
  close: () => Promise<void>;
  nested: Point;
  sample: Point;
}

async function open(
  browser: Browser,
  device: typeof PHONE | typeof DESKTOP,
  container: Container,
): Promise<Opened> {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  await page.route(
    url => url.origin !== storybook.origin,
    async route => route.abort(),
  );
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  const scope = page.getByTestId(container.id);
  const element = scope.locator(container.selector).first();
  await element.waitFor();
  // The press is the subject, not the activation.
  await page.evaluate(() => {
    document.addEventListener('click', event => event.preventDefault(), true);
  });
  const box = await element.boundingBox();
  const nestedBox = await scope
    .getByRole('button', {name: container.nested})
    .boundingBox();
  if (box == null || nestedBox == null) {
    throw new Error(`${container.name} rendered no box`);
  }
  await page.mouse.move(1, 1);
  return {
    page,
    action: scope.getByRole(container.action.role, {
      name: container.action.name,
    }),
    cdp: await context.newCDPSession(page),
    close: async () => context.close(),
    nested: {
      x: nestedBox.x + nestedBox.width / 2,
      y: nestedBox.y + nestedBox.height / 2,
    },
    sample: container.sample(box),
  };
}

/** The mean colour of a 2 × 2 CSS px patch, as presented. */
async function pixel(page: Page, at: Point): Promise<RGB> {
  const png = PNG.sync.read(
    await page.screenshot({
      clip: {
        x: Math.round(at.x) - 1,
        y: Math.round(at.y) - 1,
        width: 2,
        height: 2,
      },
      animations: 'allow',
      caret: 'hide',
    }),
  );
  const sum = [0, 0, 0];
  const count = png.width * png.height;
  for (let i = 0; i < count; i++) {
    sum[0] += png.data[i * 4];
    sum[1] += png.data[i * 4 + 1];
    sum[2] += png.data[i * 4 + 2];
  }
  return sum.map(value => Math.round(value / count)) as RGB;
}

/** The pixel once two reads 50 ms apart agree (transitions finished). */
async function steadyPixel(page: Page, at: Point): Promise<RGB> {
  let last = await pixel(page, at);
  for (let tries = 0; tries < 40; tries++) {
    await page.waitForTimeout(50);
    const next = await pixel(page, at);
    if (next.every((value, channel) => value === last[channel])) {
      return next;
    }
    last = next;
  }
  return last;
}

function expectSameColour(actual: RGB, expected: RGB): void {
  for (let channel = 0; channel < 3; channel++) {
    expect(
      Math.abs(actual[channel] - expected[channel]),
      `${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`,
    ).toBeLessThanOrEqual(2);
  }
}

function expectOtherColour(actual: RGB, expected: RGB): void {
  expect(
    Math.max(
      ...actual.map((value, channel) => Math.abs(value - expected[channel])),
    ),
    `${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`,
  ).toBeGreaterThan(2);
}

async function pen(
  opened: Opened,
  type: 'mouseMoved' | 'mousePressed' | 'mouseReleased',
  at: Point,
): Promise<void> {
  await opened.cdp.send('Input.dispatchMouseEvent', {
    type,
    x: at.x,
    y: at.y,
    button: type === 'mouseMoved' ? 'none' : 'left',
    buttons: type === 'mousePressed' ? 1 : 0,
    clickCount: type === 'mouseMoved' ? 0 : 1,
    pointerType: 'pen',
  });
}

for (const container of CONTAINERS) {
  test(`${container.name}: a mouse press on a nested control leaves the container as it was under the pointer`, async ({
    browser,
  }) => {
    const opened = await open(browser, DESKTOP, container);
    try {
      const {page} = opened;
      await page.mouse.move(opened.nested.x, opened.nested.y);
      const rest = await steadyPixel(page, opened.sample);
      await page.mouse.down();
      expectSameColour(await steadyPixel(page, opened.sample), rest);
      await page.mouse.up();
    } finally {
      await opened.close();
    }
  });

  test(`${container.name}: a pen press on a nested control leaves the container as it was under the pointer`, async ({
    browser,
  }) => {
    const opened = await open(browser, DESKTOP, container);
    try {
      await pen(opened, 'mouseMoved', opened.nested);
      const rest = await steadyPixel(opened.page, opened.sample);
      await pen(opened, 'mousePressed', opened.nested);
      expectSameColour(await steadyPixel(opened.page, opened.sample), rest);
      await pen(opened, 'mouseReleased', opened.nested);
    } finally {
      await opened.close();
    }
  });

  test(`${container.name}: a finger press on a nested control paints no press on the container`, async ({
    browser,
  }) => {
    const opened = await open(browser, PHONE, container);
    try {
      const rest = await steadyPixel(opened.page, opened.sample);
      await opened.cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{x: opened.nested.x, y: opened.nested.y, id: 1}],
      });
      await opened.page.waitForTimeout(250);
      expectSameColour(await steadyPixel(opened.page, opened.sample), rest);
      await opened.cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    } finally {
      await opened.close();
    }
  });

  test(`${container.name}: a mouse press on its own surface paints the container`, async ({
    browser,
  }) => {
    const opened = await open(browser, DESKTOP, container);
    try {
      const {page} = opened;
      await page.mouse.move(opened.sample.x, opened.sample.y);
      const hovered = await steadyPixel(page, opened.sample);
      await page.mouse.down();
      expectOtherColour(await steadyPixel(page, opened.sample), hovered);
      await page.mouse.up();
    } finally {
      await opened.close();
    }
  });

  test(`${container.name}: a held Space key on its action paints the container until the release`, async ({
    browser,
  }) => {
    const opened = await open(browser, DESKTOP, container);
    try {
      const {page} = opened;
      await opened.action.focus();
      const rest = await steadyPixel(page, opened.sample);
      await page.keyboard.down('Space');
      expectOtherColour(await steadyPixel(page, opened.sample), rest);
      await page.keyboard.up('Space');
      expectSameColour(await steadyPixel(page, opened.sample), rest);
    } finally {
      await opened.close();
    }
  });
}

test('Button: a held Space key paints its press until the release', async ({
  browser,
}) => {
  const context = await browser.newContext(DESKTOP);
  try {
    const page = await context.newPage();
    await page.route(
      url => url.origin !== storybook.origin,
      async route => route.abort(),
    );
    await page.goto(
      `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`,
    );
    const button = page
      .getByTestId('button')
      .getByRole('button', {name: 'Standalone'});
    await button.waitFor();
    const box = await button.boundingBox();
    if (box == null) {
      throw new Error('the Button rendered no box');
    }
    const sample = {x: box.x + 4, y: box.y + box.height / 2};
    await page.mouse.move(1, 1);
    await button.focus();
    const rest = await steadyPixel(page, sample);
    await page.keyboard.down('Space');
    expectOtherColour(await steadyPixel(page, sample), rest);
    await page.keyboard.up('Space');
    expectSameColour(await steadyPixel(page, sample), rest);
  } finally {
    await context.close();
  }
});
