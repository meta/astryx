// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LightboxZoomModes.interaction.browser.spec.ts
 * @input The built "With zoom" Lightbox story with a 3000 × 2000 test photo.
 *   It uses the phone project's touch input, a desktop context with a mouse,
 *   and the interaction harness
 * @output Proofs for the zoom stage beyond the finger's model: a fine
 *   pointer, Reduce Motion, a mouse drag past the edge, and zoom off. Each
 *   test's name says what it proves
 * @position Interaction tests for Lightbox (browser), beside
 *   LightboxZoom.interaction.browser.spec.ts
 */

import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  advanceFrozenPage,
  armHold,
  curveOf,
  drag,
  flick,
  frames,
  freezePageOn,
  installPageFreeze,
  installTimerGate,
  openStory,
  pinch,
  releaseAnimations,
  sampleCurve,
  thawPage,
  timeline,
  touchDriver,
  type TouchScript,
  waitForRest,
  withStorybook,
} from '@astryxdesign/interaction-harness';
import {UIKIT_TAP} from '../../motion/uikit/gestures';
import {recordLiftOffset} from './liftOffset';

const storybook = withStorybook(test);

/** Where the photo shows: its transform, size and stage. */
async function readTransform(img: Locator) {
  return img.evaluate(el => {
    const style = getComputedStyle(el);
    const [x = '0', y = '0'] =
      style.translate === 'none' ? [] : style.translate.split(' ');
    const parent = el.parentElement as HTMLElement;
    const stage = parent.getBoundingClientRect();
    return {
      x: parseFloat(x),
      y: parseFloat(y),
      scale: style.scale === 'none' ? 1 : parseFloat(style.scale),
      width: (el as HTMLElement).offsetWidth,
      left: (el as HTMLElement).offsetLeft,
      stage: {
        x: stage.x + parent.clientLeft,
        y: stage.y + parent.clientTop,
        width: parent.clientWidth,
        height: parent.clientHeight,
      },
    };
  });
}

/** The story on a desktop: a fine pointer (a mouse), no touch. */
async function openDesktop(browser: Browser) {
  const context = await browser.newContext({
    viewport: {width: 1280, height: 800},
    hasTouch: false,
    isMobile: false,
  });
  const page = await context.newPage();
  // A fine primary pointer in this context (the interaction config can report
  // a coarse one without touch).
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(false);
  await routePhoto(page);
  await openStory(page, storybook(), 'core-lightbox--with-zoom');
  await page.getByRole('button', {name: 'Open with zoom'}).click();
  const dialog = page.getByRole('dialog', {name: 'Forest path'});
  await expect(dialog).toBeVisible();
  const img = dialog.getByRole('img', {name: 'Forest path'});
  await decoded(img);
  // Also the page's first contact with the curve recorder, so an animation a
  // test's first action starts is recorded however soon it ends.
  await waitForRest(img);
  await frames(page, 2);
  return {context, page, img, read: async () => readTransform(img)};
}

async function openPhone(page: Page, size = {width: 3000, height: 2000}) {
  await page.route('https://picsum.photos/**', async route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(size.width, size.height),
    }),
  );
  await openStory(page, storybook(), 'core-lightbox--with-zoom');
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Open with zoom'});
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  const dialog = page.getByRole('dialog', {name: 'Forest path'});
  await expect(dialog).toBeVisible();
  const img = dialog.getByRole('img', {name: 'Forest path'});
  await expect
    .poll(async () => img.evaluate(el => (el as HTMLImageElement).naturalWidth))
    .toBe(size.width);
  await waitForRest(img);
  await frames(page, 2);
  const read = async () => readTransform(img);
  return {driver, img, read};
}

function photoSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#fff"/><circle cx="${width / 2}" cy="${height / 2}" r="${height / 4}" fill="#d22"/></svg>`;
}

async function routePhoto(page: Page) {
  await page.route('https://picsum.photos/**', async route =>
    route.fulfill({contentType: 'image/svg+xml', body: photoSvg(3000, 2000)}),
  );
}

async function decoded(img: Locator) {
  await expect
    .poll(async () => img.evaluate(el => (el as HTMLImageElement).naturalWidth))
    .toBe(3000);
}

function doubleTap(at: {x: number; y: number}): TouchScript {
  return [
    {t: 0, fingers: [{id: 0, ...at}]},
    {t: 50, fingers: []},
    {t: 170, fingers: [{id: 0, ...at}]},
    {t: 220, fingers: []},
  ];
}

// A double tap whose second touch reaches the page past UIKit's interval
// between taps is two taps there: the play fails by name.
const DOUBLE_TAP = {
  boundaries: {tapIntervalMs: UIKIT_TAP.maximumIntervalBetweenTaps.value},
};

test('with a fine pointer (a desktop) the stage fills the viewer, as under a coarse pointer: its gestures take the whole viewer', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: {width: 1280, height: 800},
    hasTouch: false,
    isMobile: false,
  });
  try {
    const page = await context.newPage();
    await routePhoto(page);
    await openStory(page, storybook(), 'core-lightbox--with-zoom');
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await page.getByRole('button', {name: 'Open with zoom'}).click();
    const dialog = page.getByRole('dialog', {name: 'Forest path'});
    await expect(dialog).toBeVisible();
    const stage = dialog.getByRole('button', {name: 'Zoom'});
    const img = dialog.getByRole('img', {name: 'Forest path'});
    await decoded(img);
    await frames(page, 2);
    // The stage and its group stretch to fill the viewer for every pointer.
    // The zoom button is the stage's one page, the photo's box, and with no
    // caption it fills the stage. A click or a drag beside the photo is the
    // stage's, as a finger's is.
    const layout = await stage.evaluate(el => {
      const viewport = el.closest(
        '[data-lightbox-media] > :first-child',
      ) as HTMLElement;
      const own = getComputedStyle(viewport);
      const group = getComputedStyle(viewport.parentElement as HTMLElement);
      const v = viewport.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return {
        stage: [own.alignSelf, own.flexGrow],
        group: [group.alignSelf, group.flexGrow],
        button: [
          Math.round(b.width - v.width),
          Math.round(b.height - v.height),
        ],
      };
    });
    expect(layout.stage).toEqual(['stretch', '1']);
    expect(layout.group).toEqual(['stretch', '1']);
    expect(layout.button).toEqual([0, 0]);
    // The photo fits inside the viewer, as before.
    const imgBox = await img.boundingBox();
    if (imgBox == null) {
      throw new Error('no photo');
    }
    expect(imgBox.width).toBeLessThanOrEqual(1280);
    expect(imgBox.height).toBeLessThanOrEqual(800);
    expect(imgBox.width / imgBox.height).toBeCloseTo(1.5, 2);
  } finally {
    await context.close();
  }
});

test('under Reduce Motion a double tap cross-fades to its zoom instead of travelling', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await routePhoto(page);
  await openStory(page, storybook(), 'core-lightbox--with-zoom');
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Open with zoom'});
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  const dialog = page.getByRole('dialog', {name: 'Forest path'});
  await expect(dialog).toBeVisible();
  const img = dialog.getByRole('img', {name: 'Forest path'});
  await decoded(img);
  await waitForRest(img);
  await frames(page, 2);
  const rect = await img.boundingBox();
  if (rect == null) {
    throw new Error('no photo');
  }
  // Armed before the taps, so the fade is held as it starts. A hold sent
  // after them can come after a 200 ms fade ends on a loaded runner.
  const hold = await armHold(page, img, {
    judges: {target: img, property: 'opacity'},
  });
  await driver.play(
    doubleTap({x: rect.x + rect.width / 2, y: rect.y + rect.height / 2}),
    DOUBLE_TAP,
  );
  const held = await hold.held();
  const duration = Math.max(...held.map(a => a.curveEndMs));
  const samples = await sampleCurve(img, timeline(duration));
  await releaseAnimations(page);
  // The photo fades out and back in; the new scale lands while it is
  // transparent (design:reduced-motion DR1: no travel). DR2: on a touch
  // screen, a fade of 200 ms or less.
  const opacity = curveOf(samples, 'opacity').map(s => s.value);
  expect(Math.min(...opacity)).toBeLessThan(0.1);
  expect(duration).toBeLessThanOrEqual(205);
  // The landing is a timed write between the fade out and the fade back in,
  // with no animation running then. So wait for the photo to be opaque again.
  await expect
    .poll(async () =>
      img.evaluate(el => parseFloat(getComputedStyle(el).opacity)),
    )
    .toBe(1);
  expect(
    await img.evaluate(el => parseFloat(getComputedStyle(el).scale)),
  ).toBeGreaterThan(1.5);
});

test('with a mouse a zoomed drag follows the pointer and stops at the photo’s edge, with no give', async ({
  browser,
}) => {
  const {context, page, img, read} = await openDesktop(browser);
  try {
    const before = await read();
    const y = before.stage.y + before.stage.height / 2;
    const left = before.stage.x + 100;
    // 2x about the centre from the keyboard (a double-click zooms 2× about
    // the clicked point), with room to drag past an edge.
    await page
      .getByRole('dialog')
      .getByRole('button', {name: 'Zoom', exact: true})
      .focus();
    await page.keyboard.press('+');
    // On a loaded machine the keyboard's zoom can start and end with no page
    // frame between, where the recorder sees nothing. So the test waits for
    // the zoomed scale itself.
    await expect.poll(async () => (await read()).scale).toBeGreaterThan(1.5);
    await waitForRest(img);
    const zoomed = await read();
    expect(zoomed.scale).toBeGreaterThan(1.5);
    // The photo's left edge at the stage's: x is minus the fitted photo's
    // offset in the stage (0 where the stage hugs it).
    const edge = -(zoomed.stage.width - zoomed.width) / 2;
    // Right by 600 px: far past the photo's left edge.
    await page.mouse.move(left, y);
    await page.mouse.down();
    const xs: number[] = [];
    for (let i = 1; i <= 20; i += 1) {
      await page.mouse.move(left + i * 30, y);
      xs.push((await read()).x);
    }
    await page.mouse.up();
    // The give past the edge belongs to the touch presentation. The photo
    // follows the pointer to its edge and stays there.
    expect(xs.at(-1)).toBeCloseTo(edge, 1);
    expect(Math.max(...xs)).toBeLessThan(edge + 0.5);
    await waitForRest(img);
    expect((await read()).x).toBeCloseTo(edge, 1);
  } finally {
    await context.close();
  }
});

test('with a mouse the zoom-in cursor shows over the fitted photo, not over the dark area beside it, as on main', async ({
  browser,
}) => {
  const {context, page, img, read} = await openDesktop(browser);
  try {
    const {stage} = await read();
    const photo = await img.boundingBox();
    if (photo == null) {
      throw new Error('no photo');
    }
    // The fitted photo leaves dark stage on its left, where a click closes.
    expect(photo.x - stage.x).toBeGreaterThan(20);
    const cursorAt = async (x: number, y: number) => {
      await page.mouse.move(x, y);
      return img.evaluate(
        el => getComputedStyle(el.parentElement as HTMLElement).cursor,
      );
    };
    const y = photo.y + photo.height / 2;
    expect(await cursorAt(stage.x + 20, y)).toBe('default');
    expect(await cursorAt(photo.x + photo.width / 2, y)).toBe('zoom-in');
    expect(await cursorAt(stage.x + 20, y)).toBe('default');
  } finally {
    await context.close();
  }
});

test('with a mouse a zoomed drag follows the pointer’s whole travel from the press, with no lasting offset', async ({
  browser,
}) => {
  const {context, page, img, read} = await openDesktop(browser);
  try {
    // 2x about the centre from the keyboard, with room to drag both ways.
    await page
      .getByRole('dialog')
      .getByRole('button', {name: 'Zoom', exact: true})
      .focus();
    await page.keyboard.press('+');
    // On a loaded machine the keyboard's zoom can start and end with no page
    // frame between, where the recorder sees nothing. So the test waits for
    // the zoomed scale itself.
    await expect.poll(async () => (await read()).scale).toBeGreaterThan(1.5);
    await waitForRest(img);
    const zoomed = await read();
    expect(zoomed.scale).toBeGreaterThan(1.5);
    const press = {
      x: zoomed.stage.x + zoomed.stage.width / 2,
      y: zoomed.stage.y + zoomed.stage.height / 2,
    };
    await page.mouse.move(press.x, press.y);
    await page.mouse.down();
    // Small steps from the press. Main's drag moved the photo by the
    // pointer's whole travel from the press.
    for (let i = 1; i <= 10; i += 1) {
      await page.mouse.move(press.x + i * 4, press.y + i * 3);
      if (i === 1) {
        // The first 5 px move already pans: a finger's 10 px threshold
        // does not apply to a mouse.
        const first = await read();
        expect(first.x - zoomed.x).toBeCloseTo(4, 0);
        expect(first.y - zoomed.y).toBeCloseTo(3, 0);
      }
    }
    const moved = await read();
    await page.mouse.up();
    expect(moved.x - zoomed.x).toBeCloseTo(40, 0);
    expect(moved.y - zoomed.y).toBeCloseTo(30, 0);
  } finally {
    await context.close();
  }
});

test('under Reduce Motion, + then - pressed mid-fade leave the photo at full opacity, also after reopening', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  // The freeze has to be in the page before the story loads, and it needs
  // the timer gate too.
  await installPageFreeze(page);
  const {img} = await openPhone(page);
  await installTimerGate(page);
  const dialog = page.getByRole('dialog', {name: 'Forest path'});
  const opacity = async () =>
    img.evaluate(el => parseFloat(getComputedStyle(el).opacity));
  await dialog.getByRole('button', {name: 'Zoom'}).focus();
  // The scene freezes in the first key's own task, before the page handles
  // it. So the cross-fade the key starts is held at its start, however late
  // this process reacts and however few frames a loaded runner draws.
  await freezePageOn(page, 'keydown');
  await page.keyboard.press('+');
  // Moved on by its own clock, the frozen scene stands in the dip.
  await advanceFrozenPage(page, MID_DIP_MS);
  const dip = await opacity();
  if (!(dip < 0.9)) {
    throw new Error(
      `The first key started no cross-fade: ${MID_DIP_MS} ms on, the photo stands at opacity ${dip}`,
    );
  }
  // The second key lands mid-dip.
  await page.keyboard.press('-');
  await thawPage(page);
  await waitForRest(img);
  expect(await opacity()).toBeCloseTo(1, 3);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', {name: 'Open with zoom'}).click();
  await expect(dialog).toBeVisible();
  await waitForRest(img);
  await frames(page, 2);
  expect(await opacity()).toBeCloseTo(1, 3);
});

/**
 * Where the Reduce Motion plus-then-minus case stops the first key's
 * cross-fade, ms: halfway through its fade out, which lasts 100 ms.
 */
const MID_DIP_MS = 50;

test('with zoom off, a tap on the dark area around the photo closes the viewer on a touch screen', async ({
  page,
}) => {
  await routePhoto(page);
  await openStory(page, storybook(), 'core-lightbox--default');
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Open lightbox'});
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const img = dialog.getByRole('img');
  await decoded(img);
  await frames(page, 2);
  const photo = await img.boundingBox();
  const viewport = page.viewportSize();
  if (photo == null || viewport == null) {
    throw new Error('no photo');
  }
  // Below the photo: the dark area, not a stage stretched over it.
  await driver.tap({
    x: photo.x + photo.width / 2,
    y: Math.min(photo.y + photo.height + 80, viewport.height - 20),
  });
  await expect(dialog).toBeHidden();
});

test('under Reduce Motion a keyboard zoom with a fine pointer completes at once', async ({
  browser,
}) => {
  // design:reduced-motion DR3: on any pointer but a coarse one, at once.
  const context = await browser.newContext({
    viewport: {width: 1280, height: 800},
    hasTouch: false,
    isMobile: false,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    // A fine primary pointer in this context (the interaction config can report
    // a coarse one without touch).
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await routePhoto(page);
    await openStory(page, storybook(), 'core-lightbox--with-zoom');
    await page.getByRole('button', {name: 'Open with zoom'}).click();
    const dialog = page.getByRole('dialog', {name: 'Forest path'});
    await expect(dialog).toBeVisible();
    const img = dialog.getByRole('img', {name: 'Forest path'});
    await decoded(img);
    await frames(page, 2);
    await dialog.getByRole('button', {name: 'Zoom'}).focus();
    await page.keyboard.press('+');
    await frames(page, 1);
    const now = await img.evaluate(el => ({
      running: el.getAnimations().filter(a => a.playState === 'running').length,
      scale: parseFloat(getComputedStyle(el).scale),
      opacity: parseFloat(getComputedStyle(el).opacity),
    }));
    expect(now.running).toBe(0);
    expect(now.scale).toBeGreaterThan(1.5);
    expect(now.opacity).toBe(1);
  } finally {
    await context.close();
  }
});

test('under Reduce Motion a pinch released past the maximum settles in place, with no travel', async ({
  page,
}) => {
  // design:reduced-motion DR1–DR2: what a release starts fades; it never
  // moves or scales on its way back.
  await page.emulateMedia({reducedMotion: 'reduce'});
  // The freeze has to be in the page before the story loads, and it needs
  // the timer gate too.
  await installPageFreeze(page);
  // A small photo: its maximum zoom (under 4.5x at any pixel ratio) is
  // well within the pinch's 10x.
  const {driver, img, read} = await openPhone(page, {width: 300, height: 200});
  await installTimerGate(page);
  const s = await read();
  const centre = {
    x: s.stage.x + s.stage.width / 2,
    y: s.stage.y + s.stage.height / 2,
  };
  let released = 1;
  // The scene stops in the lift's own task, before the viewer hears the lift.
  // The fade then starts held, however late this process reacts. A hold sent
  // after the lift can come after a 200 ms fade ends on a loaded runner.
  await freezePageOn(page, 'touchend');
  const hold = await armHold(page, img, {
    judges: {target: img, property: 'opacity'},
  });
  await driver.play(
    pinch({
      center: centre,
      fromDistance: 60,
      toDistance: 600,
      durationMs: 400,
      restMs: 80,
    }),
    {
      onEvent: async step => {
        if (step.type === 'touchMove') {
          released = (await read()).scale;
        }
      },
    },
  );
  const held = await hold.held();
  expect(held.length).toBeGreaterThan(0);
  const duration = Math.max(...held.map(a => a.curveEndMs));
  const opacity = curveOf(
    await sampleCurve(img, timeline(duration)),
    'opacity',
  ).map(x => x.value);
  await releaseAnimations(page);
  await thawPage(page);
  // It fades out and back in while the scale lands at the maximum,
  // transparent: no travel back.
  expect(duration).toBeLessThanOrEqual(205);
  expect(Math.min(...opacity)).toBeLessThan(0.1);
  // The scale lands in a timed write while the photo is transparent: wait
  // for it, then for the photo to be opaque again.
  await expect.poll(async () => (await read()).scale).toBeLessThan(released);
  await expect
    .poll(async () =>
      img.evaluate(el => parseFloat(getComputedStyle(el).opacity)),
    )
    .toBe(1);
  expect((await read()).scale).toBeGreaterThan(1.5);
});

/** The photo's box and its stage's, in page px. */
async function edges(img: Locator) {
  return img.evaluate(el => {
    const photo = el.getBoundingClientRect();
    const stage = (el.parentElement as HTMLElement).getBoundingClientRect();
    return {
      photo: {left: photo.left, right: photo.right},
      stage: {left: stage.left, right: stage.right},
    };
  });
}

test('under Reduce Motion a zoomed flick coasts on and settles at the edge, as on iOS', async ({
  page,
}) => {
  // Momentum that continues a throw is the person's own movement, so under
  // Reduce Motion it still coasts and settles at an edge, with no cross-fade.
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, img, read} = await openPhone(page);
  const s = await read();
  const mid = {
    x: s.stage.x + s.stage.width / 2,
    y: s.stage.y + s.stage.height / 2,
  };
  await driver.play(doubleTap(mid), DOUBLE_TAP);
  await waitForRest(img);
  await frames(page, 2);
  const liftOffset = await recordLiftOffset(img);
  await driver.play(flick(mid, {velocity: {x: -1500, y: 0}, durationMs: 80}));
  const opacities = await img.evaluate(
    async el =>
      new Promise<number[]>(resolve => {
        const seen: number[] = [];
        const start = performance.now();
        const tick = (now: number) => {
          seen.push(parseFloat(getComputedStyle(el).opacity));
          if (now - start < 600) {
            requestAnimationFrame(tick);
          } else {
            resolve(seen);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  await waitForRest(img);
  // It coasted on past where the finger lifted.
  expect((await read()).x).toBeLessThan((await liftOffset()) - 20);
  // No cross-fade.
  expect(Math.min(...opacities)).toBe(1);
  // It rests with no gap at the stage's edges.
  const {photo, stage} = await edges(img);
  expect(photo.left).toBeLessThanOrEqual(stage.left + 0.5);
  expect(photo.right).toBeGreaterThanOrEqual(stage.right - 0.5);
});

test('under Reduce Motion a zoomed photo pulled past its edge settles back to it', async ({
  page,
}) => {
  // The coast's settle at an edge (DR2): released still past the edge, the
  // photo returns to it instead of staying out.
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, img, read} = await openPhone(page);
  const s = await read();
  const mid = {
    x: s.stage.x + s.stage.width / 2,
    y: s.stage.y + s.stage.height / 2,
  };
  await driver.play(doubleTap(mid), DOUBLE_TAP);
  await waitForRest(img);
  await frames(page, 2);
  // One slow drag right across the stage: the photo, centred and zoomed,
  // moves until its left edge reaches the stage's, then gives past it.
  const zoomed = await edges(img);
  let pastAtLift = Number.NaN;
  await driver.play(
    drag(
      {x: zoomed.stage.left + 6, y: mid.y},
      {x: zoomed.stage.right - 6, y: mid.y},
      {durationMs: 600, restMs: 150},
    ),
    {
      onEvent: async step => {
        if (step.type === 'touchEnd') {
          const now = await edges(img);
          pastAtLift = now.photo.left - now.stage.left;
        }
      },
    },
  );
  expect(pastAtLift).toBeGreaterThan(10);
  await waitForRest(img);
  const {photo, stage} = await edges(img);
  expect(photo.left).toBeLessThanOrEqual(stage.left + 0.5);
});
