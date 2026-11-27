// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonPressRowTarget.interaction.browser.spec.ts
 * @input The built press feedback story of a Button whose `::after` covers
 *   its row, real touch and mouse input (Chromium CDP / WebKit's input
 *   command), and the interaction harness
 * @output Interaction proofs that a press leaves a caller's row-wide
 *   `::after` where the caller put it. Points on the row outside the Button
 *   hit the Button at rest, while the press is on and while it fades (both
 *   engines). A press on the row tints the row as one surface. One on the
 *   Button's own box tints only the Button, in a table row's cell too. Both
 *   hold for a finger and a mouse under a coarse primary pointer and under a
 *   fine one (both engines). A tap on the line under the Button activates it
 *   once, through the engine's own tap path (both engines). A held press
 *   there does too (Chromium, which also clicks from a raw touch sequence),
 *   and so does a mouse click (both engines). A press leaves the Button's
 *   children as they were at rest. In Chromium, a finger press in a scroll
 *   view forces one layout at its start, and a press's release does no
 *   Layout or Paint per frame
 * @position Interaction evidence for privateAttributes/press.stylex.ts
 *   (`control`, `rowTint`) and the press controller (utils/pressFeedback.ts)
 *   as Button uses them
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  countBetween,
  layoutSources,
  openStory,
  tap,
  touchDriver,
  traceRendering,
  watchAnimations,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const ROW_TARGET = 'core-press-feedback-touch--button-covering-its-row';
/** Long enough that the press is on before the lift. */
const HOLD_MS = 400;

interface Point {
  x: number;
  y: number;
}

/** What a point on the row hits, and the Button's press, in one state. */
interface HitState {
  press: string | null;
  hits: boolean[];
  layer: string;
  /** Boxes in the row (left, top, width, height): the layer's, the Button's, the row's. */
  layerBox: number[];
  buttonBox: number[];
  rowBox: number[];
  transform: string;
  /** Under a fine primary pointer: the row's tint, and the Button's own. */
  rowTint: string;
  rowTintBox: number[];
  rowOpacity: string;
  ownTint: string;
}

/** The Button's children through a press, and each child the press added. */
interface ProbeSeen {
  children: string[];
  added: {
    hidden: string | null;
    text: string;
    pointerEvents: string;
    visibility: string;
    tabIndex: number;
    connected: boolean;
  }[];
  removed: number;
}

async function openRow(page: Page) {
  const row = await findRow(page);
  return {...row, driver: await touchDriver(page)};
}

/** The row's Button, and two points on the row outside the Button's box. */
async function findRow(page: Page) {
  await openStory(page, storybook(), ROW_TARGET);
  const button = page.getByRole('button', {name: 'Open the conversation'});
  const line = page.getByText('Last message a minute ago', {exact: true});
  await expect(button).toBeVisible();
  const buttonBox = await button.boundingBox();
  const lineBox = await line.boundingBox();
  const rowBox = await button.evaluate(el => {
    const row = el.parentElement?.getBoundingClientRect();
    return row == null
      ? null
      : {x: row.x, y: row.y, width: row.width, height: row.height};
  });
  if (buttonBox == null || lineBox == null || rowBox == null) {
    throw new Error(
      `${ROW_TARGET}: the row, its Button or its line has no box`,
    );
  }
  // Two points on the row outside the Button's own box: the line under the
  // Button, and the row's far corner, inside its padding.
  const probes: Point[] = [
    {
      x: Math.round(lineBox.x + lineBox.width / 2),
      y: Math.round(lineBox.y + lineBox.height / 2),
    },
    {
      x: Math.round(rowBox.x + rowBox.width - 4),
      y: Math.round(rowBox.y + rowBox.height - 4),
    },
  ];
  for (const probe of probes) {
    const inside =
      probe.x >= buttonBox.x &&
      probe.x <= buttonBox.x + buttonBox.width &&
      probe.y >= buttonBox.y &&
      probe.y <= buttonBox.y + buttonBox.height;
    expect(inside, JSON.stringify({probe, buttonBox})).toBe(false);
  }
  return {button, probes};
}

/** The center of the Button's own box. */
async function buttonCenter(button: Locator): Promise<Point> {
  const box = await button.boundingBox();
  if (box == null) {
    throw new Error(`${ROW_TARGET}: the Button has no box`);
  }
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

/** A finger held at `at`, then lifted. */
const fingerHold = (driver: TouchDriver, at: Point) => async () => {
  await driver.play(tap(at, {holdMs: HOLD_MS}));
};

/** A mouse button held at `at`, then released. */
const mouseHold = (page: Page, at: Point) => async () => {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(HOLD_MS);
  await page.mouse.up();
};

const openedCount = (page: Page) => page.getByText(/^Opened: \d+$/);

/**
 * Runs `press` at `at` and returns each state the press passed through,
 * read as its attribute changed. The read before the press is the control. At
 * rest the row is the containing block of the Button's `::after`, so the
 * row's points hit the Button.
 */
async function pressAndRead(
  page: Page,
  button: Locator,
  probes: Point[],
  at: Point,
  press: () => Promise<void>,
): Promise<{states: HitState[]; log: string}> {
  await button.evaluate((el, points) => {
    const states: HitState[] = [];
    // Each state is read at the next frame, as it paints.
    const read = (press: string | null) => {
      const layer = getComputedStyle(el, '::before');
      const button = el as HTMLElement;
      const row = button.parentElement as HTMLElement;
      const wrapper = el.querySelector(':scope > span') as HTMLElement;
      const rowTint = getComputedStyle(wrapper, '::before');
      states.push({
        press,
        hits: points.map(
          point =>
            document.elementFromPoint(point.x, point.y)?.closest('button') ===
            el,
        ),
        layer: layer.content,
        // The row is the layer's containing block and the Button's offset
        // parent, so every box reads against the row's padding edge.
        layerBox: [layer.left, layer.top, layer.width, layer.height].map(
          value => Math.round(parseFloat(value)),
        ),
        buttonBox: [
          button.offsetLeft,
          button.offsetTop,
          button.offsetWidth,
          button.offsetHeight,
        ],
        rowBox: [0, 0, row.clientWidth, row.clientHeight],
        transform: getComputedStyle(el).transform,
        rowTint: rowTint.content,
        rowTintBox: [
          rowTint.left,
          rowTint.top,
          rowTint.width,
          rowTint.height,
        ].map(value => Math.round(parseFloat(value))),
        rowOpacity: getComputedStyle(el)
          .getPropertyValue('--_press-row-opacity')
          .trim(),
        ownTint: getComputedStyle(el).backgroundImage,
      });
    };
    read(el.getAttribute('data-astryx-press'));
    new MutationObserver(() => {
      const press = el.getAttribute('data-astryx-press');
      requestAnimationFrame(() => read(press));
    }).observe(el, {
      attributes: true,
      attributeFilter: ['data-astryx-press'],
    });
    (window as unknown as {__rowTarget: HitState[]}).__rowTarget = states;
  }, probes);
  await press();
  await expect
    .poll(async () => button.getAttribute('data-astryx-press'))
    .toBeNull();
  // The read of the last change lands at the frame after it.
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  const states = await page.evaluate(
    () => (window as unknown as {__rowTarget: HitState[]}).__rowTarget,
  );
  const log = JSON.stringify({probes, at, states});
  expect(
    states.filter(state => state.press != null).map(state => state.press),
    log,
  ).toEqual(['on', 'fading']);
  // The whole row stays the tap target: before, during and after the press.
  for (const state of states) {
    expect(state.hits, log).toEqual(probes.map(() => true));
  }
  return {states: states.filter(state => state.press != null), log};
}

for (const pointer of ['finger', 'mouse'] as const) {
  test(`a ${pointer} press on the row outside the Button: the row stays the target, and the layer tints the row as one surface`, async ({
    page,
  }) => {
    const {driver, button, probes} = await openRow(page);
    const at = probes[0];
    const press =
      pointer === 'finger' ? fingerHold(driver, at) : mouseHold(page, at);
    const {states, log} = await pressAndRead(page, button, probes, at, press);
    // The row is the pressed surface: the one press layer has the row's box.
    // The Button shows no press of its own, no box tint and no scale.
    for (const state of states) {
      expect(state.layer, log).toBe('""');
      expect(state.layerBox, log).toEqual(state.rowBox);
      expect(state.transform, log).toBe('none');
      // The press layer is the row's only tint.
      expect(state.rowTint, log).not.toBe('""');
    }
  });

  test(`a ${pointer} press on the Button's own box: the row stays the target, and the layer tints only the Button`, async ({
    page,
  }) => {
    const {driver, button, probes} = await openRow(page);
    const at = await buttonCenter(button);
    const press =
      pointer === 'finger' ? fingerHold(driver, at) : mouseHold(page, at);
    const {states, log} = await pressAndRead(page, button, probes, at, press);
    // The Button is the pressed surface: its press layer has the Button's own
    // box, so the rest of the row shows no tint.
    for (const state of states) {
      expect(state.layer, log).toBe('""');
      expect(state.layerBox, log).toEqual(state.buttonBox);
    }
  });
}

for (const gesture of ['held', 'tapped'] as const) {
  test(`a finger ${gesture} on the Button's own box, on a page that scrolls, tints only the Button`, async ({
    page,
  }) => {
    const {driver, button, probes} = await openRow(page);
    // On a page that scrolls, a finger's press waits out its onset first.
    await page.evaluate(() => {
      document.body.style.minHeight = '300vh';
    });
    const at = await buttonCenter(button);
    const press =
      gesture === 'held'
        ? fingerHold(driver, at)
        : async () => {
            await driver.tap(at);
          };
    const {states, log} = await pressAndRead(page, button, probes, at, press);
    for (const state of states) {
      expect(state.layer, log).toBe('""');
      expect(state.layerBox, log).toEqual(state.buttonBox);
    }
  });
}

for (const [property, declarations, holds] of [
  ['transform', 'transform: scale(1)', true],
  ['filter', 'filter: opacity(1)', true],
  ['transform-style', 'transform-style: preserve-3d', true],
  // The ray starts at the row's centre, so the Button moves there. The press
  // reads its new box.
  ['offset-path', 'offset-path: ray(0deg); offset-rotate: 0deg', true],
  ['will-change', 'will-change: position', true],
  // Inline-size containment is not layout containment: the row still holds
  // the layers.
  ['container-type', 'container-type: inline-size', false],
] as const) {
  test(`a finger on a static Button with ${property} set tints only the Button`, async ({
    page,
  }) => {
    const {driver, button, probes} = await openRow(page);
    const kept = await button.evaluate(
      (el, [name, css]) => {
        const target = el as HTMLElement;
        const before = getComputedStyle(target).getPropertyValue(name);
        target.style.cssText += ';' + css;
        return getComputedStyle(target).getPropertyValue(name) !== before;
      },
      [property, declarations],
    );
    expect(kept, `${declarations} applies`).toBe(true);
    const at = await buttonCenter(button);
    const {states, log} = await pressAndRead(
      page,
      button,
      [at],
      at,
      fingerHold(driver, at),
    );
    expect(probes.length, log).toBeGreaterThan(0);
    // Where the Button holds its layers, the layer's box reads against the
    // Button: at its origin, at its size. Where the row holds them, the
    // layer takes the Button's box in the row.
    for (const state of states) {
      expect(state.layer, log).toBe('""');
      expect(state.layerBox, log).toEqual(
        holds
          ? [0, 0, state.buttonBox[2], state.buttonBox[3]]
          : state.buttonBox,
      );
    }
  });
}

test("a finger on a row-target Button in a table row's second cell tints only the Button", async ({
  page,
}) => {
  const {driver, button} = await openRow(page);
  // The Button moves into the second cell of a positioned table row. The row
  // holds the press layers, but the Button's own offset parent is its cell.
  const cellIsOffsetParent = await button.evaluate(el => {
    const table = document.createElement('table');
    const row = table.insertRow();
    row.style.position = 'relative';
    const first = row.insertCell();
    first.style.padding = '12px';
    first.textContent = 'Earlier cell with some text';
    const second = row.insertCell();
    second.style.padding = '12px';
    el.parentElement?.before(table);
    second.append(el);
    return (el as HTMLElement).offsetParent === second;
  });
  expect(cellIsOffsetParent, 'the cell is the offset parent').toBe(true);
  const at = await buttonCenter(button);
  const {states, log} = await pressAndRead(
    page,
    button,
    [at],
    at,
    fingerHold(driver, at),
  );
  // The layer's box reads against its containing block, so both boxes are
  // turned into the viewport: the block's padding box comes from a hidden,
  // absolutely placed marker in the Button.
  const frame = await button.evaluate(el => {
    const marker = document.createElement('span');
    marker.style.cssText =
      'position:absolute;inset:0;visibility:hidden;pointer-events:none';
    el.append(marker);
    const block = marker.getBoundingClientRect();
    const isRow = marker.offsetParent === el.closest('tr');
    marker.remove();
    const own = el.getBoundingClientRect();
    return {
      isRow,
      origin: [block.left, block.top],
      buttonBox: [own.left, own.top, own.width, own.height].map(Math.round),
    };
  });
  expect(frame.isRow, log).toBe(true);
  for (const state of states) {
    expect(state.layer, log).toBe('""');
    const [left, top, width, height] = state.layerBox;
    expect(
      [
        Math.round(frame.origin[0] + left),
        Math.round(frame.origin[1] + top),
        width,
        height,
      ],
      log,
    ).toEqual(frame.buttonBox);
  }
});

test("a press leaves the Button's children as they were at rest, and its probe is hidden and gone at once", async ({
  page,
}) => {
  const {driver, button} = await openRow(page);
  const at = await buttonCenter(button);
  await button.evaluate(el => {
    const seen: ProbeSeen = {children: [el.innerHTML], added: [], removed: 0};
    // Each child the press adds, as the observer sees it after the press's
    // start has run.
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          const probe = node as HTMLElement;
          seen.added.push({
            hidden: probe.getAttribute('aria-hidden'),
            text: probe.textContent ?? '',
            pointerEvents: probe.style.pointerEvents,
            visibility: probe.style.visibility,
            tabIndex: probe.tabIndex,
            connected: probe.isConnected,
          });
        }
        seen.removed += record.removedNodes.length;
      }
    }).observe(el, {childList: true});
    // The children in each press state, read as it paints.
    new MutationObserver(() => {
      requestAnimationFrame(() => seen.children.push(el.innerHTML));
    }).observe(el, {attributes: true, attributeFilter: ['data-astryx-press']});
    (window as unknown as {__probe: ProbeSeen}).__probe = seen;
  });
  await fingerHold(driver, at)();
  await expect
    .poll(async () => button.getAttribute('data-astryx-press'))
    .toBeNull();
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  const seen = await page.evaluate(
    () => (window as unknown as {__probe: ProbeSeen}).__probe,
  );
  const log = JSON.stringify(seen);
  // At rest, then on, fading and released: the same children each time.
  expect(seen.children.length, log).toBeGreaterThanOrEqual(4);
  expect(new Set(seen.children).size, log).toBe(1);
  // One probe at the press's start: hidden, with no text, no hit and no
  // focus, and already removed when the observer runs.
  expect(seen.added, log).toEqual([
    {
      hidden: 'true',
      text: '',
      pointerEvents: 'none',
      visibility: 'hidden',
      tabIndex: -1,
      connected: false,
    },
  ]);
  expect(seen.removed, log).toBe(1);
});

/**
 * Moves the row into a scroll view that can scroll, so a press start reads
 * the view's scroll size to learn whether it waits out a scroll.
 */
async function intoScrollView(button: Locator): Promise<void> {
  await button.evaluate(el => {
    const row = el.parentElement;
    if (row == null) {
      throw new Error('the Button has no row');
    }
    const view = document.createElement('div');
    view.style.overflowY = 'auto';
    view.style.height = `${Math.ceil(row.getBoundingClientRect().height) + 40}px`;
    row.before(view);
    view.append(row);
    const filler = document.createElement('div');
    filler.style.height = '600px';
    view.append(filler);
  });
}

for (const where of ['Button', 'row'] as const) {
  test(`in a scroll view, a finger press on the ${where} forces one layout at its start, the placement's (Chromium)`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
    const {driver, button, probes} = await openRow(page);
    await intoScrollView(button);
    const at = where === 'Button' ? await buttonCenter(button) : probes[0];
    const trace = await traceRendering(
      page,
      async () => {
        await driver.play(tap(at, {holdMs: HOLD_MS}));
      },
      {keepEvents: true},
    );
    // A layout inside the pointerdown's own dispatch is forced by a read in
    // its handler.
    const main = trace.mainThread ?? [];
    const downs = main.filter(
      event =>
        event.name === 'EventDispatch' &&
        event.ph === 'X' &&
        (event.args?.data as {type?: string} | undefined)?.type ===
          'pointerdown',
    );
    const forced = main.filter(
      event =>
        event.name === 'Layout' &&
        downs.some(
          down => event.ts >= down.ts && event.ts <= down.ts + (down.dur ?? 0),
        ),
    );
    const record = JSON.stringify(
      layoutSources(trace, trace.window.from, trace.window.to),
    );
    expect(downs.length, record).toBe(1);
    expect(forced.length, record).toBe(1);
  });

  test(`the release of a finger press on the ${where} does no Layout or Paint per frame (Chromium)`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
    const {driver, button, probes} = await openRow(page);
    const at = where === 'Button' ? await buttonCenter(button) : probes[0];
    const exitMs = await button.evaluate(el => {
      const time = getComputedStyle(el)
        .getPropertyValue('--duration-exit')
        .trim();
      return time.endsWith('ms') ? parseFloat(time) : parseFloat(time) * 1000;
    });
    let release = {from: 0, to: 0};
    const trace = await traceRendering(page, async () => {
      const watch = await watchAnimations(button);
      await driver.play(tap(at, {holdMs: HOLD_MS}));
      [release] = await watch.started();
      await page.waitForTimeout(exitMs + 100);
    });
    // The steady part of the release: its first and last frames may commit.
    const during = countBetween(trace, release.from + 30, release.to - 30);
    expect(release.to - release.from, JSON.stringify(release)).toBeGreaterThan(
      60,
    );
    expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
    expect(during.Paint ?? 0, JSON.stringify(during)).toBe(0);
  });
}

test('a tap on the line under the Button activates the Button once', async ({
  page,
}) => {
  const {driver, button, probes} = await openRow(page);
  await expect(openedCount(page)).toHaveText('Opened: 0');
  await driver.tap(probes[0]);
  await expect
    .poll(async () => button.getAttribute('data-astryx-press'))
    .toBeNull();
  // Read once, after the press: a retried read could pass on its way to 2.
  expect(await openedCount(page).textContent()).toBe('Opened: 1');
});

test('a held press on the line under the Button, then the lift, activates the Button once', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'WebKit synthesises a click only from its own tap path, not from a raw touch sequence',
  );
  const {driver, button, probes} = await openRow(page);
  await expect(openedCount(page)).toHaveText('Opened: 0');
  await driver.play(tap(probes[0], {holdMs: HOLD_MS}));
  await expect
    .poll(async () => button.getAttribute('data-astryx-press'))
    .toBeNull();
  expect(await openedCount(page).textContent()).toBe('Opened: 1');
});

test.describe('under a fine primary pointer', () => {
  test.use({isMobile: false, hasTouch: false});

  /** What a held mouse press paints, read at the next frame. */
  const readHeld = async (button: Locator, probes: Point[]) =>
    button.evaluate(async (el, points) => {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const wrapper = el.querySelector(':scope > span') as HTMLElement;
      const rowTint = getComputedStyle(wrapper, '::before');
      const row = el.parentElement as HTMLElement;
      return {
        hits: points.map(
          point =>
            document.elementFromPoint(point.x, point.y)?.closest('button') ===
            el,
        ),
        rowTint: rowTint.content,
        rowTintBox: [
          rowTint.left,
          rowTint.top,
          rowTint.width,
          rowTint.height,
        ].map(value => Math.round(parseFloat(value))),
        rowBox: [0, 0, row.clientWidth, row.clientHeight],
        ownTint: getComputedStyle(el).backgroundImage,
      };
    }, probes);

  async function mouseHoldAndRead(
    page: Page,
    button: Locator,
    probes: Point[],
    at: Point,
  ) {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    const held = await readHeld(button, probes);
    await page.mouse.up();
    const released = await readHeld(button, probes);
    return {held, released, log: JSON.stringify({probes, at, held, released})};
  }

  test('a mouse press on the row outside the Button tints the row as one surface, and the Button shows no tint of its own', async ({
    page,
  }) => {
    const {button, probes} = await findRow(page);
    const {held, released, log} = await mouseHoldAndRead(
      page,
      button,
      probes,
      probes[0],
    );
    expect(held.hits, log).toEqual(probes.map(() => true));
    expect(held.rowTint, log).toBe('""');
    expect(held.rowTintBox, log).toEqual(held.rowBox);
    expect(held.ownTint, log).toBe('none');
    expect(released.rowTint, log).not.toBe('""');
  });

  test("a mouse press on the Button's own box tints only the Button", async ({
    page,
  }) => {
    const {button, probes} = await findRow(page);
    const at = await buttonCenter(button);
    const {held, log} = await mouseHoldAndRead(page, button, probes, at);
    expect(held.rowTint, log).not.toBe('""');
    expect(held.ownTint, log).toContain('gradient');
  });

  test('a mouse press on the row of a disabled Button tints nothing', async ({
    page,
  }) => {
    const {button, probes} = await findRow(page);
    await button.evaluate(el => {
      el.setAttribute('aria-disabled', 'true');
    });
    const {held, log} = await mouseHoldAndRead(page, button, probes, probes[0]);
    expect(held.rowTint, log).not.toBe('""');
    expect(held.ownTint, log).toBe('none');
  });

  test('a click on the line under the Button activates the Button once', async ({
    page,
  }) => {
    const {probes} = await findRow(page);
    await expect(openedCount(page)).toHaveText('Opened: 0');
    await page.mouse.click(probes[0].x, probes[0].y);
    await expect(openedCount(page)).toHaveText('Opened: 1');
  });
});

test.describe('under a fine primary pointer, with a finger', () => {
  // Touch input still reaches the page, and the primary pointer stays fine.
  test.use({isMobile: false, hasTouch: false});

  test('a finger press on the row tints only the row', async ({page}) => {
    const {button, probes} = await findRow(page);
    const driver = await touchDriver(page);
    const at = probes[0];
    const {states, log} = await pressAndRead(
      page,
      button,
      probes,
      at,
      fingerHold(driver, at),
    );
    // The row's tint shows while the finger is down. The Button's own tint
    // stays off through the press and its fade.
    expect(states[0].rowTint, log).toBe('""');
    expect(states[0].rowTintBox, log).toEqual(states[0].rowBox);
    for (const state of states) {
      expect(state.ownTint, log).toBe('none');
    }
    // The release fades the row's tint, as it fades every finger's press.
    expect(states[1].rowTint, log).toBe('""');
    expect(states[1].rowOpacity, log).toBe('0');
  });

  test("a finger press on the Button's own box tints only the Button", async ({
    page,
  }) => {
    const {button, probes} = await findRow(page);
    const driver = await touchDriver(page);
    const at = await buttonCenter(button);
    const {states, log} = await pressAndRead(
      page,
      button,
      probes,
      at,
      fingerHold(driver, at),
    );
    for (const state of states) {
      expect(state.rowTint, log).not.toBe('""');
    }
    expect(states[0].ownTint, log).toContain('gradient');
  });
});
